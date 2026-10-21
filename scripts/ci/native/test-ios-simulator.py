"""Offline orchestration tests. Actual CoreSimulator readiness requires Mac CI."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('simulator', Path(__file__).with_name('ios-simulator.py'))
sim = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sim)
# Real simctl output is uppercase; xcodebuild rejects lowercased destinations.
DEVICE = '0A97AFC2-3920-48D8-AA04-79320FA82098'
RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-4'
PINNED_RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-2'
TOOLCHAIN_ENV = {'DEVELOPER_DIR': '/Applications/Xcode_26.3.app/Contents/Developer',
                 'ELY_IOS_XCODE_VERSION': '26.3', 'ELY_IOS_XCODE_BUILD': '17C529',
                 'ELY_IOS_SDK_VERSION': '26.2'}
RUNTIME_ENV = {'ELY_IOS_RUNTIME_ID': PINNED_RUNTIME, 'ELY_IOS_RUNTIME_VERSION': '26.2'}


def inventory():
    return {'runtimes': [{'identifier': RUNTIME, 'version': '26.4.1', 'isAvailable': True,
                         'supportedDeviceTypes': [{'identifier': sim.DEVICE_TYPE}]}],
            'devices': {RUNTIME: [{'udid': 'image-owned', 'isAvailable': True,
                                   'deviceTypeIdentifier': sim.DEVICE_TYPE}]}}


def pinned_inventory():
    data = inventory()
    data['runtimes'].append(dict(data['runtimes'][0], identifier=PINNED_RUNTIME,
                                 version='26.2', buildversion='recorded-runtime-build'))
    return data


class SimulatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.output = self.root / 'output'
        self.patch = patch.object(sim, 'OUTPUT', self.root)
        self.patch.start()
        self.env = patch.dict(os.environ, {'GITHUB_OUTPUT': str(self.output)}, clear=True)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.patch.stop()
        self.temp.cleanup()

    def mock_run(self, command, filename, timeout=15, required=True):
        if command == ['xcodebuild', '-version']:
            return 'Xcode 26.3\nBuild version 17C529\n'
        if command == ['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-version']:
            return '26.2\n'
        if command[1:3] == ['simctl', 'list']:
            return json.dumps(inventory())
        if command[1:3] == ['simctl', 'create']:
            return DEVICE
        if command[1:3] == ['simctl', 'bootstatus']:
            self.assertEqual(json.loads((self.root / 'created-device.json').read_text())['udid'], DEVICE)
            self.assertFalse(self.output.exists(), 'Must not publish readiness before boot completes')
            self.assertEqual(timeout, 300)
        return ''

    def mock_pinned_run(self, command, *args, **kwargs):
        if command[1:3] == ['simctl', 'list']:
            return json.dumps(pinned_inventory())
        return self.mock_run(command, *args, **kwargs)

    def assert_no_device_activity(self, run):
        commands = [call.args[0] for call in run.call_args_list]
        self.assertFalse(any(c[1:3] in (['simctl', 'create'], ['simctl', 'bootstatus']) for c in commands))
        self.assertFalse(self.output.exists())
        self.assertFalse((self.root / 'created-device.json').exists())
        self.assertFalse((self.root / 'device-id.txt').exists())

    def test_prepare_uses_exact_pin_instead_of_newest_and_records_build(self):
        with patch.dict(os.environ, {**TOOLCHAIN_ENV, **RUNTIME_ENV, 'GITHUB_ACTIONS': 'true'}):
            with patch.object(sim, 'run', side_effect=self.mock_pinned_run) as run:
                sim.prepare()
        create = next(call.args[0] for call in run.call_args_list if call.args[0][1:3] == ['simctl', 'create'])
        self.assertEqual(create[-2:], [sim.DEVICE_TYPE, PINNED_RUNTIME])
        selection = json.loads((self.root / 'selection.json').read_text())
        self.assertEqual(selection['requested_runtime_id'], PINNED_RUNTIME)
        self.assertEqual(selection['requested_runtime_version'], '26.2')
        self.assertEqual(selection['runtime']['buildversion'], 'recorded-runtime-build')
        self.assertEqual(self.output.read_text(), f'device_id={DEVICE}\n')

    def test_prepare_rejects_unusable_pin_without_device_activity(self):
        mutations = {
            'missing': lambda d: d['runtimes'].pop(),
            'unavailable': lambda d: d['runtimes'][-1].update(isAvailable=False),
            'wrong-version': lambda d: d['runtimes'][-1].update(version='26.2.1'),
            'wrong-hardware': lambda d: d['runtimes'][-1].update(supportedDeviceTypes=[]),
            'ambiguous': lambda d: d['runtimes'].append(dict(d['runtimes'][-1])),
            'unknown-compatibility': lambda d: d['runtimes'][-1].pop('supportedDeviceTypes'),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                data = pinned_inventory()
                mutate(data)
                def rejected(command, *args, **kwargs):
                    if command[1:3] == ['simctl', 'list']:
                        return json.dumps(data)
                    return self.mock_run(command, *args, **kwargs)
                with patch.dict(os.environ, {**TOOLCHAIN_ENV, **RUNTIME_ENV, 'GITHUB_ACTIONS': 'true'}):
                    with patch.object(sim, 'run', side_effect=rejected) as run:
                        with self.assertRaises(RuntimeError):
                            sim.prepare()
                self.assert_no_device_activity(run)

    def test_prepare_rejects_incomplete_or_non_ios_pin_without_device_activity(self):
        for pin in ({}, {'ELY_IOS_RUNTIME_ID': PINNED_RUNTIME},
                    {'ELY_IOS_RUNTIME_VERSION': '26.2'},
                    {**RUNTIME_ENV, 'ELY_IOS_RUNTIME_ID': ''},
                    {**RUNTIME_ENV, 'ELY_IOS_RUNTIME_VERSION': ''},
                    {**RUNTIME_ENV, 'ELY_IOS_RUNTIME_ID': PINNED_RUNTIME + ' '},
                    {**RUNTIME_ENV, 'ELY_IOS_RUNTIME_ID': 'com.apple.CoreSimulator.SimRuntime.tvOS-26-2'}):
            with self.subTest(pin=pin):
                with patch.dict(os.environ, {**TOOLCHAIN_ENV, **pin, 'GITHUB_ACTIONS': 'true'}):
                    with patch.object(sim, 'run', side_effect=self.mock_pinned_run) as run:
                        with self.assertRaises(RuntimeError):
                            sim.prepare()
                self.assert_no_device_activity(run)

    def test_explicit_incompatibility_cannot_be_overridden_by_registered_device(self):
        data = inventory()
        data['runtimes'][0]['supportedDeviceTypes'] = []
        with self.assertRaises(RuntimeError):
            sim.select(data, sim.DEVICE_TYPE, RUNTIME, '26.4.1')

    def test_pinned_older_inventory_uses_compatibility_only(self):
        data = inventory()
        del data['runtimes'][0]['supportedDeviceTypes']
        self.assertEqual(sim.select(data, sim.DEVICE_TYPE, RUNTIME, '26.4.1')['identifier'], RUNTIME)
        data['devices'][RUNTIME][0]['isAvailable'] = False
        with self.assertRaises(RuntimeError):
            sim.select(data, sim.DEVICE_TYPE, RUNTIME, '26.4.1')

    def test_toolchain_pin_rejects_missing_empty_and_different_values(self):
        environments = [{}, *({k: v for k, v in TOOLCHAIN_ENV.items() if k != missing} for missing in TOOLCHAIN_ENV)]
        environments += [dict(TOOLCHAIN_ENV, **{key: value}) for key, value in
                         [('DEVELOPER_DIR', ''), ('ELY_IOS_XCODE_VERSION', ''),
                          ('ELY_IOS_XCODE_BUILD', ''), ('ELY_IOS_SDK_VERSION', ''),
                          ('ELY_IOS_XCODE_VERSION', '26.6'), ('ELY_IOS_XCODE_BUILD', '17F113'),
                          ('ELY_IOS_SDK_VERSION', '26.5')]]
        for env in environments:
            with self.subTest(env=env):
                with patch.dict(os.environ, {**env, **RUNTIME_ENV, 'GITHUB_ACTIONS': 'true'}):
                    with patch.object(sim, 'run', side_effect=self.mock_pinned_run) as run:
                        with self.assertRaises(RuntimeError):
                            sim.prepare()
                self.assert_no_device_activity(run)

    def test_missing_pinned_toolchain_command_never_falls_back(self):
        def failure(command, *args, **kwargs):
            if command == ['xcodebuild', '-version']:
                raise sim.CommandFailure(command, 1)
            return self.mock_pinned_run(command, *args, **kwargs)
        with patch.dict(os.environ, {**TOOLCHAIN_ENV, **RUNTIME_ENV, 'GITHUB_ACTIONS': 'true'}):
            with patch.object(sim, 'run', side_effect=failure) as run:
                with self.assertRaises(sim.CommandFailure):
                    sim.prepare()
        self.assert_no_device_activity(run)

    def test_toolchain_records_worker_source_and_actual_inventory_commands(self):
        metadata = {'RUNNER_NAME': 'fresh-worker', 'RUNNER_ARCH': 'ARM64', 'ImageVersion': 'actual-image',
                    'GITHUB_RUN_ID': 'run', 'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_SHA': 'merge',
                    'ELY_IOS_SOURCE_SHA': 'source'}
        with patch.dict(os.environ, {**TOOLCHAIN_ENV, **metadata, 'GITHUB_ACTIONS': 'true'}):
            with patch.object(sim, 'run', side_effect=self.mock_run) as run:
                sim.verify_toolchain()
        runner = json.loads((self.root / 'runner.json').read_text())
        self.assertTrue(metadata.items() <= runner.items())
        commands = [call.args[0] for call in run.call_args_list]
        for command in (['git', 'rev-parse', 'HEAD', 'HEAD^{tree}'], ['sw_vers'], ['uname', '-m']):
            self.assertIn(command, commands)
    def help_calls(self, calls):
        """Return the `simctl help` captures recorded by the mocked run()."""
        return [call for call in calls if call.args[0][1:3] == ['simctl', 'help']]

    def test_ready_creates_explicit_clean_device(self):
        with patch.object(sim, 'run', side_effect=self.mock_run) as run:
            sim.prepare()
        self.assertEqual(self.output.read_text(), f'device_id={DEVICE}\n')
        self.assertEqual((self.root / 'device-id.txt').read_text(), DEVICE + '\n')
        self.assertIn(['xcrun', 'simctl', 'bootstatus', DEVICE, '-b'],
                      [call.args[0] for call in run.call_args_list])
        create = next(call.args[0] for call in run.call_args_list if call.args[0][1:3] == ['simctl', 'create'])
        self.assertEqual(create[-2:], [sim.DEVICE_TYPE, RUNTIME])
        self.assertTrue(create[3].startswith('ElyCI-'))
        self.assertTrue(json.loads((self.root / 'created-device.json').read_text())['owned'])

    def test_boot_failure_and_timeout_collect_and_cleanup_without_publish(self):
        for code in (7, 124):
            with self.subTest(code=code):
                (self.root / 'created-device.json').unlink(missing_ok=True)
                def failure(command, *args, **kwargs):
                    if command[1:3] == ['simctl', 'bootstatus']:
                        self.mock_run(command, *args, **kwargs)
                        raise sim.CommandFailure(command, code)
                    return self.mock_run(command, *args, **kwargs)
                with patch.object(sim, 'run', side_effect=failure) as run:
                    with self.assertRaises(sim.CommandFailure) as caught:
                        sim.prepare()
                self.assertEqual(caught.exception.code, code)
                self.assertFalse(self.output.exists())
                commands = [call.args[0] for call in run.call_args_list]
                self.assertIn(['xcrun', 'simctl', 'delete', DEVICE], commands)
                self.assertTrue(any(c[1:3] == ['simctl', 'spawn'] for c in commands))
                self.assertFalse(any('image-owned' in c for c in commands))
                self.assertEqual(sum(c[1:3] == ['simctl', 'bootstatus'] for c in commands), 1)

    def test_pinned_ci_boot_failure_and_timeout_cleanup_owned_device(self):
        for code in (7, 124):
            with self.subTest(code=code):
                (self.root / 'created-device.json').unlink(missing_ok=True)
                def failure(command, *args, **kwargs):
                    if command[1:3] == ['simctl', 'bootstatus']:
                        self.mock_run(command, *args, **kwargs)
                        raise sim.CommandFailure(command, code)
                    return self.mock_pinned_run(command, *args, **kwargs)
                with patch.dict(os.environ, {**TOOLCHAIN_ENV, **RUNTIME_ENV, 'GITHUB_ACTIONS': 'true'}):
                    with patch.object(sim, 'run', side_effect=failure) as run:
                        with self.assertRaises(sim.CommandFailure) as caught:
                            sim.prepare()
                self.assertEqual(caught.exception.code, code)
                self.assertFalse(self.output.exists())
                commands = [call.args[0] for call in run.call_args_list]
                create = next(c for c in commands if c[1:3] == ['simctl', 'create'])
                self.assertEqual(create[-2:], [sim.DEVICE_TYPE, PINNED_RUNTIME])
                self.assertEqual(commands.count(['xcrun', 'simctl', 'bootstatus', DEVICE, '-b']), 1)
                self.assertEqual(commands.count(['xcrun', 'simctl', 'shutdown', DEVICE]), 1)
                self.assertEqual(commands.count(['xcrun', 'simctl', 'delete', DEVICE]), 1)
                self.assertTrue(any(c[1:3] == ['simctl', 'spawn'] for c in commands))
                self.assertFalse(any('image-owned' in c for c in commands))
                self.assertFalse(json.loads((self.root / 'created-device.json').read_text())['owned'])

    def test_cleanup_no_record_is_noop(self):
        with patch.object(sim, 'run') as run:
            sim.cleanup()
        run.assert_not_called()

    def test_cleanup_is_owned_only_and_idempotent(self):
        sim.save_state({'owned': True, 'udid': DEVICE})
        with patch.object(sim, 'run', return_value='') as run:
            sim.cleanup()
            sim.cleanup()
        self.assertEqual(run.call_count, 2)
        self.assertEqual(run.call_args.args[0], ['xcrun', 'simctl', 'delete', DEVICE])

    def test_cleanup_rejects_invalid_id(self):
        sim.save_state({'owned': True, 'udid': 'all'})
        with patch.object(sim, 'run') as run:
            with self.assertRaises(ValueError):
                sim.cleanup()
        run.assert_not_called()

    def test_cleanup_failure_keeps_ownership_for_workflow_retry(self):
        sim.save_state({'owned': True, 'udid': DEVICE})
        with patch.object(sim, 'run', side_effect=sim.CommandFailure('delete', 7)):
            with self.assertRaises(sim.CommandFailure):
                sim.cleanup()
        self.assertTrue(json.loads((self.root / 'created-device.json').read_text())['owned'])

    def test_deterministic_latest_available_compatible_runtime(self):
        data = inventory()
        data['runtimes'] += [dict(data['runtimes'][0], identifier=RUNTIME + '-old', version='18.6'),
                             dict(data['runtimes'][0], identifier=RUNTIME + '-future', version='99.0', isAvailable=False),
                             dict(data['runtimes'][0], identifier=RUNTIME + '-other', version='28.0', supportedDeviceTypes=[])]
        self.assertEqual(sim.select(data, sim.DEVICE_TYPE)['identifier'], RUNTIME)
        data['runtimes'].reverse()
        self.assertEqual(sim.select(data, sim.DEVICE_TYPE)['identifier'], RUNTIME)

    def test_older_inventory_schema_uses_compatibility_only(self):
        data = inventory()
        del data['runtimes'][0]['supportedDeviceTypes']
        self.assertEqual(sim.select(data, sim.DEVICE_TYPE)['identifier'], RUNTIME)

    def test_no_supported_runtime_fails_closed(self):
        for data in ({}, {'runtimes': inventory()['runtimes'], 'devices': {}}):
            with self.assertRaises(RuntimeError):
                sim.select(data, 'nonexistent-hardware')

    def test_bounded_command_retains_partial_output_and_timeout(self):
        start = time.monotonic()
        with self.assertRaises(sim.CommandFailure) as error:
            # The bound must exceed interpreter startup on a loaded runner,
            # otherwise the child is killed before it can print anything.
            sim.run([sys.executable, '-u', '-c', 'import time; print("partial"); time.sleep(10)'], 'hang.log', timeout=1.0)
        self.assertEqual(error.exception.code, 124)
        self.assertLess(time.monotonic() - start, 3)
        self.assertEqual((self.root / 'hang.log').read_text(), 'partial\n')
        self.assertEqual(json.loads((self.root / 'commands.jsonl').read_text())['exit'], 124)

    def test_diagnostic_timeout_does_not_stop_remaining_diagnostics(self):
        with patch.object(sim, 'run', return_value='') as run:
            sim.diagnostics(DEVICE)
        self.assertEqual(run.call_count, 3)
        self.assertTrue(all(call.kwargs['required'] is False for call in run.call_args_list))

    def test_secondary_failures_preserve_original_boot_exit(self):
        def failure(command, *args, **kwargs):
            if command[1:3] == ['simctl', 'bootstatus']:
                raise sim.CommandFailure(command, 7)
            if command[1:3] == ['simctl', 'spawn']:
                raise OSError('diagnostic launch failed')
            if command[1:3] == ['simctl', 'delete']:
                raise sim.CommandFailure(command, 9)
            return self.mock_run(command, *args, **kwargs)
        with patch.object(sim, 'run', side_effect=failure):
            with self.assertRaises(sim.CommandFailure) as error:
                sim.prepare()
        self.assertEqual(error.exception.code, 7)
        self.assertFalse(self.output.exists())

    def test_timeout_kills_child_processes(self):
        marker = self.root / 'orphan-marker'
        child = f'import time; from pathlib import Path; time.sleep(0.5); Path({str(marker)!r}).touch()'
        parent = f'import subprocess, sys, time; subprocess.Popen([sys.executable, "-c", {child!r}]); time.sleep(10)'
        sim.run([sys.executable, '-c', parent], 'children.log', timeout=0.15, required=False)
        time.sleep(0.6)
        self.assertFalse(marker.exists(), 'Timed-out descendants must not survive the command')

    def test_required_command_failure(self):
        with self.assertRaises(sim.CommandFailure) as error:
            sim.run([sys.executable, '-c', 'raise SystemExit(7)'], 'fail.log')
        self.assertEqual(error.exception.code, 7)

    def test_help_captures_are_non_gating_with_a_longer_bound(self):
        """The four help captures are evidence only; they must never abort prepare()."""
        with patch.object(sim, 'run', side_effect=self.mock_run) as run:
            sim.prepare()
        calls = run.call_args_list
        helps = self.help_calls(calls)
        self.assertEqual(len(helps), 4)
        for call in helps:
            self.assertIs(call.kwargs.get('required'), False,
                          'simctl help captures must not gate preparation')
            self.assertEqual(call.kwargs.get('timeout'), sim.HELP_TIMEOUT)
            self.assertGreater(call.kwargs.get('timeout'), 15,
                               'A cold simctl start needs more than the default bound')
        # Preparation still reached the real gates and published the device.
        commands = [call.args[0] for call in calls]
        self.assertIn(['xcrun', 'simctl', 'list', '-j'], commands)
        self.assertIn(['xcrun', 'simctl', 'bootstatus', DEVICE, '-b'], commands)
        self.assertEqual(self.output.read_text(), f'device_id={DEVICE}\n')

    def test_help_timeout_does_not_abort_prepare(self):
        """A timed-out help capture (exit 124) must not stop preparation."""
        original = sim.run
        def failing_help(command, filename, timeout=15, required=True):
            if command[1:3] == ['simctl', 'help']:
                # Use the real runner with a tiny bound so the exit-124 timeout
                # path, the process-group kill and the audit trail are real.
                return original([sys.executable, '-c', 'import time; time.sleep(10)'],
                                filename, timeout=0.5, required=required)
            return self.mock_run(command, filename, timeout=timeout, required=required)
        with patch.object(sim, 'run', side_effect=failing_help) as run:
            sim.prepare()
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(len(self.help_calls(run.call_args_list)), 4)
        for call in self.help_calls(run.call_args_list):
            self.assertIs(call.kwargs.get('required'), False)
        self.assertIn(['xcrun', 'simctl', 'list', '-j'], commands)
        self.assertTrue(any(c[1:3] == ['simctl', 'create'] for c in commands))
        self.assertIn(['xcrun', 'simctl', 'bootstatus', DEVICE, '-b'], commands)
        self.assertEqual(self.output.read_text(), f'device_id={DEVICE}\n')
        # The timeout path still recorded exit 124 for every help capture.
        recorded = [json.loads(line) for line in
                    (self.root / 'commands.jsonl').read_text().splitlines()]
        self.assertEqual(len(recorded), 4)
        self.assertTrue(all(record['exit'] == 124 for record in recorded))

    def test_help_non_zero_exit_does_not_abort_prepare(self):
        """A non-zero help exit must not stop preparation either."""
        original = sim.run
        def failing_help(command, filename, timeout=15, required=True):
            if command[1:3] == ['simctl', 'help']:
                # The real runner records the exit but does not raise because
                # the capture is non-gating.
                return original([sys.executable, '-c', 'raise SystemExit(3)'],
                                filename, timeout=timeout, required=required)
            return self.mock_run(command, filename, timeout=timeout, required=required)
        with patch.object(sim, 'run', side_effect=failing_help) as run:
            sim.prepare()
        commands = [call.args[0] for call in run.call_args_list]
        self.assertIn(['xcrun', 'simctl', 'bootstatus', DEVICE, '-b'], commands)
        self.assertEqual(self.output.read_text(), f'device_id={DEVICE}\n')
        recorded = [json.loads(line) for line in
                    (self.root / 'commands.jsonl').read_text().splitlines()]
        self.assertEqual(len(recorded), 4)
        self.assertTrue(all(record['exit'] == 3 for record in recorded))

    def test_required_inventory_failure_still_aborts_without_publishing(self):
        """Required gates stay fail-closed: the original exit code surfaces."""
        def failing_list(command, filename, timeout=15, required=True):
            if command[1:3] == ['simctl', 'list']:
                raise sim.CommandFailure(command, 6)
            return self.mock_run(command, filename, timeout=timeout, required=required)
        with patch.object(sim, 'run', side_effect=failing_list) as run:
            with self.assertRaises(sim.CommandFailure) as caught:
                sim.prepare()
        self.assertEqual(caught.exception.code, 6)
        self.assertFalse(self.output.exists(), 'A failed inventory gate must not publish device_id')
        commands = [call.args[0] for call in run.call_args_list]
        self.assertFalse(any(c[1:3] == ['simctl', 'create'] for c in commands))
        self.assertFalse((self.root / 'created-device.json').exists())

    def test_boot_gate_timeout_bound_is_300_and_cleanup_runs(self):
        """The boot bound stays exactly 300s and a boot failure still cleans up."""
        def failing_boot(command, filename, timeout=15, required=True):
            if command[1:3] == ['simctl', 'bootstatus']:
                self.assertEqual(timeout, 300)
                self.mock_run(command, filename, timeout=timeout, required=required)
                raise sim.CommandFailure(command, 124)
            return self.mock_run(command, filename, timeout=timeout, required=required)
        with patch.object(sim, 'run', side_effect=failing_boot) as run:
            with self.assertRaises(sim.CommandFailure) as caught:
                sim.prepare()
        self.assertEqual(caught.exception.code, 124)
        self.assertFalse(self.output.exists())
        commands = [call.args[0] for call in run.call_args_list]
        self.assertIn(['xcrun', 'simctl', 'delete', DEVICE], commands)
        self.assertEqual(sum(c[1:3] == ['simctl', 'bootstatus'] for c in commands), 1)
        # The owned device is released only after a successful delete.
        self.assertFalse(json.loads((self.root / 'created-device.json').read_text())['owned'])

    def test_non_gating_timeout_records_124_and_kills_the_process_group(self):
        """A non-gating capture keeps the exit-124 contract and group kill."""
        marker = self.root / 'orphan-marker'
        # The descendant must outlive the bound to prove the group kill works.
        child = f'import time; from pathlib import Path; time.sleep(3); Path({str(marker)!r}).touch()'
        parent = f'import subprocess, sys, time; subprocess.Popen([sys.executable, "-c", {child!r}]); print("partial"); time.sleep(10)'
        # required=False must not raise even though the command times out.
        sim.run([sys.executable, '-u', '-c', parent], 'nongating.log', timeout=1.0, required=False)
        time.sleep(3.5)
        self.assertFalse(marker.exists(), 'Timed-out descendants must not survive the command')
        self.assertEqual((self.root / 'nongating.log').read_text(), 'partial\n')
        recorded = [json.loads(line) for line in
                    (self.root / 'commands.jsonl').read_text().splitlines()]
        self.assertEqual(recorded[-1]['exit'], 124)


if __name__ == '__main__':
    unittest.main()
