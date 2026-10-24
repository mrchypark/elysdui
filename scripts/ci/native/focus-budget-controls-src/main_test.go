package main

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type record struct {
	XML    string `json:"xml"`
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
	Exit   int    `json:"exit"`
}
type fixture struct {
	Provenance struct {
		SourceSHA string                       `json:"sourceSHA256"`
		MutantSHA string                       `json:"mutantSHA256"`
		TestSHA   string                       `json:"testSourceSHA256"`
		Hashes    map[string]map[string]string `json:"recordSHA256"`
	} `json:"provenance"`
	Records map[string]record `json:"records"`
}

func loadFixture(t *testing.T, name string) fixture {
	t.Helper()
	data, err := os.ReadFile("../fixtures/" + name)
	if err != nil {
		t.Fatal(err)
	}
	var f fixture
	if err = json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	return f
}
func inputs(t *testing.T) (string, string, string) {
	t.Helper()
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(filepath.Join(root, "adapters/android", helperPath))
	if err != nil {
		t.Fatal(err)
	}
	tests, err := os.ReadFile(filepath.Join(root, "adapters/android", testPath))
	if err != nil {
		t.Fatal(err)
	}
	return root, string(body), string(tests)
}
func verifyRecord(mode, source, tests string, r record) (witness, error) {
	if mode != "control" {
		source = strings.Replace(source, anchor, "", 1)
	}
	return validateWitness(mode, source, tests, []byte(r.XML), []byte(r.Stdout), []byte(r.Stderr), r.Exit)
}
func setAttr(n *node, key, value string) {
	for i := range n.Attr {
		if n.Attr[i].Name.Local == key {
			n.Attr[i].Value = value
			return
		}
	}
	n.Attr = append(n.Attr, xml.Attr{Name: xml.Name{Local: key}, Value: value})
}
func firstCase(n *node) *node {
	for i := range n.Children {
		if n.Children[i].XMLName.Local == "testcase" {
			return &n.Children[i]
		}
	}
	panic("missing test fixture case")
}
func firstFailure(n *node) *node {
	c := firstCase(n)
	for i := range c.Children {
		if c.Children[i].XMLName.Local == "failure" {
			return &c.Children[i]
		}
	}
	panic("missing test fixture failure")
}

func TestGenuineArchivedAndCIWitnesses(t *testing.T) {
	_, source, tests := inputs(t)
	for _, name := range []string{"focus-budget-witness.json", "focus-budget-ci-39728373499.json"} {
		t.Run(name, func(t *testing.T) {
			f := loadFixture(t, name)
			mutant := strings.Replace(source, anchor, "", 1)
			if strings.Count(source, anchor) != 1 || digest([]byte(source)) != f.Provenance.SourceSHA || digest([]byte(mutant)) != f.Provenance.MutantSHA || digest([]byte(tests)) != f.Provenance.TestSHA {
				t.Fatal("compiled fixture provenance mismatch")
			}
			for mode, r := range f.Records {
				for field, body := range map[string]string{"xml": r.XML, "stdout": r.Stdout, "stderr": r.Stderr} {
					if digest([]byte(body)) != f.Provenance.Hashes[mode][field] {
						t.Fatalf("%s %s bytes changed", mode, field)
					}
				}
				w, err := verifyRecord(mode, source, tests, r)
				if err != nil {
					t.Fatalf("%s: %v", mode, err)
				}
				want := 8
				if mode != "control" {
					want = 1
				}
				if len(w.Cases) != want {
					t.Fatal("case count")
				}
				if name == "focus-budget-ci-39728373499.json" && mode != "control" && len(w.TaskEvents) != 4 {
					t.Fatal("CI start/terminal events were not preserved")
				}
			}
		})
	}
}

