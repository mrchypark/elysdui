package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
)

const sduiUsage = `usage:
  ely validate [-registry catalogue|core] <screen.json|->
  ely schema [-registry catalogue|core]
  ely catalog [-registry catalogue|core] [-type component-name]

The optional "sdui" prefix is also supported (ely sdui validate ...).
Validation compiles the screen only. Host loader/action registration, URL policy,
authorization and runtime data must still be checked by the application.
`

func runSDUI(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) > 0 && args[0] == "sdui" {
		args = args[1:]
	}
	if len(args) == 0 {
		fmt.Fprint(stderr, sduiUsage)
		return 2
	}
	command := args[0]
	if command != "validate" && command != "schema" && command != "catalog" {
		fmt.Fprint(stderr, sduiUsage)
		return 2
	}
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	flags.SetOutput(stderr)
	registryName := flags.String("registry", "catalogue", "registered component surface: catalogue or core")
	component := ""
	if command == "catalog" {
		flags.StringVar(&component, "type", "", "show one exact registered component contract")
	}
	if err := flags.Parse(args[1:]); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	if (command == "validate" && flags.NArg() != 1) || (command != "validate" && flags.NArg() != 0) {
		fmt.Fprint(stderr, sduiUsage)
		return 2
	}
	registry, err := toolRegistry(*registryName)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	switch command {
	case "validate":
		input := stdin
		name := flags.Arg(0)
		if name != "-" {
			file, err := os.Open(name)
			if err != nil {
				fmt.Fprintln(stderr, err)
				return 1
			}
			defer file.Close()
			input = file
		}
		screen, err := sdui.Decode(input)
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		plan, err := sdui.Compile(screen, registry)
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		families := strings.Join(plan.Families(), ", ")
		if families == "" {
			families = "core only"
		}
		fmt.Fprintf(stdout, "Valid screen %s (events: %d; assets: %s)\n", plan.ScreenID(), len(plan.Events()), families)
		fmt.Fprintln(stdout, "Compilation only: host loader/action registration, authorization and runtime data were not checked.")
		return 0
	case "schema":
		schema, err := registry.JSONSchema()
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		return writeToolJSON(stdout, stderr, schema)
	case "catalog":
		definitions := registry.Definitions()
		if component != "" {
			for _, definition := range definitions {
				if definition.Name == component {
					return writeToolJSON(stdout, stderr, definition)
				}
			}
			fmt.Fprintf(stderr, "unknown registered component %q\n", component)
			return 1
		}
		document := map[string]any{"version": sdui.Version, "registry": *registryName, "definitions": definitions}
		if *registryName == "catalogue" {
			info, err := sdui.CatalogueInfo()
			if err != nil {
				fmt.Fprintln(stderr, err)
				return 1
			}
			document["catalogue"] = info
		}
		return writeToolJSON(stdout, stderr, document)
	}
	return 2
}

func toolRegistry(name string) (*sdui.Registry, error) {
	switch name {
	case "core":
		return sdui.DefaultRegistry()
	case "catalogue":
		return sdui.CatalogueRegistry()
	default:
		return nil, fmt.Errorf("unknown registry %q: choose catalogue or core", name)
	}
}
func writeToolJSON(stdout, stderr io.Writer, value any) int {
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}
