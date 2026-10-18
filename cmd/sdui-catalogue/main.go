// Command sdui-catalogue regenerates reviewed catalogue contracts and test data.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"github.com/mrchypark/elysdui/internal/sduicatalogue"
	"os"
	"path/filepath"
)

func main() {
	check := flag.Bool("check", false, "fail if committed generated files differ")
	root := flag.String("root", ".", "repository root")
	describe := flag.String("describe", "", "print the readable contract for one qualified name")
	flag.Parse()
	if *describe != "" {
		m, _, err := sduicatalogue.Build()
		if err != nil {
			fail(err)
		}
		for _, c := range m.Contracts {
			if c.Name == *describe {
				data, _ := json.MarshalIndent(c, "", "  ")
				fmt.Println(string(data))
				return
			}
		}
		fail(fmt.Errorf("unknown component %q", *describe))
	}
	manifest, fixtures, err := sduicatalogue.Encode()
	if err != nil {
		fail(err)
	}
	for _, file := range []struct {
		name string
		data []byte
	}{{"adapters/gohtmx/catalogue_manifest.json.gz", manifest}, {"adapters/gohtmx/testdata/catalogue_fixtures.json.gz", fixtures}} {
		path := filepath.Join(*root, file.name)
		if *check {
			current, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(current, file.data) {
				fail(fmt.Errorf("%s is stale; run go generate ./adapters/gohtmx", file.name))
			}
		} else {
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				fail(err)
			}
			if err := os.WriteFile(path, file.data, 0644); err != nil {
				fail(err)
			}
		}
	}
	fmt.Printf("catalogue contracts verified: %d bytes; fixtures: %d bytes\n", len(manifest), len(fixtures))
}
func fail(err error) { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
