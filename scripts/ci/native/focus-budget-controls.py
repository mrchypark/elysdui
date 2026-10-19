#!/usr/bin/env python3
"""Run exact JVM positives and one designated classification reversal, without a device."""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RESULTS = ROOT / "test-results/android-native/focus-budget-controls"
SOURCE = Path("test-support/dev/ely/nativeprofile/FocusObservationBudget.kt")
SUITE = "dev.ely.nativeprofile.FocusObservationBudgetTest"
DESIGNATED = "innerBudgetExhaustionIsReadinessFailureWithOriginalCause"
ANCHOR = """        if (cause is FocusObservationBudgetExceeded) {
            throw AssertionError("Window focus observation exceeded ${timeoutMillis}ms: ${cause.phase}", cause)
        }
"""
REPLACEMENT = ""  # Retain the original ExecutionException; remove only its typed normalization.
EXPECTED = {
    DESIGNATED, "zeroBudgetBeforePostingIsDistinctFromAnUnansweredPostedProbe",
    "outerDeadlineIsReadinessFailureAndRetainsTimeoutCause", "unrelatedWorkerFailureRemainsExecutionFailure",
    "nestedTimeoutIsNotMistakenForTheOuterDeadline", "cancelledObservationRemainsCancelled",
    "successfulObservationRetainsItsValue", "interruptedObservationRemainsInterrupted",
}


def main():
    RESULTS.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, str(Path(__file__).with_name("test-focus-diagnostics.py"))], check=True)
    source = (ROOT / "adapters/android" / SOURCE).read_text()
    assert source.count(ANCHOR) == 1
    proofs = []
    with tempfile.TemporaryDirectory(prefix="ely-focus-budget-") as temporary:
        checkout = Path(temporary) / "adapters/android"
        shutil.copytree(ROOT / "adapters/android", checkout,
                        ignore=shutil.ignore_patterns(".gradle", "build", "local.properties"))
        # The protocol task declares these relative fixture inputs even for JVM-only filters.
        shutil.copytree(ROOT / "contracts/native/profile-v1/fixtures", Path(temporary) / "contracts/native/profile-v1/fixtures")
        for mode in ("control", "classification-removed"):
            body = source if mode == "control" else source.replace(ANCHOR, REPLACEMENT)
            (checkout / SOURCE).write_text(body)
            selected = SUITE if mode == "control" else f"{SUITE}.{DESIGNATED}"
            command = [str(checkout / "gradlew"), "--no-daemon", "-PprotocolOnly", ":protocol:test", "--tests", selected, "--rerun-tasks"]
            report = checkout / f"protocol/build/test-results/test/TEST-{SUITE}.xml"
            report.unlink(missing_ok=True)
            result = subprocess.run(command, cwd=checkout, capture_output=True, timeout=600)
            out = RESULTS / mode
            out.mkdir(exist_ok=True)
            (out / "stdout.log").write_bytes(result.stdout)
            (out / "stderr.log").write_bytes(result.stderr)
            (out / "exit.json").write_text(json.dumps({"exit": result.returncode, "command": command}) + "\n")
            shutil.copy2(report, out / "tests.xml")
            suite = ET.parse(report).getroot()
            cases = suite.findall("testcase")
            assert suite.attrib["name"] == SUITE
            assert all(case.attrib["classname"] == SUITE for case in cases)
            assert len(cases) == (len(EXPECTED) if mode == "control" else 1)
            assert int(suite.attrib["tests"]) == len(cases)
            assert {c.attrib["name"] for c in cases} == (EXPECTED if mode == "control" else {DESIGNATED})
            assert suite.attrib["errors"] == "0" and suite.attrib["skipped"] == "0"
            if mode == "control":
                assert result.returncode == 0 and suite.attrib["failures"] == "0"
                assert all(not list(c) for c in cases)
            else:
                assert result.returncode != 0 and suite.attrib["failures"] == "1"
                failures = cases[0].findall("failure")
                assert len(failures) == 1
                assert failures[0].attrib["type"] == "java.lang.AssertionError"
                detail = failures[0].attrib.get("message", "") + (failures[0].text or "")
                assert "java.lang.AssertionError" in detail and "java.util.concurrent.ExecutionException" in detail
                assert "FocusObservationBudgetExceeded" in detail
            proofs.append({"mode": mode, "sourceSHA256": hashlib.sha256(body.encode()).hexdigest(),
                           "exit": result.returncode, "tests": len(cases), "failures": int(suite.attrib["failures"])})
    identity = {name: subprocess.check_output(["git", "rev-parse", revision], cwd=ROOT, text=True).strip()
                for name, revision in (("revision", "HEAD"), ("tree", "HEAD^{tree}"))}
    (RESULTS / "summary.json").write_text(json.dumps({**identity, "anchorCount": 1, "designated": DESIGNATED, "proofs": proofs}, indent=2) + "\n")
    print("Focus budget JVM controls: eight positives; exact classification reversal killed by the designated cause-preservation assertion.")


if __name__ == "__main__":
    main()
