package sduicatalogue

// Owner requests are reviewed inputs of the exact ContextMenu renderer. Its
// config helper validates the complete object, so fixture/AST inference cannot
// determine optionality, nullability, required children or numeric coordinates.
// Annotate only these two destinations; other menus and menu rows are unchanged.
func applyContextRequestContract(c *Contract) {
	if c.Name != "menus/ContextMenu" || c.Chapter != "menus" || c.Component != "ContextMenu" {
		return
	}
	if c.Properties == nil {
		c.Properties = map[string]Property{}
	}
	// Omission means automatic in the standalone renderer. As with other
	// catalogue props, no fixture data is installed as a runtime default.
	c.Properties["contextMode"] = Property{
		Type: "string", Target: "ContextMode", Enum: []string{"automatic", "manual"},
	}
	c.Properties["contextRequest"] = Property{
		Type: "object", Target: "ContextRequest", Nullable: true,
		Properties: map[string]Property{
			"number": {Type: "string", Target: "Number", Required: true, Format: "context-request-number", MaxLength: 20},
			"x":      {Type: "number", Target: "X", Required: true},
			"y":      {Type: "number", Target: "Y", Required: true},
		},
	}
}
