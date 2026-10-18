package ui

import (
	"encoding/json"
	"fmt"
)

// ComponentStory identifies an Ely visual recipe and its documented aliases.
// Aliases are names from Ely's catalogue, not independent implementations.
type ComponentStory struct {
	Title      string   `json:"title"`
	Name       string   `json:"name"`
	Slug       string   `json:"slug"`
	Components []string `json:"components"`
	Endpoint   string   `json:"-"`
}

type ComponentChapter struct {
	Number  int              `json:"number"`
	Slug    string           `json:"slug"`
	Title   string           `json:"title"`
	Summary string           `json:"summary"`
	Stories []ComponentStory `json:"stories"`
}

// Catalogue returns a fresh copy of the shared Ely catalogue.
func Catalogue() ([]ComponentChapter, error) {
	data, err := Files.ReadFile("components.json")
	if err != nil {
		return nil, err
	}
	var catalogue struct {
		Pages []ComponentChapter `json:"pages"`
	}
	if err := json.Unmarshal(data, &catalogue); err != nil {
		return nil, fmt.Errorf("Ely catalogue: %w", err)
	}
	return catalogue.Pages, nil
}