func TestStrictTaskEventTransitions(t *testing.T) {
	f := loadFixture(t, "focus-budget-ci-39728373499.json")
	original := f.Records["classification-removed"].Stdout
	changes := map[string]string{
		"missing compile":      strings.Replace(original, "> Task :protocol:compileKotlin\n", "", 1),
		"compile cached":       strings.Replace(original, "> Task :protocol:compileKotlin\n", "> Task :protocol:compileKotlin FROM-CACHE\n", 1),
		"compile up-to-date":   strings.Replace(original, "> Task :protocol:compileTestKotlin\n", "> Task :protocol:compileTestKotlin UP-TO-DATE\n", 1),
		"duplicate compile":    strings.Replace(original, "> Task :protocol:compileKotlin\n", "> Task :protocol:compileKotlin\n> Task :protocol:compileKotlin\n", 1),
		"reordered compile":    strings.Replace(strings.Replace(original, ":protocol:compileKotlin\n", ":protocol:SWAP\n", 1), ":protocol:compileTestKotlin\n", ":protocol:compileKotlin\n", 1),
		"duplicate start":      strings.Replace(original, "> Task :protocol:test\n", "> Task :protocol:test\n> Task :protocol:test\n", 1),
		"duplicate terminal":   original + "\n> Task :protocol:test FAILED\n",
		"start after terminal": strings.Replace(original, "> Task :protocol:test\n", "", 1) + "\n> Task :protocol:test\n",
		"test cached":          strings.Replace(original, "> Task :protocol:test\n", "> Task :protocol:test FROM-CACHE\n", 1),
		"missing terminal":     strings.Replace(original, "> Task :protocol:test FAILED\n", "", 1),
		"malformed terminal":   strings.Replace(original, "> Task :protocol:test FAILED", "> Task :protocol:test FAILED (extra)", 1),
	}
	for name, output := range changes {
		t.Run(name, func(t *testing.T) {
			if _, err := taskWitness("classification-removed", output); err == nil {
				t.Fatal("invalid sequence accepted")
			}
		})
	}
}

