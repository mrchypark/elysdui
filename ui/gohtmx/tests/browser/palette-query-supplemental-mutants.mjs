import assert from 'node:assert/strict';
// Each causal control changes one exact production source site in served bytes.
// Source files stay untouched. Raw browser failure is never converted to pass.
const active = "if (option) field.setAttribute('aria-activedescendant', option.id);";
export const supplementalMutants = {
 'focus-button': {find:'queryField.focus({preventScroll: true});',replace:'options[next].focus();',kills:['rank.arrow.input-focus','scroll.step-0.input-focus']},
 'active-missing': {find:active,replace:"if (option) field.removeAttribute('aria-activedescendant');",kills:['rank.query.active-local-selected']},
 'active-peer': {find:active,replace:"if (option) field.setAttribute('aria-activedescendant', document.querySelector('#palette-peer [data-interaction-palette-option]').id);",kills:['rank.query.active-local-selected']},
 'option-peer-id': {find:active,replace:"if (option) { option.id = document.querySelector('#palette-peer [data-interaction-palette-option]').id; field.setAttribute('aria-activedescendant', option.id); }",kills:['rank.query.source-owned-ids','rank.query.unique-peer-ids']},
 'option-role': {find:active,replace:"if (option) { option.setAttribute('role', 'button'); field.setAttribute('aria-activedescendant', option.id); }",kills:['rank.query.raw-option-roles','rank.query.active-local-selected']},
 'list-role': {find:active,replace:"if (option) { palette.querySelector('[data-interaction-palette-results]').setAttribute('role', 'group'); field.setAttribute('aria-activedescendant', option.id); }",kills:['rank.query.controlled-list']},
 'controls-peer': {find:active,replace:"if (option) { field.setAttribute('aria-controls', document.querySelector('#palette-peer [data-interaction-palette-results]').id); field.setAttribute('aria-activedescendant', option.id); }",kills:['rank.query.controlled-list']},
 'wrong-enter': {find:"(document.activeElement?.closest('[data-interaction-palette-option]') || options[Math.max(selected, 0)])?.click();",replace:'options[0]?.click();',kills:['rank.enter.completed-payload','scroll.enter.completed-payload']},
 'no-scroll': {find:"if (scroll && palette.open) option?.scrollIntoView({block: 'nearest', inline: 'nearest'});",replace:'void scroll; // causal no-scroll control',kills:['scroll.step-27.selected-inside-list','scroll.step-56.selected-inside-list']},
};
export const supplementalModes = ['control',...Object.keys(supplementalMutants)];
export function supplementalMutation(source,mode) {
 assert(supplementalModes.includes(mode));
 if(mode==='control')return source;
 const rule=supplementalMutants[mode];assert.equal(source.split(rule.find).length,2,'one exact production mutation site: '+mode);
 const changed=source.replace(rule.find,rule.replace);assert.notEqual(changed,source);return changed;
}
