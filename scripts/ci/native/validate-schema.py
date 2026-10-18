"""Validate real Go fixtures and reject unusable native action shapes."""
import copy
import json
from pathlib import Path
from jsonschema import Draft202012Validator

root = Path(__file__).resolve().parents[3]
validator = Draft202012Validator(json.loads((root / 'contracts/native/profile-v1/schema.json').read_text()))
for path in (root / 'contracts/native/profile-v1/fixtures').glob('profile-*.json'):
    validator.validate(json.loads(path.read_text()))
    print('Validated', path.name)

ready = json.loads((root / 'contracts/native/profile-v1/fixtures/profile-controls-ready.json').read_text())
action = {key: ready[key] for key in ['protocolVersion', 'screenID', 'screenRevision', 'sessionID', 'requestID', 'dataVersion', 'fields']}
action.update(nodeID='profile-form', event='submit', action='save-profile', target='profile-region',
              editRevisions={key: 0 for key in ready['fields']}, capabilities=ready['requiredCapabilities'])
validator.validate(action)
invalid = copy.deepcopy(action)
invalid['editRevisions'] = {}
assert list(validator.iter_errors(invalid)), 'Empty edit revisions must fail schema validation'
for suffix in ['\n', '\r', '\r\n', '\u2028']:
    invalid = copy.deepcopy(action)
    invalid['fields']['company' + suffix] = invalid['fields'].pop('company')
    assert list(validator.iter_errors(invalid)), 'Field names must match the complete grammar'
print('Rejected empty revisions and trailing-line-break field names')

# Nested option records and unsupported modes must not pass the wire schema.
select = next(n for n in ready['region']['children'][0]['children'][2]['children'] if n['type'] == 'select')
for mutate in [
    lambda n: n['props'].update(options=[]),
    lambda n: n['props']['options'][0].update(value=1),
    lambda n: n['props']['options'][0].update(disabled=True),
    lambda n: n['props'].update(multiple=False),
    lambda n: n.update(children=[copy.deepcopy(select)]),
]:
    invalid_node = copy.deepcopy(select)
    mutate(invalid_node)
    node_validator = Draft202012Validator({'$ref': '#/$defs/node', '$defs': validator.schema['$defs']})
    assert list(node_validator.iter_errors(invalid_node)), 'Invalid select must fail schema validation'
print('Rejected malformed options and unsupported select modes')
