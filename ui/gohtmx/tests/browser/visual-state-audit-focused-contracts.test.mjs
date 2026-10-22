import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {requestedStateContract,runRequestedStateActions} from './visual-state-audit-drivers.mjs';

const read=path=>readFile(new URL(`../../../../${path}`,import.meta.url),'utf8');

test('focused five-case action contracts stay explicit and source-backed',async()=>{
  const cases=[
    ['forms/HotkeyInput','HotkeyInput','hotkey-record-clear-restore',['record-shortcut','clear-shortcut','restore-shortcut']],
    ['forms/ShortcutRecorder','HotkeyInput','hotkey-record-clear-restore',['record-shortcut','clear-shortcut','restore-shortcut']],
    ['account/SignupForm','SignupForm','signup-terms-label',['fill-name','fill-email','fill-password','accept-terms-label']],
    ['navigation/Tabs','Tabs','tabs-panel-selection',['select-tab','keyboard-select-tab']],
    ['motion/Lottie Player','ParticleBackground','lottie-play-pause-frame-reset',['play-animation','pause-animation','seek-visible-frame','reset-visible-frame']],
  ];
  for(const [identity,kind,sequence,ids] of cases){
    const contract=requestedStateContract(identity);
    assert.equal(contract?.identity,identity);
    assert.equal(contract.kind,kind);
    assert.equal(contract.focusedSequence,sequence);
    assert.equal(contract.requestedStateOnly,true);
    assert.deepEqual(contract.mappingGaps,[]);
    assert.deepEqual(contract.steps.map(step=>step.id),ids);
    assert(contract.steps.every(step=>step.source.siteId.startsWith(`focused-state:${identity}:`)&&step.source.sourceAnchor===null&&step.source.provenance.length>0));
    assert.match(contract.scope,/separate from registered-check coverage/);
  }

  const [controls,formsTemplate,formsCSS,formsJS,controlsJS,interactionTemplate,interactionJS,interactionFixture,components]=await Promise.all([
    read('ui/gohtmx/templates/ely-controls.html'),read('ui/gohtmx/templates/ely-api-forms.html'),read('ui/gohtmx/assets/ely-api-forms.css'),read('ui/gohtmx/assets/ely-api-forms.js'),read('ui/gohtmx/assets/ely-controls.js'),
    read('ui/gohtmx/templates/ely-api-interaction.html'),read('ui/gohtmx/assets/ely-api-interaction.js'),read('internal/gallery/advanced_interaction_fixtures.go'),read('ui/gohtmx/components.json'),
  ]);
  assert.match(controls,/class="ely-api-hotkey-glyph"/);
  assert.match(formsCSS,/\.ely-api-hotkey-control \.ely-api-hotkey-glyph/);
  assert.match(formsCSS,/padding-inline-start:2rem/);
  assert.match(formsJS,/type==='SignupForm'/);
  assert.match(formsTemplate,/class="ely-suite-terms"><input type="checkbox" name="terms" required>/);
  assert.match(formsTemplate,/data-suite-validate="\{\{\.Kind\}\}"/);
  assert.match(formsJS,/form\.checkValidity\(\)/);
  assert.match(formsJS,/send\.disabled=disabled\(\)\|\|!valid/);
  assert.match(controlsJS,/if \(event\.key === 'Escape'\).*uiHotkeyPrevious/);
  assert.match(controlsJS,/if \(event\.key === 'Backspace' \|\| event\.key === 'Delete'\).*value = ''/);
  assert.match(interactionTemplate,/data-interaction-tab/);
  assert.match(interactionTemplate,/role="tabpanel"/);
  assert.match(interactionJS,/animation\.play\(\); status\.textContent = 'Animation playing'/);
  assert.match(interactionJS,/animation\.pause\(\); status\.textContent = 'Animation paused'/);
  assert.match(interactionJS,/animation\.goToAndStop\(Number\(seek\.value\)/);
  assert.match(interactionFixture,/"Autoplay": false, "Loop": false/);
  assert.match(components,/"ShortcutRecorder"/);
});

test('focused driver does not imply neighboring cases or catalog approval',()=>{
  for(const identity of ['forms/PasswordInput','navigation/EditorTabs','motion/ParticleBackground','account/LoginForm'])
    assert.equal(requestedStateContract(identity),null,`${identity} is outside this focused five-case scope`);
});

test('each declared focused sequence has a matching asserted driver path',()=>{
  const driver=runRequestedStateActions.toString();
  for(const id of ['record-shortcut','clear-shortcut','restore-shortcut','fill-name','fill-email','fill-password','accept-terms-label','select-tab','keyboard-select-tab','play-animation','pause-animation','seek-visible-frame','reset-visible-frame'])
    assert.match(driver,new RegExp(`runStep\\('${id}'`),`${id} must be executed by the focused driver`);
  assert.match(driver,/clickVisibleControl\(label\)/,'Signup terms must be activated by a hit-tested visible label');
  assert.match(driver,/await seek\.press\('Home'\)/,'Lottie reset must use the public range keyboard interaction');
  assert.match(driver,/node\.addEventListener\('ely:change'/,'Tabs and Lottie must observe real root-scoped change events');
  assert.match(driver,/name==='tab'&&change\.value===expected&&change\.selected===true/,'Tab changes must be asserted from their emitted detail');
  assert.match(driver,/name==='frame'&&change\.value===String\(expected\)/,'Lottie frame changes must be asserted from their emitted detail');
  assert.match(driver,/getBoundingClientRect\(\)/,'Lottie frame shape geometry must come from rendered SVG bounds');
  assert.match(driver,/movement>4/,'The moving marker must measurably change position at frame 50');
  assert.match(driver,/resetDelta<=1/,'Reset must restore independently observed frame-zero geometry');
});