func TestMutantCorruptionsRejected(t *testing.T) {
	_, source, tests := inputs(t)
	f := loadFixture(t, "focus-budget-witness.json")
	variants := map[string]func(*record, *node){
		"token-salad": func(r *record, n *node) {
			f := firstFailure(n)
			setAttr(f, "message", "java.lang.AssertionError unrelated java.util.concurrent.ExecutionException FocusObservationBudgetExceeded")
			f.Text = f.attr("message")
		},
		"wrong-phase": func(r *record, n *node) {
			f := firstFailure(n)
			setAttr(f, "message", strings.ReplaceAll(f.attr("message"), "after posting", "before posting"))
			f.Text = strings.ReplaceAll(f.Text, "after posting", "before posting")
		},
		"missing-chain": func(r *record, n *node) { f := firstFailure(n); f.Text = f.attr("message") },
		"wrong-assertion-site": func(r *record, n *node) {
			f := firstFailure(n)
			f.Text = strings.ReplaceAll(f.Text, "FocusObservationBudgetTest.kt:17)", "FocusObservationBudgetTest.kt:18)")
		},
		"wrong-root": func(r *record, n *node) { n.XMLName.Local = "unrelated" },
		"extra-skipped": func(r *record, n *node) {
			c := firstCase(n)
			c.Children = append(c.Children, node{XMLName: xml.Name{Local: "skipped"}})
		},
		"extra-error": func(r *record, n *node) {
			c := firstCase(n)
			c.Children = append(c.Children, node{XMLName: xml.Name{Local: "error"}})
		},
		"wrong-immediate-cause": func(r *record, n *node) {
			f := firstFailure(n)
			f.Text = strings.ReplaceAll(f.Text, "Caused by: java.util.concurrent.ExecutionException:", "Caused by: java.lang.IllegalStateException:")
		},
		"message-stack-disagreement": func(r *record, n *node) { f := firstFailure(n); f.Text = "unrelated assertion\n" + f.Text },
		"compile-failure": func(r *record, n *node) {
			r.Stdout = strings.ReplaceAll(r.Stdout, "> Task :protocol:compileTestKotlin\n", "> Task :protocol:compileTestKotlin FAILED\n")
		},
		"extra-child": func(r *record, n *node) {
			c := firstCase(n)
			c.Children = append(c.Children, node{XMLName: xml.Name{Local: "unrelated"}})
		},
		"declared-count":     func(r *record, n *node) { setAttr(n, "tests", "2") },
		"duplicate-case":     func(r *record, n *node) { n.Children = append(n.Children, *firstCase(n)) },
		"wrong-class":        func(r *record, n *node) { setAttr(firstCase(n), "classname", "wrong.Class") },
		"wrong-case":         func(r *record, n *node) { setAttr(firstCase(n), "name", "wrongCase") },
		"wrong-suite":        func(r *record, n *node) { setAttr(n, "name", "wrong.Suite") },
		"wrong-failure-type": func(r *record, n *node) { setAttr(firstFailure(n), "type", "java.lang.IllegalStateException") },
		"namespaced-failure": func(r *record, n *node) { firstFailure(n).XMLName.Space = "urn:unrelated" },
		"exit-zero":          func(r *record, n *node) { r.Exit = 0 },
		"missing-compile": func(r *record, n *node) {
			r.Stdout = strings.ReplaceAll(r.Stdout, "> Task :protocol:compileTestKotlin\n", "")
		},
		"compile-up-to-date": func(r *record, n *node) {
			r.Stdout = strings.ReplaceAll(r.Stdout, "> Task :protocol:compileTestKotlin\n", "> Task :protocol:compileTestKotlin UP-TO-DATE\n")
		},
		"contradictory-success": func(r *record, n *node) { r.Stdout += "\nBUILD SUCCESSFUL in 1s\n" },
		"missing-test-summary":  func(r *record, n *node) { r.Stderr = strings.ReplaceAll(r.Stderr, "1 test completed, 1 failed", "") },
		"wrong-failed-task": func(r *record, n *node) {
			r.Stderr = strings.ReplaceAll(r.Stderr, "Execution failed for task ':protocol:test'.", "Execution failed for task ':protocol:compileTestKotlin'.")
		},
		"wrong-helper-site": func(r *record, n *node) {
			f := firstFailure(n)
			f.Text = strings.ReplaceAll(f.Text, "FocusObservationBudget.kt:19)", "FocusObservationBudget.kt:20)")
		},
		"wrong-cause-site": func(r *record, n *node) {
			f := firstFailure(n)
			f.Text = strings.ReplaceAll(f.Text, "FocusObservationBudgetTest.kt:15)", "FocusObservationBudgetTest.kt:16)")
		},
		"reordered-chain": func(r *record, n *node) {
			f := firstFailure(n)
			s := strings.Split(f.Text, "\nCaused by: ")
			f.Text = strings.Join([]string{s[0], s[2], s[1]}, "\nCaused by: ")
		},
		"extra-cause": func(r *record, n *node) {
			f := firstFailure(n)
			f.Text += "\nCaused by: java.lang.IllegalStateException: unrelated"
		},
		"suppressed": func(r *record, n *node) {
			f := firstFailure(n)
			f.Text += "\nSuppressed: java.lang.IllegalStateException: unrelated"
		},
		"missing-failure":        func(r *record, n *node) { firstCase(n).Children = nil },
		"wrong-failure-count":    func(r *record, n *node) { setAttr(n, "failures", "0") },
		"declared-skipped":       func(r *record, n *node) { setAttr(n, "skipped", "1") },
		"declared-error":         func(r *record, n *node) { setAttr(n, "errors", "1") },
		"other-failed-task":      func(r *record, n *node) { r.Stdout += "\n> Task :protocol:compileJava FAILED\n" },
		"duplicate-failed-build": func(r *record, n *node) { r.Stdout += "\nBUILD FAILED in 1s\n" },
		"malformed-failed-task":  func(r *record, n *node) { r.Stdout += "\n> Task :protocol:compileJava FAILED (unexpected detail)\n" },
		"malformed-failed-build": func(r *record, n *node) { r.Stdout += "\nBUILD FAILED unexpected detail\n" },
	}
	for name, change := range variants {
		t.Run(name, func(t *testing.T) {
			r := f.Records["classification-removed"]
			n, err := parseXML([]byte(r.XML))
			if err != nil {
				t.Fatal(err)
			}
			change(&r, &n)
			b, err := xml.Marshal(n)
			if err != nil {
				t.Fatal(err)
			}
			r.XML = string(b)
			if _, err = verifyRecord("classification-removed", source, tests, r); err == nil {
				t.Fatal("corrupt witness accepted")
			}
		})
	}
}

