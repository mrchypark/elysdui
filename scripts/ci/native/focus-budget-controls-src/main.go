package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"encoding/xml"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const helperPath = "test-support/dev/ely/nativeprofile/FocusObservationBudget.kt"
const testPath = "protocol/src/test/kotlin/dev/ely/nativeprofile/FocusObservationBudgetTest.kt"
const suiteName = "dev.ely.nativeprofile.FocusObservationBudgetTest"
const designated = "innerBudgetExhaustionIsReadinessFailureWithOriginalCause"
const anchor = "        if (cause is FocusObservationBudgetExceeded) {\n            throw AssertionError(\"Window focus observation exceeded ${timeoutMillis}ms: ${cause.phase}\", cause)\n        }\n"

var positiveNames = []string{designated, "zeroBudgetBeforePostingIsDistinctFromAnUnansweredPostedProbe", "outerDeadlineIsReadinessFailureAndRetainsTimeoutCause", "unrelatedWorkerFailureRemainsExecutionFailure", "nestedTimeoutIsNotMistakenForTheOuterDeadline", "cancelledObservationRemainsCancelled", "successfulObservationRetainsItsValue", "interruptedObservationRemainsInterrupted"}

type node struct {
	XMLName  xml.Name
	Attr     []xml.Attr `xml:",any,attr"`
	Children []node     `xml:",any"`
	Text     string     `xml:",chardata"`
}

func (n node) attr(name string) string {
	for _, a := range n.Attr {
		if a.Name.Local == name && a.Name.Space == "" {
			return a.Value
		}
	}
	return ""
}
func (n node) descendants(name string) []node {
	var out []node
	if n.XMLName.Local == name {
		out = append(out, n)
	}
	for _, c := range n.Children {
		out = append(out, c.descendants(name)...)
	}
	return out
}
func (n node) children(name string) []node {
	var out []node
	for _, c := range n.Children {
		if c.XMLName.Local == name {
			out = append(out, c)
		}
	}
	return out
}
func parseXML(data []byte) (node, error) {
	var root node
	d := xml.NewDecoder(bytes.NewReader(data))
	if err := d.Decode(&root); err != nil {
		return root, err
	}
	for {
		token, err := d.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return root, err
		}
		if text, ok := token.(xml.CharData); ok && strings.TrimSpace(string(text)) == "" {
			continue
		}
		return root, errors.New("unexpected content after XML suite")
	}
	return root, nil
}

type taskEvent struct {
	Name  string `json:"name"`
	State string `json:"state"`
}
type witness struct {
	Kind           string      `json:"kind"`
	CompiledTasks  []string    `json:"compiledTasks"`
	TaskEvents     []taskEvent `json:"taskEvents"`
	Cases          []string    `json:"cases"`
	Phase          string      `json:"phase,omitempty"`
	AssertionLine  int         `json:"assertionLine,omitempty"`
	CauseLine      int         `json:"causeLine,omitempty"`
	HelperGetLine  int         `json:"helperGetLine,omitempty"`
	FailureMessage string      `json:"failureMessage,omitempty"`
}

