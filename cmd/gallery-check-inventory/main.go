// Command gallery-check-inventory emits authoritative expected gallery test IDs.
// It discovers contracts, not their execution or support status.
package main

import (
	"encoding/json"
	ui "github.com/mrchypark/ely-htmx"
	"os"
)

type check struct {
	Name   string `json:"name"`
	Key    string `json:"key"`
	Family string `json:"family"`
}

func main() {
	definitions, err := ui.ComponentDefinitions()
	if err != nil {
		panic(err)
	}
	catalogue, err := ui.Catalogue()
	if err != nil {
		panic(err)
	}
	cases := []check{}
	seen := map[string]bool{}
	stories := []string{}
	for _, definition := range definitions {
		for _, name := range append([]string{definition.Name}, definition.Aliases...) {
			qualified := definition.Chapter + "/" + name
			if seen[qualified] {
				continue
			}
			seen[qualified] = true
			resolved, err := ui.ResolveComponent(definition.Chapter, name)
			if err != nil {
				panic(err)
			}
			cases = append(cases, check{qualified, resolved.Chapter + "/" + resolved.Name, resolved.Family})
		}
	}
	for _, chapter := range catalogue {
		for _, story := range chapter.Stories {
			stories = append(stories, "components/"+chapter.Slug+"/"+story.Slug)
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(struct {
		Cases   []check  `json:"cases"`
		Stories []string `json:"stories"`
	}{cases, stories}); err != nil {
		panic(err)
	}
}