func TestPositiveCorruptionsRejected(t *testing.T) {
	_, source, tests := inputs(t)
	f := loadFixture(t, "focus-budget-witness.json")
	variants := map[string]func(*record, *node){
		"duplicate": func(r *record, n *node) { n.Children = append(n.Children, *firstCase(n)) },
		"missing": func(r *record, n *node) {
			for i, c := range n.Children {
				if c.XMLName.Local == "testcase" {
					n.Children = append(n.Children[:i], n.Children[i+1:]...)
					break
				}
			}
		},
		"skipped-child": func(r *record, n *node) {
			c := firstCase(n)
			c.Children = append(c.Children, node{XMLName: xml.Name{Local: "skipped"}})
		},
		"error-child": func(r *record, n *node) {
			c := firstCase(n)
			c.Children = append(c.Children, node{XMLName: xml.Name{Local: "error"}})
		},
		"declared-count": func(r *record, n *node) { setAttr(n, "tests", "9") },
		"wrong-class":    func(r *record, n *node) { setAttr(firstCase(n), "classname", "wrong.Class") },
		"wrong-root":     func(r *record, n *node) { n.XMLName.Local = "unrelated" },
		"nonzero":        func(r *record, n *node) { r.Exit = 1 },
		"missing-compile": func(r *record, n *node) {
			r.Stdout = strings.ReplaceAll(r.Stdout, "> Task :protocol:compileKotlin\n", "")
		},
		"failed-build": func(r *record, n *node) { r.Stderr += "\nFAILURE: unrelated build failure\n" },
		"nested-testcase": func(r *record, n *node) {
			n.Children = append(n.Children, node{XMLName: xml.Name{Local: "properties"}, Children: []node{*firstCase(n)}})
		},
	}
	for name, change := range variants {
		t.Run(name, func(t *testing.T) {
			r := f.Records["control"]
			n, err := parseXML([]byte(r.XML))
			if err != nil {
				t.Fatal(err)
			}
			change(&r, &n)
			b, err := xml.Marshal(n)
			if err != nil {
				t.Fatal(err)
			}
			r.XML = string(b)
			if _, err = verifyRecord("control", source, tests, r); err == nil {
				t.Fatal("corrupt positive witness accepted")
			}
		})
	}
}

func TestRunnerRequiresFreshXMLAndUnchangedInputs(t *testing.T) {
	root, _, _ := inputs(t)
	f := loadFixture(t, "focus-budget-witness.json")
	for _, variant := range []string{"genuine", "missing-xml", "changed-helper", "changed-tests"} {
		t.Run(variant, func(t *testing.T) {
			calls := 0
			var checkout string
			results := t.TempDir()
			fake := func(ctx context.Context, dir string, args []string) (commandResult, error) {
				checkout = dir
				mode := "control"
				if calls > 0 {
					mode = "classification-removed"
				}
				calls++
				report := filepath.Join(dir, "protocol/build/test-results/test/TEST-"+suiteName+".xml")
				if _, err := os.Stat(report); !os.IsNotExist(err) {
					t.Fatal("prior XML was not removed")
				}
				r := f.Records[mode]
				if variant != "missing-xml" || mode == "control" {
					if err := os.MkdirAll(filepath.Dir(report), 0755); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(report, []byte(r.XML), 0644); err != nil {
						t.Fatal(err)
					}
				}
				if mode != "control" && (variant == "changed-helper" || variant == "changed-tests") {
					path := helperPath
					if variant == "changed-tests" {
						path = testPath
					}
					p := filepath.Join(dir, path)
					b, err := os.ReadFile(p)
					if err != nil {
						t.Fatal(err)
					}
					if err = os.WriteFile(p, append(b, []byte("\n// changed during invocation\n")...), 0644); err != nil {
						t.Fatal(err)
					}
				}
				return commandResult{[]byte(r.Stdout), []byte(r.Stderr), r.Exit}, nil
			}
			err := runControls(root, results, fake)
			if (err == nil) != (variant == "genuine") {
				t.Fatalf("result: %v", err)
			}
			if calls != 2 {
				t.Fatalf("calls %d", calls)
			}
			if variant == "changed-helper" || variant == "changed-tests" {
				if _, err := os.Stat(filepath.Join(results, "classification-removed/tests.xml")); err != nil {
					t.Fatal("raw XML must survive a source-guard rejection", err)
				}
			}
			_, summaryErr := os.Stat(filepath.Join(results, "summary.json"))
			if (summaryErr == nil) != (variant == "genuine") {
				t.Fatal("summary must exist only for accepted witnesses")
			}
			if _, err = os.Stat(filepath.Dir(filepath.Dir(checkout))); !os.IsNotExist(err) {
				t.Fatalf("owned temporary checkout remains: %v", err)
			}
		})
	}
}
