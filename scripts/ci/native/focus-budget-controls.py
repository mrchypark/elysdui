#!/usr/bin/env python3
"""Run exact JVM positives and one designated classification reversal, without a device."""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RESULTS = ROOT / "test-results/android-native/focus-budget-controls"
SOURCE = Path("test-support/dev/ely/nativeprofile/FocusObservationBudget.kt")
TEST_SOURCE = Path("protocol/src/test/kotlin/dev/ely/nativeprofile/FocusObservationBudgetTest.kt")
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


def source_line(source, statement):
    lines = [index for index, line in enumerate(source.splitlines(), 1) if line.strip() == statement]
    assert len(lines) == 1, f"Expected one source statement: {statement}"
    return lines[0]


def validate_witness(mode, body, test_source, xml, stdout, stderr, exit_code):
    """Join the exact XML result to compiled-task and source-owned causal witnesses."""
    assert mode in ("control", "classification-removed")
    suite = ET.fromstring(xml)
    assert suite.tag == "testsuite" and suite.attrib["name"] == SUITE
    assert all(child.tag in {"properties", "testcase", "system-out", "system-err"} for child in suite)
    cases = suite.findall("testcase")
    assert list(suite.iter("testcase")) == cases
    assert not list(suite.iter("error")) and not list(suite.iter("skipped"))
    names = [case.attrib["name"] for case in cases]
    expected = EXPECTED if mode == "control" else {DESIGNATED}
    assert len(cases) == len(expected) == len(set(names))
    assert set(names) == expected and int(suite.attrib["tests"]) == len(cases)
    assert all(case.attrib["classname"] == SUITE for case in cases)
    assert suite.attrib["errors"] == "0" and suite.attrib["skipped"] == "0"
    output, errors = stdout.decode("utf-8"), stderr.decode("utf-8")
    tasks = re.findall(r"^> Task :protocol:(compileKotlin|compileTestKotlin|test)(?: ([A-Z-]+))?$", output, re.MULTILINE)
    assert tasks == [("compileKotlin", ""), ("compileTestKotlin", ""), ("test", "" if mode == "control" else "FAILED")]
    assert "Compilation error" not in output + errors
    assert "compileKotlin FAILED" not in output and "compileTestKotlin FAILED" not in output
    witness = {"compiledTasks": [name for name, _ in tasks], "cases": sorted(names)}
    if mode == "control":
        assert exit_code == 0 and suite.attrib["failures"] == "0"
        assert all(not list(case) for case in cases) and not list(suite.iter("failure"))
        assert len(re.findall(r"^BUILD SUCCESSFUL in .+$", output, re.MULTILINE)) == 1
        assert "FAILED" not in output + errors and "FAILURE:" not in output + errors
        witness["kind"] = "compiled-eight-positive-cases"
    else:
        assert exit_code == 1 and suite.attrib["failures"] == "1"
        assert len(list(cases[0])) == 1 and cases[0][0].tag == "failure"
        failure = cases[0][0]
        assert list(suite.iter("failure")) == [failure] and not list(failure)
        assert failure.attrib["type"] == "java.lang.AssertionError"
        phase = "after posting main-thread probe"
        typed = f"dev.ely.nativeprofile.FocusObservationBudgetExceeded: Window focus observation budget exhausted: {phase}"
        execution = f"java.util.concurrent.ExecutionException: {typed}"
        message = f"java.lang.AssertionError: Expected an exception of class java.lang.AssertionError to be thrown, but was {execution}"
        assert failure.attrib["message"] == message
        sections = (failure.text or "").strip().split("\nCaused by: ")
        assert len(sections) == 3 and [section.splitlines()[0] for section in sections] == [message, execution, typed]
        assert "Suppressed:" not in (failure.text or "")
        assertion_line = source_line(test_source, 'val failure = assertFailsWith<AssertionError> { awaitFocusObservation(sample, 350, 350) }')
        cause_line = source_line(test_source, 'val cause = FocusObservationBudgetExceeded("after posting main-thread probe")')
        get_line = source_line(body, 'sample.get(remainingMillis, TimeUnit.MILLISECONDS)')
        frames = [re.findall(r"^\s+at (?:app//)?(dev\.ely\.nativeprofile\.[^\n]+)$", section, re.MULTILINE) for section in sections]
        assert frames == [
            [f"{SUITE}.{DESIGNATED}(FocusObservationBudgetTest.kt:{assertion_line})"],
            [f"dev.ely.nativeprofile.FocusObservationBudgetKt.awaitFocusObservation(FocusObservationBudget.kt:{get_line})"],
            [f"{SUITE}.{DESIGNATED}(FocusObservationBudgetTest.kt:{cause_line})"],
        ]
        assert re.findall(r"^\S+ > .* FAILED$", output, re.MULTILINE) == [f"FocusObservationBudgetTest > {DESIGNATED} FAILED"]
        assert f"    java.lang.AssertionError at FocusObservationBudgetTest.kt:{assertion_line}" in output
        assert f"        Caused by: java.util.concurrent.ExecutionException at FocusObservationBudgetTest.kt:{assertion_line}" in output
        assert f"            Caused by: dev.ely.nativeprofile.FocusObservationBudgetExceeded at FocusObservationBudgetTest.kt:{cause_line}" in output
        assert re.findall(r"^\d+ tests? completed.*$", errors, re.MULTILINE) == ["1 test completed, 1 failed"]
        assert re.findall(r"Execution failed for task '([^']+)'\.", errors) == [":protocol:test"]
        assert [line for line in (output + errors).splitlines() if line.startswith("> Task ") and "FAILED" in line] == ["> Task :protocol:test FAILED"]
        assert len(re.findall(r"^BUILD FAILED in .+$", output + errors, re.MULTILINE)) == 1
        assert len([line for line in (output + errors).splitlines() if line.startswith("BUILD FAILED")]) == 1
        assert "BUILD SUCCESSFUL" not in output + errors
        witness.update(kind="typed-normalization-reversal", phase=phase, assertionLine=assertion_line,
                       causeLine=cause_line, helperGetLine=get_line, failureMessage=message)
    return witness