func matches(pattern, text string) []string {
	m := regexp.MustCompile(pattern).FindAllStringSubmatch(text, -1)
	out := make([]string, 0, len(m))
	for _, v := range m {
		if len(v) > 1 {
			out = append(out, v[1])
		} else {
			out = append(out, v[0])
		}
	}
	return out
}
func sourceLine(source, statement string) (int, error) {
	found := 0
	for i, line := range strings.Split(source, "\n") {
		if strings.TrimSpace(line) == statement {
			if found != 0 {
				return 0, fmt.Errorf("duplicate source statement: %s", statement)
			}
			found = i + 1
		}
	}
	if found == 0 {
		return 0, fmt.Errorf("missing source statement: %s", statement)
	}
	return found, nil
}
func taskWitness(mode, output string) ([]taskEvent, error) {
	re := regexp.MustCompile(`^> Task :protocol:(compileKotlin|compileTestKotlin|test)(?: ([A-Z-]+))?$`)
	relevant := regexp.MustCompile(`^> Task :protocol:(compileKotlin|compileTestKotlin|test)(?:\s|$)`)
	var events []taskEvent
	for _, line := range strings.Split(output, "\n") {
		if !relevant.MatchString(line) {
			continue
		}
		m := re.FindStringSubmatch(line)
		if m == nil {
			return nil, fmt.Errorf("malformed task event: %s", line)
		}
		events = append(events, taskEvent{m[1], m[2]})
	}
	want := []taskEvent{{"compileKotlin", ""}, {"compileTestKotlin", ""}, {"test", ""}}
	if mode == "control" {
		if !reflect.DeepEqual(events, want) {
			return nil, fmt.Errorf("unexpected control task events: %v", events)
		}
		return events, nil
	}
	terminal := []taskEvent{{"compileKotlin", ""}, {"compileTestKotlin", ""}, {"test", "FAILED"}}
	started := append(append([]taskEvent{}, want...), taskEvent{"test", "FAILED"})
	// Gradle may print the test start before output, then its single terminal failure.
	if !reflect.DeepEqual(events, terminal) && !reflect.DeepEqual(events, started) {
		return nil, fmt.Errorf("unexpected mutant task events: %v", events)
	}
	return events, nil
}
func validateWitness(mode, body, testSource string, xmlBytes, stdout, stderr []byte, exit int) (witness, error) {
	bad := func(reason string) (witness, error) { return witness{}, errors.New(reason) }
	if mode != "control" && mode != "classification-removed" {
		return bad("unknown mode")
	}
	root, err := parseXML(xmlBytes)
	if err != nil {
		return witness{}, fmt.Errorf("XML: %w", err)
	}
	if root.XMLName.Local != "testsuite" || root.XMLName.Space != "" || root.attr("name") != suiteName {
		return bad("unexpected suite")
	}
	for _, c := range root.Children {
		if c.XMLName.Space != "" || !(c.XMLName.Local == "properties" || c.XMLName.Local == "testcase" || c.XMLName.Local == "system-out" || c.XMLName.Local == "system-err") {
			return bad("unexpected suite child")
		}
	}
	cases := root.children("testcase")
	if len(root.descendants("testcase")) != len(cases) || len(root.descendants("error")) != 0 || len(root.descendants("skipped")) != 0 {
		return bad("nested testcase, error, or skipped case")
	}
	expected := append([]string{}, positiveNames...)
	if mode != "control" {
		expected = []string{designated}
	}
	names := []string{}
	seen := map[string]bool{}
	for _, c := range cases {
		name := c.attr("name")
		if seen[name] || c.attr("classname") != suiteName {
			return bad("duplicate case or incorrect class")
		}
		seen[name] = true
		names = append(names, name)
	}
	sort.Strings(names)
	sort.Strings(expected)
	count, err := strconv.Atoi(root.attr("tests"))
	if err != nil || count != len(cases) || !reflect.DeepEqual(names, expected) || root.attr("errors") != "0" || root.attr("skipped") != "0" {
		return bad("incorrect case names/count or declared errors/skips")
	}
	output, errs := string(stdout), string(stderr)
	events, err := taskWitness(mode, output)
	if err != nil {
		return witness{}, err
	}
	if strings.Contains(output+errs, "Compilation error") || strings.Contains(output, "compileKotlin FAILED") || strings.Contains(output, "compileTestKotlin FAILED") {
		return bad("compilation failure")
	}
	w := witness{CompiledTasks: []string{"compileKotlin", "compileTestKotlin", "test"}, TaskEvents: events, Cases: names}
	if mode == "control" {
		if exit != 0 || root.attr("failures") != "0" || len(root.descendants("failure")) != 0 {
			return bad("positive exit or failure count")
		}
		for _, c := range cases {
			if len(c.Children) != 0 {
				return bad("positive case contains child result")
			}
		}
		if len(matches(`(?m)^BUILD SUCCESSFUL in .+$`, output)) != 1 || strings.Contains(output+errs, "FAILED") || strings.Contains(output+errs, "FAILURE:") {
			return bad("positive build result")
		}
		w.Kind = "compiled-eight-positive-cases"
		return w, nil
	}
	if exit != 1 || root.attr("failures") != "1" || len(cases[0].Children) != 1 || cases[0].Children[0].XMLName.Local != "failure" || len(root.descendants("failure")) != 1 {
		return bad("mutant exit/result topology")
	}
	failure := cases[0].Children[0]
	if failure.XMLName.Space != "" || len(failure.Children) != 0 || failure.attr("type") != "java.lang.AssertionError" {
		return bad("mutant failure type/children")
	}
	phase := "after posting main-thread probe"
	typed := "dev.ely.nativeprofile.FocusObservationBudgetExceeded: Window focus observation budget exhausted: " + phase
	execution := "java.util.concurrent.ExecutionException: " + typed
	message := "java.lang.AssertionError: Expected an exception of class java.lang.AssertionError to be thrown, but was " + execution
	sections := strings.Split(strings.TrimSpace(failure.Text), "\nCaused by: ")
	if failure.attr("message") != message || len(sections) != 3 || strings.Contains(failure.Text, "Suppressed:") {
		return bad("mutant failure message/chain")
	}
	first := []string{}
	for _, s := range sections {
		first = append(first, strings.Split(s, "\n")[0])
	}
	if !reflect.DeepEqual(first, []string{message, execution, typed}) {
		return bad("mutant immediate/root cause ordering")
	}
	assertionLine, err := sourceLine(testSource, `val failure = assertFailsWith<AssertionError> { awaitFocusObservation(sample, 350, 350) }`)
	if err != nil {
		return witness{}, err
	}
	causeLine, err := sourceLine(testSource, `val cause = FocusObservationBudgetExceeded("after posting main-thread probe")`)
	if err != nil {
		return witness{}, err
	}
	getLine, err := sourceLine(body, `sample.get(remainingMillis, TimeUnit.MILLISECONDS)`)
	if err != nil {
		return witness{}, err
	}
	frames := [][]string{}
	for _, s := range sections {
		frames = append(frames, matches(`(?m)^\s+at (?:app//)?(dev\.ely\.nativeprofile\.[^\n]+)$`, s))
	}
	wantFrames := [][]string{{fmt.Sprintf("%s.%s(FocusObservationBudgetTest.kt:%d)", suiteName, designated, assertionLine)}, {fmt.Sprintf("dev.ely.nativeprofile.FocusObservationBudgetKt.awaitFocusObservation(FocusObservationBudget.kt:%d)", getLine)}, {fmt.Sprintf("%s.%s(FocusObservationBudgetTest.kt:%d)", suiteName, designated, causeLine)}}
	if !reflect.DeepEqual(frames, wantFrames) {
		return bad("mutant source-owned frames")
	}
	if !reflect.DeepEqual(matches(`(?m)^\S+ > .* FAILED$`, output), []string{"FocusObservationBudgetTest > " + designated + " FAILED"}) {
		return bad("incorrect designated stdout failure")
	}
	for _, text := range []string{fmt.Sprintf("    java.lang.AssertionError at FocusObservationBudgetTest.kt:%d", assertionLine), fmt.Sprintf("        Caused by: java.util.concurrent.ExecutionException at FocusObservationBudgetTest.kt:%d", assertionLine), fmt.Sprintf("            Caused by: dev.ely.nativeprofile.FocusObservationBudgetExceeded at FocusObservationBudgetTest.kt:%d", causeLine)} {
		if !strings.Contains(output, text) {
			return bad("missing stdout source frame")
		}
	}
	if !reflect.DeepEqual(matches(`(?m)^\d+ tests? completed.*$`, errs), []string{"1 test completed, 1 failed"}) || !reflect.DeepEqual(matches(`Execution failed for task '([^']+)'\.`, errs), []string{":protocol:test"}) {
		return bad("incorrect failed test/task summary")
	}
	failedTasks := []string{}
	failedBuilds := 0
	for _, line := range strings.Split(output+errs, "\n") {
		if strings.HasPrefix(line, "> Task ") && strings.Contains(line, "FAILED") {
			failedTasks = append(failedTasks, line)
		}
		if strings.HasPrefix(line, "BUILD FAILED") {
			failedBuilds++
		}
	}
	if !reflect.DeepEqual(failedTasks, []string{"> Task :protocol:test FAILED"}) || failedBuilds != 1 || len(matches(`(?m)^BUILD FAILED in .+$`, output+errs)) != 1 || strings.Contains(output+errs, "BUILD SUCCESSFUL") {
		return bad("contradictory or duplicate failed build/task")
	}
	w.Kind = "typed-normalization-reversal"
	w.Phase = phase
	w.AssertionLine = assertionLine
	w.CauseLine = causeLine
	w.HelperGetLine = getLine
	w.FailureMessage = message
	return w, nil
}

