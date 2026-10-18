package uiexamples

// BehaviorCheckKey keeps an exact alias's distinct semantics in gallery evidence.
// Other names retain their canonical story's scoped behavior check.
func BehaviorCheckKey(requested, canonical string) string {
	if requested == "menus/RadioMenuItem" {
		return requested
	}
	return canonical
}
