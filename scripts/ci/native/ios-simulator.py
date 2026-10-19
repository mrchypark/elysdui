"""Create one clean CI simulator. Never retry tests or mutate image-owned devices."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid

OUTPUT = Path(os.environ.get('ELY_IOS_DIAGNOSTICS_DIR', '/tmp/ely-ios-diagnostics'))
DEVICE_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro'


class CommandFailure(RuntimeError):
    def __init__(self, command, code):
        super().__init__(f'{command} exited {code}')
        self.code = code


def run(command, filename, timeout=15, required=True):
    """Bound the entire command process group, including diagnostic commands."""
    start = time.monotonic()
    with (OUTPUT / filename).open('w') as output, (OUTPUT / (filename + '.stderr')).open('w') as error:
        process = subprocess.Popen(command, stdout=output, stderr=error, start_new_session=True)
        try:
            code = process.wait(timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            code = 124
    with (OUTPUT / 'commands.jsonl').open('a') as log:
        log.write(json.dumps({'command': command, 'exit': code,
                              'elapsed_seconds': round(time.monotonic() - start, 2)}) + '\n')
    if code and required:
        raise CommandFailure(command, code)
    return (OUTPUT / filename).read_text()


def select(inventory, device_type, runtime_id=None, runtime_version=None):
    """Use an exact runtime pin, or the newest compatible runtime when unpinned."""
    runtimes = inventory.get('runtimes', [])
    pinned = runtime_id is not None or runtime_version is not None
    if pinned:
        if not runtime_id or not runtime_version:
            raise RuntimeError('Runtime pin requires nonempty ELY_IOS_RUNTIME_ID and ELY_IOS_RUNTIME_VERSION')
        runtimes = [runtime for runtime in runtimes if runtime.get('identifier') == runtime_id]
        if len(runtimes) != 1:
            raise RuntimeError(f'Pinned runtime {runtime_id} is missing or ambiguous; refusing a runtime fallback')
        if runtimes[0].get('version') != runtime_version:
            raise RuntimeError(f'Pinned runtime {runtime_id} version differs from {runtime_version}; refusing a runtime fallback')
    candidates = []
    for runtime in runtimes:
        if not runtime.get('isAvailable') or not runtime['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-'):
            continue
        supported = {item['identifier'] for item in runtime.get('supportedDeviceTypes', [])}
        # Older simctl JSON omits supportedDeviceTypes. A device already registered
        # to this runtime is compatibility evidence; its data is never reused.
        if 'supportedDeviceTypes' not in runtime:
            supported.update(d.get('deviceTypeIdentifier') for d in inventory.get('devices', {}).get(runtime['identifier'], []) if d.get('isAvailable'))
        if device_type in supported:
            version = tuple(int(v) for v in runtime['version'].split('.'))
            candidates.append((version, runtime['identifier'], runtime))
    if not candidates:
        raise RuntimeError(f'No available iOS runtime supports {device_type}' +
                           (f' with pin {runtime_id}' if pinned else '') +
                           '; refusing a hardware/runtime fallback')
    return max(candidates, key=lambda item: (item[0], item[1]))[2]


def verify_toolchain():
    """Record the real worker/source and reject toolchain drift before any build."""
    keys = ('ImageOS', 'ImageVersion', 'RUNNER_NAME', 'RUNNER_OS', 'RUNNER_ARCH',
            'DEVELOPER_DIR', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA',
            'ELY_IOS_SOURCE_SHA', 'ELY_IOS_XCODE_VERSION', 'ELY_IOS_XCODE_BUILD',
            'ELY_IOS_SDK_VERSION', 'ELY_IOS_RUNTIME_ID', 'ELY_IOS_RUNTIME_VERSION')
    (OUTPUT / 'runner.json').write_text(json.dumps({key: os.environ.get(key) for key in keys}, indent=2) + '\n')
    run(['git', 'rev-parse', 'HEAD', 'HEAD^{tree}'], 'checkout.txt')
    run(['sw_vers'], 'macos-version.txt')
    run(['uname', '-m'], 'architecture.txt')
    version = run(['xcodebuild', '-version'], 'xcode-version.txt').strip()
    sdk = run(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-version'], 'sdk-version.txt').strip()
    pins = [os.environ.get(key) for key in ('ELY_IOS_XCODE_VERSION', 'ELY_IOS_XCODE_BUILD', 'ELY_IOS_SDK_VERSION')]
    if os.environ.get('GITHUB_ACTIONS') == 'true' or any(value is not None for value in pins):
        if not all(pins) or not os.environ.get('DEVELOPER_DIR'):
            raise RuntimeError('CI toolchain requires explicit DEVELOPER_DIR and nonempty Xcode version/build and SDK pins')
        if version.splitlines() != [f'Xcode {pins[0]}', f'Build version {pins[1]}'] or sdk != pins[2]:
            raise RuntimeError(f'Pinned Xcode/SDK mismatch: got {version!r}, SDK {sdk!r}; refusing a toolchain fallback')


def save_state(state):
    temporary = OUTPUT / 'created-device.json.tmp'
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(OUTPUT / 'created-device.json')


def diagnostics(device):
    run(['xcrun', 'simctl', 'list', '-j'], 'devices-after.json', required=False)
    run(['xcrun', 'simctl', 'spawn', device, 'log', 'show', '--last', '5m', '--style', 'compact',
         '--predicate', 'process == "locationd" OR eventMessage CONTAINS "Migrator"'],
        'simulator-migration.log', required=False)
    run(['log', 'show', '--last', '5m', '--style', 'compact', '--predicate',
         'process == "CoreSimulatorService"'], 'coresimulator.log', required=False)


def cleanup():
    path = OUTPUT / 'created-device.json'
    if not path.exists():
        return
    state = json.loads(path.read_text())
    if not state.get('owned'):
        return
    device = state['udid']
    uuid.UUID(device)  # Validate, but preserve simctl's case-sensitive destination ID.
    run(['xcrun', 'simctl', 'shutdown', device], 'shutdown.log', required=False)
    run(['xcrun', 'simctl', 'delete', device], 'delete.log')
    state['owned'] = False
    save_state(state)


def prepare():
    if (OUTPUT / 'created-device.json').exists():
        raise RuntimeError('Existing ownership record: clean it up before preparing another simulator')
    verify_toolchain()
    for command in ('create', 'bootstatus', 'spawn', 'delete'):
        run(['xcrun', 'simctl', 'help', command], command + '-help.txt')
    inventory = json.loads(run(['xcrun', 'simctl', 'list', '-j'], 'inventory-before.json'))
    device_type = os.environ.get('ELY_IOS_DEVICE_TYPE', DEVICE_TYPE)
    runtime_id = os.environ.get('ELY_IOS_RUNTIME_ID')
    runtime_version = os.environ.get('ELY_IOS_RUNTIME_VERSION')
    if os.environ.get('GITHUB_ACTIONS') == 'true' and (runtime_id is None or runtime_version is None):
        raise RuntimeError('CI requires explicit ELY_IOS_RUNTIME_ID and ELY_IOS_RUNTIME_VERSION; refusing a runtime fallback')
    runtime = select(inventory, device_type, runtime_id, runtime_version)
    name = 'ElyCI-' + str(uuid.uuid4())
    selection = {'name': name, 'device_type': device_type, 'runtime': runtime,
                 'requested_runtime_id': runtime_id, 'requested_runtime_version': runtime_version}
    (OUTPUT / 'selection.json').write_text(json.dumps(selection, indent=2) + '\n')
    print(f'Creating {name}: {device_type}, {runtime["identifier"]}', flush=True)
    device = run(['xcrun', 'simctl', 'create', name, device_type, runtime['identifier']], 'create.log').strip()
    uuid.UUID(device)  # xcodebuild destination matching requires simctl's spelling.
    save_state({'udid': device, 'name': name, 'owned': True})
    (OUTPUT / 'device-id.txt').write_text(device + '\n')
    try:
        run(['xcrun', 'simctl', 'bootstatus', device, '-b'], 'bootstatus.log', timeout=300)
    except BaseException:
        # Preserve the boot failure even if diagnostics/cleanup also fail.
        try:
            diagnostics(device)
        except Exception as error:
            print(f'Diagnostics failed: {error}', file=sys.stderr)
        finally:
            try:
                cleanup()
            except Exception as error:
                print(f'Cleanup failed: {error}', file=sys.stderr)
        raise
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'device_id={device}\n')


def main():
    def interrupted(signum, frame):
        raise KeyboardInterrupt(f'Interrupted by signal {signum}')
    signal.signal(signal.SIGTERM, interrupted)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    try:
        {'prepare': prepare, 'cleanup': cleanup, 'verify-toolchain': verify_toolchain}[sys.argv[1]]()
    except Exception as error:
        print(error, file=sys.stderr)
        return getattr(error, 'code', 1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
