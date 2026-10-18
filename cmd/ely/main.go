// Command ely exports templates/assets and validates or describes SDUI screens.
package main

import (
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "sdui", "validate", "schema", "catalog":
			os.Exit(runSDUI(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
		}
	}
	if len(os.Args) < 2 || os.Args[1] != "export" {
		fmt.Fprintln(os.Stderr, "usage: ely export -dir ./ely-ui (destination must not exist)")
		fmt.Fprint(os.Stderr, sduiUsage)
		os.Exit(2)
	}
	flags := flag.NewFlagSet("export", flag.ExitOnError)
	dir := flags.String("dir", "./ely-ui", "new destination directory")
	flags.Parse(os.Args[2:])
	if flags.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "export accepts only -dir")
		os.Exit(2)
	}
	if err := export(*dir); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("Exported templates, assets and catalogue to %s\n", *dir)
}

func export(dir string) error {
	// A new directory prevents an export from replacing user customizations.
	if err := os.Mkdir(dir, 0755); err != nil {
		return fmt.Errorf("create export directory: %w", err)
	}
	err := fs.WalkDir(ui.Files, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || name == "." {
			return err
		}
		path := filepath.Join(dir, filepath.FromSlash(name))
		if entry.IsDir() {
			return os.Mkdir(path, 0755)
		}
		data, err := ui.Files.ReadFile(name)
		if err != nil {
			return err
		}
		return os.WriteFile(path, data, 0644)
	})
	if err != nil {
		return fmt.Errorf("export incomplete in %s: %w", dir, err)
	}
	return nil
}
