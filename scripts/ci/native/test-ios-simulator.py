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


def inventory():
    return {'runtimes': [{'identifier': RUNTIME, 'version': '26.4.1', 'isAvailable': True,
                         'supportedDeviceTypes': [{'identifier': sim.DEVICE_TYPE}]}],
            'devices': {RUNTIME: [{'udid': 'image-owned', 'isAvailable': True,
                                   'deviceTypeIdentifier': sim.DEVICE_TYPE}]}}


class SimulatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.output = self.root / 'output'
        self.patch = patch.object(sim, 'OUTPUT', self.root)
        self.patch.start()
        self.env = patch.dict(os.environ, {'GITHUB_OUTPUT': str(self.output)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.patch.stop()
        self.temp.cleanup()

    def mock_run(self, command, filename, timeout=15, required=True):
        if command[1:3] == ['simctl', 'list']:
            return json.dumps(inventory())
        if command[1:3] == ['simctl', 'create']:
            return DEVICE
        if command[1:3] == ['simctl', 'bootstatus']:
            self.assertEqual(json.loads((self.root / 'created-device.json').read_text())['udid'], DEVICE)
            self.assertFalse(self.output.exists(), 'Must not publish readiness before boot completes')
            self.assertEqual(timeout, 300)
        return ''

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
            sim.run([sys.executable, '-u', '-c', 'import time; print("partial"); time.sleep(10)'], 'hang.log', timeout=0.1)
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


if __name__ == '__main__':
    unittest.main()
