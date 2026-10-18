package sdui

import (
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"
)

const MaxConditionNodes = 128
const MaxConditionDepth = 16

type compiledCondition struct {
	op         string
	ref        bindingRef
	value      conditionScalar
	conditions []*compiledCondition
}
type conditionScalar struct {
	kind    string
	text    string
	boolean bool
	number  *big.Rat
}
type compiledRepeat struct {
	items   bindingRef
	as      string
	key     []string
	keyPath string
}

func scalarCondition(value any) (conditionScalar, error) {
	switch v := value.(type) {
	case nil:
		return conditionScalar{kind: "null"}, nil
	case string:
		if len(v) > MaxStringBytes {
			return conditionScalar{}, fmt.Errorf("condition string exceeds limit")
		}
		return conditionScalar{kind: "string", text: v}, nil
	case bool:
		return conditionScalar{kind: "boolean", boolean: v}, nil
	case json.Number:
		if len(v) > 128 || !jsonNumeric.MatchString(string(v)) {
			return conditionScalar{}, fmt.Errorf("invalid condition number")
		}
		if index := strings.IndexAny(string(v), "eE"); index >= 0 {
			exponent, err := strconv.Atoi(string(v)[index+1:])
			if err != nil || exponent < -308 || exponent > 308 {
				return conditionScalar{}, fmt.Errorf("condition exponent exceeds limit")
			}
		}
		f, err := v.Float64()
		if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
			return conditionScalar{}, fmt.Errorf("invalid condition number")
		}
		n, ok := new(big.Rat).SetString(string(v))
		if !ok {
			return conditionScalar{}, fmt.Errorf("invalid condition number")
		}
		return conditionScalar{kind: "number", number: n}, nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return conditionScalar{}, fmt.Errorf("invalid condition number")
		}
		// Match JSON's decimal representation rather than binary floating-point noise.
		return scalarCondition(json.Number(strconv.FormatFloat(v, 'g', -1, 64)))
	case float32:
		return scalarCondition(json.Number(strconv.FormatFloat(float64(v), 'g', -1, 32)))
	default:
		n, err := exactInteger(value)
		if err != nil {
			return conditionScalar{}, fmt.Errorf("condition values must be scalar JSON data")
		}
		return conditionScalar{kind: "number", number: new(big.Rat).SetInt64(int64(n))}, nil
	}
}

func compileCondition(condition *Condition, scope bindingScope) (*compiledCondition, error) {
	if condition == nil {
		return nil, nil
	}
	count := 0
	var compile func(Condition, int) (*compiledCondition, error)
	compile = func(c Condition, depth int) (*compiledCondition, error) {
		count++
		if count > MaxConditionNodes || depth > MaxConditionDepth {
			return nil, fmt.Errorf("condition exceeds complexity limit")
		}
		result := &compiledCondition{op: c.Op}
		switch c.Op {
		case "eq", "ne", "exists":
			if len(c.Conditions) != 0 {
				return nil, fmt.Errorf("condition %s cannot contain conditions", c.Op)
			}
			ref, err := parseBinding(c.Path, scope)
			if err != nil {
				return nil, err
			}
			result.ref = ref
			if c.Op == "exists" && c.Value != nil {
				return nil, fmt.Errorf("exists condition cannot have a value")
			}
			if c.Op != "exists" {
				value, err := scalarCondition(c.Value)
				if err != nil {
					return nil, err
				}
				result.value = value
				property, known, err := parameterProperty(ref, scope)
				if err != nil {
					return nil, err
				}
				if known && len(property.OneOf) == 0 && value.kind != "null" {
					expected := string(property.Type)
					if property.Type == Integer {
						expected = "number"
					}
					if expected != value.kind {
						return nil, fmt.Errorf("condition %q compares parameter %s with %s", ref.path, property.Type, value.kind)
					}
				}
			}
		case "all", "any", "not":
			if c.Path != "" || c.Value != nil {
				return nil, fmt.Errorf("condition %s cannot have a path or value", c.Op)
			}
			if len(c.Conditions) == 0 || len(c.Conditions) > 32 || (c.Op == "not" && len(c.Conditions) != 1) {
				return nil, fmt.Errorf("condition %s has invalid child count", c.Op)
			}
			for _, child := range c.Conditions {
				compiled, err := compile(child, depth+1)
				if err != nil {
					return nil, err
				}
				result.conditions = append(result.conditions, compiled)
			}
		default:
			return nil, fmt.Errorf("unknown condition operator %q", c.Op)
		}
		return result, nil
	}
	return compile(*condition, 1)
}

func (condition *compiledCondition) evaluate(scope resolveScope) (bool, error) {
	if condition == nil {
		return true, nil
	}
	switch condition.op {
	case "all":
		for _, child := range condition.conditions {
			match, err := child.evaluate(scope)
			if err != nil || !match {
				return false, err
			}
		}
		return true, nil
	case "any":
		for _, child := range condition.conditions {
			match, err := child.evaluate(scope)
			if err != nil {
				return false, err
			}
			if match {
				return true, nil
			}
		}
		return false, nil
	case "not":
		match, err := condition.conditions[0].evaluate(scope)
		return !match, err
	}
	value, present, err := condition.ref.lookup(scope)
	if err != nil {
		return false, err
	}
	if condition.op == "exists" {
		return present, nil
	}
	if !present {
		return false, nil
	}
	scalar, err := scalarCondition(value)
	if err != nil {
		return false, err
	}
	equal := false
	if scalar.kind != condition.value.kind {
		if scalar.kind != "null" && condition.value.kind != "null" {
			return false, fmt.Errorf("condition %q compares %s with %s", condition.ref.path, scalar.kind, condition.value.kind)
		}
	} else {
		switch scalar.kind {
		case "null":
			equal = true
		case "string":
			equal = scalar.text == condition.value.text
		case "boolean":
			equal = scalar.boolean == condition.value.boolean
		case "number":
			equal = scalar.number.Cmp(condition.value.number) == 0
		}
	}
	if condition.op == "ne" {
		equal = !equal
	}
	return equal, nil
}

func repeatKey(value any) (string, error) {
	if s, ok := value.(string); ok {
		if len(s) > MaxStringBytes {
			return "", fmt.Errorf("repeat key exceeds limit")
		}
		return "s:" + s, nil
	}
	n, err := exactInteger(value)
	if err != nil {
		return "", fmt.Errorf("repeat key must be a string or integer")
	}
	return "n:" + strconv.Itoa(n), nil
}
