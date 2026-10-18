package ui

import (
	"fmt"
	"reflect"
)

// menuHasItems distinguishes an explicitly empty child menu from an action.
// Missing and nil Items retain the legacy leaf representation; an allocated
// slice or array represents a submenu regardless of its length. Match the
// template engine's pointer indirection, without accepting malformed children
// as an action (or treating a boolean as a second representation).
func menuHasItems(items any) (bool, error) {
	value := reflect.ValueOf(items)
	for value.IsValid() && (value.Kind() == reflect.Pointer || value.Kind() == reflect.Interface) {
		if value.IsNil() {
			return false, nil
		}
		value = value.Elem()
	}
	if !value.IsValid() {
		return false, nil
	}
	switch value.Kind() {
	case reflect.Slice:
		return !value.IsNil(), nil
	case reflect.Array:
		return true, nil
	default:
		return false, fmt.Errorf("menu Items must be an array or slice, got %s", value.Kind())
	}
}