def main():
    RESULTS.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, str(Path(__file__).with_name("test-focus-diagnostics.py"))], check=True)
    subprocess.run([sys.executable, str(Path(__file__).with_name("test-focus-budget-witness.py"))], check=True)
    source = (ROOT / "adapters/android" / SOURCE).read_text()
    test_source = (ROOT / "adapters/android" / TEST_SOURCE).read_text()
    assert source.count(ANCHOR) == 1
    for path, body in ((SOURCE, source), (TEST_SOURCE, test_source)):
        committed = subprocess.check_output(["git", "show", f"HEAD:adapters/android/{path}"], cwd=ROOT)
        assert committed == body.encode(), f"Uncommitted compiled input: {path}"
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
            assert (checkout / SOURCE).read_text() == body
            assert (checkout / TEST_SOURCE).read_text() == test_source
            xml = report.read_bytes()
            witness = validate_witness(mode, body, test_source, xml, result.stdout, result.stderr, result.returncode)
            proofs.append({"mode": mode, "sourceSHA256": hashlib.sha256(body.encode()).hexdigest(),
                           "testSourceSHA256": hashlib.sha256(test_source.encode()).hexdigest(),
                           "xmlSHA256": hashlib.sha256(xml).hexdigest(),
                           "stdoutSHA256": hashlib.sha256(result.stdout).hexdigest(),
                           "stderrSHA256": hashlib.sha256(result.stderr).hexdigest(),
                           "exit": result.returncode, "tests": len(witness["cases"]),
                           "failures": int(mode != "control"), "witness": witness})
    identity = {name: subprocess.check_output(["git", "rev-parse", revision], cwd=ROOT, text=True).strip()
                for name, revision in (("revision", "HEAD"), ("tree", "HEAD^{tree}"))}
    (RESULTS / "summary.json").write_text(json.dumps({**identity, "anchorCount": 1, "designated": DESIGNATED, "proofs": proofs}, indent=2) + "\n")
    print("Focus budget JVM controls: eight positives; exact typed-normalization reversal killed by the designated expected-exception assertion.")


if __name__ == "__main__":
    main()
