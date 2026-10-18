package ui

import (
	"fmt"
	"math"
	"reflect"
	"strconv"
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

// ValidateContextRequestNumber validates the lossless decimal spelling of an
// owner request number. No floating-point conversion is involved.
func ValidateContextRequestNumber(number string) error {
	const max = "18446744073709551615"
	if len(number) == 0 || len(number) > len(max) || len(number) > 1 && number[0] == '0' {
		return fmt.Errorf("context request Number must be a canonical decimal u64 string")
	}
	for _, c := range number {
		if c < '0' || c > '9' {
			return fmt.Errorf("context request Number must be a canonical decimal u64 string")
		}
	}
	if len(number) == len(max) && number > max {
		return fmt.Errorf("context request Number exceeds u64")
	}
	return nil
}

type contextMenuRequest struct{ Number, X, Y string }
type contextMenuConfig struct {
	Mode    string
	Request *contextMenuRequest
}

// The standalone renderer validates even an inert automatic-mode request.
// Only validated primitives are serialized into ordinary escaped attributes.
func menuContextConfig(props map[string]any) (contextMenuConfig, error) {
	config := contextMenuConfig{Mode: "automatic"}
	if raw, exists := props["ContextMode"]; exists {
		mode, ok := raw.(string)
		if !ok || mode != "automatic" && mode != "manual" {
			return config, fmt.Errorf("ContextMode must be automatic or manual")
		}
		config.Mode = mode
	}
	raw := props["ContextRequest"]
	if raw == nil {
		return config, nil
	}
	request, ok := raw.(map[string]any)
	if !ok {
		return config, fmt.Errorf("ContextRequest must be a nullable object")
	}
	if request == nil {
		return config, nil
	}
	if len(request) != 3 {
		return config, fmt.Errorf("ContextRequest requires only Number, X and Y")
	}
	number, ok := request["Number"].(string)
	if !ok {
		return config, fmt.Errorf("context request Number must be a string")
	}
	if err := ValidateContextRequestNumber(number); err != nil {
		return config, err
	}
	coordinate := func(key string) (string, error) {
		value := reflect.ValueOf(request[key])
		var number float64
		if !value.IsValid() {
			return "", fmt.Errorf("context request %s must be a finite number", key)
		}
		switch value.Kind() {
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			number = float64(value.Int())
		case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			number = float64(value.Uint())
		case reflect.Float32, reflect.Float64:
			number = value.Float()
		default:
			return "", fmt.Errorf("context request %s must be a finite number", key)
		}
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return "", fmt.Errorf("context request %s must be a finite number", key)
		}
		return strconv.FormatFloat(number, 'g', -1, 64), nil
	}
	x, err := coordinate("X")
	if err != nil {
		return config, err
	}
	y, err := coordinate("Y")
	if err != nil {
		return config, err
	}
	config.Request = &contextMenuRequest{Number: number, X: x, Y: y}
	return config, nil
}