func digest(data []byte) string { return fmt.Sprintf("%x", sha256.Sum256(data)) }
func writeJSON(path string, value any) error {
	b, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0644)
}
func git(root string, args ...string) ([]byte, error) {
	c := exec.Command("git", args...)
	c.Dir = root
	return c.Output()
}
func copyTree(source, destination string) error {
	return filepath.WalkDir(source, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path != source && (d.Name() == ".gradle" || d.Name() == "build" || d.Name() == "local.properties") {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("unexpected nonregular input: %s", path)
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, b, info.Mode().Perm())
	})
}

type commandResult struct {
	Stdout, Stderr []byte
	Exit           int
}
type invokeFunc func(context.Context, string, []string) (commandResult, error)

func invoke(ctx context.Context, dir string, args []string) (commandResult, error) {
	c := exec.CommandContext(ctx, args[0], args[1:]...)
	c.Dir = dir
	var out, errOut bytes.Buffer
	c.Stdout = &out
	c.Stderr = &errOut
	err := c.Run()
	r := commandResult{Stdout: out.Bytes(), Stderr: errOut.Bytes()}
	if err != nil {
		var exit *exec.ExitError
		if !errors.As(err, &exit) {
			return r, err
		}
		r.Exit = exit.ExitCode()
	}
	if ctx.Err() != nil {
		return r, ctx.Err()
	}
	return r, nil
}
func runControls(root, results string, run invokeFunc) (err error) {
	source, err := os.ReadFile(filepath.Join(root, "adapters/android", helperPath))
	if err != nil {
		return err
	}
	testSource, err := os.ReadFile(filepath.Join(root, "adapters/android", testPath))
	if err != nil {
		return err
	}
	if strings.Count(string(source), anchor) != 1 {
		return errors.New("expected exactly one normalization anchor")
	}
	for path, body := range map[string][]byte{helperPath: source, testPath: testSource} {
		committed, e := git(root, "show", "HEAD:adapters/android/"+path)
		if e != nil {
			return e
		}
		if !bytes.Equal(committed, body) {
			return fmt.Errorf("uncommitted compiled input: %s", path)
		}
	}
	if err = os.MkdirAll(results, 0755); err != nil {
		return err
	}
	if e := os.Remove(filepath.Join(results, "summary.json")); e != nil && !errors.Is(e, os.ErrNotExist) {
		return e
	}
	temporary, err := os.MkdirTemp("", "ely-focus-budget-")
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, os.RemoveAll(temporary)) }()
	checkout := filepath.Join(temporary, "adapters/android")
	if err = copyTree(filepath.Join(root, "adapters/android"), checkout); err != nil {
		return err
	}
	if err = copyTree(filepath.Join(root, "contracts/native/profile-v1/fixtures"), filepath.Join(temporary, "contracts/native/profile-v1/fixtures")); err != nil {
		return err
	}
	proofs := []map[string]any{}
	for _, mode := range []string{"control", "classification-removed"} {
		body := source
		selected := suiteName
		if mode != "control" {
			body = []byte(strings.Replace(string(source), anchor, "", 1))
			selected += "." + designated
		}
		if err = os.WriteFile(filepath.Join(checkout, helperPath), body, 0644); err != nil {
			return err
		}
		command := []string{filepath.Join(checkout, "gradlew"), "--no-daemon", "-PprotocolOnly", ":protocol:test", "--tests", selected, "--rerun-tasks"}
		report := filepath.Join(checkout, "protocol/build/test-results/test/TEST-"+suiteName+".xml")
		if e := os.Remove(report); e != nil && !errors.Is(e, os.ErrNotExist) {
			return e
		}
		ctx, cancel := context.WithTimeout(context.Background(), 600*time.Second)
		result, e := run(ctx, checkout, command)
		cancel()
		out := filepath.Join(results, mode)
		if err = os.MkdirAll(out, 0755); err != nil {
			return err
		}
		for name, data := range map[string][]byte{"stdout.log": result.Stdout, "stderr.log": result.Stderr} {
			if err = os.WriteFile(filepath.Join(out, name), data, 0644); err != nil {
				return err
			}
		}
		if err = writeJSON(filepath.Join(out, "exit.json"), map[string]any{"exit": result.Exit, "command": command}); err != nil {
			return err
		}
		if e != nil {
			return e
		}
		xmlData, e := os.ReadFile(report)
		if e != nil {
			return fmt.Errorf("fresh XML required: %w", e)
		}
		if err = os.WriteFile(filepath.Join(out, "tests.xml"), xmlData, 0644); err != nil {
			return err
		}
		for path, expected := range map[string][]byte{helperPath: body, testPath: testSource} {
			actual, e := os.ReadFile(filepath.Join(checkout, path))
			if e != nil {
				return e
			}
			if !bytes.Equal(actual, expected) {
				return fmt.Errorf("compiled input changed during invocation: %s", path)
			}
		}
		w, e := validateWitness(mode, string(body), string(testSource), xmlData, result.Stdout, result.Stderr, result.Exit)
		if e != nil {
			return fmt.Errorf("%s witness: %w", mode, e)
		}
		failures := 0
		if mode != "control" {
			failures = 1
		}
		proofs = append(proofs, map[string]any{"mode": mode, "sourceSHA256": digest(body), "testSourceSHA256": digest(testSource), "xmlSHA256": digest(xmlData), "stdoutSHA256": digest(result.Stdout), "stderrSHA256": digest(result.Stderr), "exit": result.Exit, "tests": len(w.Cases), "failures": failures, "witness": w})
	}
	if err = os.RemoveAll(temporary); err != nil {
		return err
	}
	if _, e := os.Stat(temporary); !errors.Is(e, os.ErrNotExist) {
		return fmt.Errorf("owned temporary directory removal unverified: %v", e)
	}
	revision, e := git(root, "rev-parse", "HEAD")
	if e != nil {
		return e
	}
	tree, e := git(root, "rev-parse", "HEAD^{tree}")
	if e != nil {
		return e
	}
	return writeJSON(filepath.Join(results, "summary.json"), map[string]any{"revision": strings.TrimSpace(string(revision)), "tree": strings.TrimSpace(string(tree)), "anchorCount": 1, "designated": designated, "proofs": proofs, "temporaryDirectoryRemoved": true})
}
func main() {
	root := flag.String("root", "", "repository root supplied by launcher")
	flag.Parse()
	if *root == "" {
		fmt.Fprintln(os.Stderr, "--root is required")
		os.Exit(2)
	}
	absolute, err := filepath.Abs(*root)
	if err == nil {
		err = runControls(absolute, filepath.Join(absolute, "test-results/android-native/focus-budget-controls"), invoke)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("Focus budget JVM controls: eight positives; exact typed-normalization reversal killed by the designated expected-exception assertion.")
}
