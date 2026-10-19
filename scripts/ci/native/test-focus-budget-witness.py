#!/usr/bin/env python3
"""Replay genuine archived JVM bytes, then corrupt one acceptance witness at a time."""
import copy
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("focus_controls", Path(__file__).with_name("focus-budget-controls.py"))
controls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controls)
FIXTURE = json.loads((Path(__file__).parent / "fixtures/focus-budget-witness.json").read_text())
SOURCE = (controls.ROOT / "adapters/android" / controls.SOURCE).read_text()
TEST_SOURCE = (controls.ROOT / "adapters/android" / controls.TEST_SOURCE).read_text()
MUTANT = SOURCE.replace(controls.ANCHOR, controls.REPLACEMENT)


def verify(mode, record):
    return controls.validate_witness(mode, SOURCE if mode == "control" else MUTANT, TEST_SOURCE,
                                     record["xml"].encode(), record["stdout"].encode(),
                                     record["stderr"].encode(), record["exit"])


class FocusBudgetWitnessTest(unittest.TestCase):
    def test_genuine_archived_positives_and_reversal(self):
        provenance = FIXTURE["provenance"]
        self.assertEqual(SOURCE.count(controls.ANCHOR), 1)
        for body, field in [(SOURCE, "sourceSHA256"), (MUTANT, "mutantSHA256"), (TEST_SOURCE, "testSourceSHA256")]:
            self.assertEqual(hashlib.sha256(body.encode()).hexdigest(), provenance[field])
        for mode, record in FIXTURE["records"].items():
            for field in ["xml", "stdout", "stderr"]:
                self.assertEqual(hashlib.sha256(record[field].encode()).hexdigest(), provenance["recordSHA256"][mode][field])
            witness = verify(mode, record)
            self.assertEqual(len(witness["cases"]), 8 if mode == "control" else 1)
        self.assertEqual(verify("classification-removed", FIXTURE["records"]["classification-removed"])["kind"], "typed-normalization-reversal")

    def test_mutant_corruptions_are_rejected(self):
        variants = ["token-salad", "wrong-phase", "missing-chain", "wrong-assertion-site", "wrong-root",
                    "extra-skipped", "extra-error", "wrong-immediate-cause", "message-stack-disagreement",
                    "compile-failure", "extra-child", "declared-count", "duplicate-case", "wrong-class",
                    "wrong-case", "wrong-suite", "wrong-failure-type", "exit-zero", "missing-compile",
                    "compile-up-to-date", "contradictory-success", "missing-test-summary", "wrong-failed-task",
                    "wrong-helper-site", "wrong-cause-site", "reordered-chain", "extra-cause", "suppressed",
                    "missing-failure", "wrong-failure-count", "declared-skipped", "declared-error",
                    "other-failed-task", "duplicate-failed-build", "malformed-failed-task", "malformed-failed-build"]
        for variant in variants:
            with self.subTest(variant=variant):
                record = copy.deepcopy(FIXTURE["records"]["classification-removed"])
                root = ET.fromstring(record["xml"])
                case = root.find("testcase")
                failure = case.find("failure")
                if variant == "token-salad":
                    failure.set("message", "java.lang.AssertionError unrelated java.util.concurrent.ExecutionException FocusObservationBudgetExceeded")
                    failure.text = failure.attrib["message"]
                elif variant == "wrong-phase":
                    failure.set("message", failure.attrib["message"].replace("after posting", "before posting"))
                    failure.text = failure.text.replace("after posting", "before posting")
                elif variant == "missing-chain": failure.text = failure.attrib["message"]
                elif variant == "wrong-assertion-site": failure.text = failure.text.replace("FocusObservationBudgetTest.kt:17)", "FocusObservationBudgetTest.kt:18)")
                elif variant == "wrong-root": root.tag = "unrelated"
                elif variant == "extra-skipped": ET.SubElement(case, "skipped")
                elif variant == "extra-error": ET.SubElement(case, "error")
                elif variant == "wrong-immediate-cause": failure.text = failure.text.replace("Caused by: java.util.concurrent.ExecutionException:", "Caused by: java.lang.IllegalStateException:")
                elif variant == "message-stack-disagreement": failure.text = "unrelated assertion\n" + failure.text
                elif variant == "compile-failure": record["stdout"] = record["stdout"].replace("> Task :protocol:compileTestKotlin\n", "> Task :protocol:compileTestKotlin FAILED\n")
                elif variant == "extra-child": ET.SubElement(case, "unrelated")
                elif variant == "declared-count": root.set("tests", "2")
                elif variant == "duplicate-case": root.append(copy.deepcopy(case))
                elif variant == "wrong-class": case.set("classname", "wrong.Class")
                elif variant == "wrong-case": case.set("name", "wrongCase")
                elif variant == "wrong-suite": root.set("name", "wrong.Suite")
                elif variant == "wrong-failure-type": failure.set("type", "java.lang.IllegalStateException")
                elif variant == "exit-zero": record["exit"] = 0
                elif variant == "missing-compile": record["stdout"] = record["stdout"].replace("> Task :protocol:compileTestKotlin\n", "")
                elif variant == "compile-up-to-date": record["stdout"] = record["stdout"].replace("> Task :protocol:compileTestKotlin\n", "> Task :protocol:compileTestKotlin UP-TO-DATE\n")
                elif variant == "contradictory-success": record["stdout"] += "\nBUILD SUCCESSFUL in 1s\n"
                elif variant == "missing-test-summary": record["stderr"] = record["stderr"].replace("1 test completed, 1 failed", "")
                elif variant == "wrong-failed-task": record["stderr"] = record["stderr"].replace("Execution failed for task ':protocol:test'.", "Execution failed for task ':protocol:compileTestKotlin'.")
                elif variant == "wrong-helper-site": failure.text = failure.text.replace("FocusObservationBudget.kt:19)", "FocusObservationBudget.kt:20)")
                elif variant == "wrong-cause-site": failure.text = failure.text.replace("FocusObservationBudgetTest.kt:15)", "FocusObservationBudgetTest.kt:16)")
                elif variant == "reordered-chain":
                    parts = failure.text.split("\nCaused by: "); failure.text = "\nCaused by: ".join([parts[0], parts[2], parts[1]])
                elif variant == "extra-cause": failure.text += "\nCaused by: java.lang.IllegalStateException: unrelated"
                elif variant == "suppressed": failure.text += "\nSuppressed: java.lang.IllegalStateException: unrelated"
                elif variant == "missing-failure": case.remove(failure)
                elif variant == "wrong-failure-count": root.set("failures", "0")
                elif variant == "declared-skipped": root.set("skipped", "1")
                elif variant == "declared-error": root.set("errors", "1")
                elif variant == "other-failed-task": record["stdout"] += "\n> Task :protocol:compileJava FAILED\n"
                elif variant == "duplicate-failed-build": record["stdout"] += "\nBUILD FAILED in 1s\n"
                elif variant == "malformed-failed-task": record["stdout"] += "\n> Task :protocol:compileJava FAILED (unexpected detail)\n"
                elif variant == "malformed-failed-build": record["stdout"] += "\nBUILD FAILED unexpected detail\n"
                record["xml"] = ET.tostring(root).decode()
                with self.assertRaises((AssertionError, KeyError, ValueError)):
                    verify("classification-removed", record)

    def test_positive_corruptions_are_rejected(self):
        for variant in ["duplicate", "missing", "skipped-child", "error-child", "declared-count", "wrong-class",
                        "wrong-root", "nonzero", "missing-compile", "failed-build", "nested-testcase"]:
            with self.subTest(variant=variant):
                record = copy.deepcopy(FIXTURE["records"]["control"])
                root = ET.fromstring(record["xml"]); case = root.find("testcase")
                if variant == "duplicate": root.append(copy.deepcopy(case))
                elif variant == "missing": root.remove(case)
                elif variant == "skipped-child": ET.SubElement(case, "skipped")
                elif variant == "error-child": ET.SubElement(case, "error")
                elif variant == "declared-count": root.set("tests", "9")
                elif variant == "wrong-class": case.set("classname", "wrong.Class")
                elif variant == "wrong-root": root.tag = "unrelated"
                elif variant == "nonzero": record["exit"] = 1
                elif variant == "missing-compile": record["stdout"] = record["stdout"].replace("> Task :protocol:compileKotlin\n", "")
                elif variant == "failed-build": record["stderr"] += "\nFAILURE: unrelated build failure\n"
                elif variant == "nested-testcase": ET.SubElement(root, "properties").append(copy.deepcopy(case))
                record["xml"] = ET.tostring(root).decode()
                with self.assertRaises((AssertionError, KeyError, ValueError)):
                    verify("control", record)

    def test_main_requires_fresh_xml_and_unchanged_compiled_inputs(self):
        for variant in ["genuine", "missing-xml", "changed-helper", "changed-tests"]:
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as temporary:
                calls = []
                original_run = subprocess.run
                def run(command, **kwargs):
                    if command[0] == "git": return original_run(command, **kwargs)
                    if not str(command[0]).endswith("/gradlew"):
                        return subprocess.CompletedProcess(command, 0)
                    checkout = Path(kwargs["cwd"])
                    mode = "control" if not calls else "classification-removed"
                    report = checkout / f"protocol/build/test-results/test/TEST-{controls.SUITE}.xml"
                    self.assertFalse(report.exists(), "Each invocation must remove prior XML")
                    calls.append(mode)
                    record = FIXTURE["records"][mode]
                    if not (variant == "missing-xml" and mode != "control"):
                        report.parent.mkdir(parents=True, exist_ok=True)
                        report.write_text(record["xml"])
                    if mode != "control" and variant in ["changed-helper", "changed-tests"]:
                        path = checkout / (controls.SOURCE if variant == "changed-helper" else controls.TEST_SOURCE)
                        path.write_text(path.read_text() + "\n// changed during invocation\n")
                    return subprocess.CompletedProcess(command, record["exit"], record["stdout"].encode(), record["stderr"].encode())
                results = Path(temporary) / "results"
                with patch.object(controls, "RESULTS", results), patch.object(controls.subprocess, "run", run):
                    if variant == "genuine": controls.main()
                    else:
                        with self.assertRaises((AssertionError, FileNotFoundError)): controls.main()
                self.assertEqual(calls, ["control", "classification-removed"])
                self.assertEqual((results / "summary.json").exists(), variant == "genuine")


if __name__ == "__main__":
    unittest.main()
