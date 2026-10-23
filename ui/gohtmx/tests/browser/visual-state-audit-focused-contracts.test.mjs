import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {assertCommunicationCallerRequest,assertEvalLastColumnGeometry,requestedStateContract,runRequestedStateActions} from './visual-state-audit-drivers.mjs';

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

test('Missing35 shipped communication fixtures have finite native local-action contracts with alias behavior deduplicated',async()=>{
  const expected={
    'agent/EvalResultTable':['sort-tokens-ascending','sort-tokens-descending','eval-scroll-last-column'],
    'calendar/CalendarMonthView':['month-page-down','month-open-day'],
    'calendar/CalendarWeekView':['week-scroll-late-events','week-open-samples','week-open-client','week-create-event','week-open-allday'],
    'calendar/TimeGrid':['week-scroll-late-events','week-open-samples','week-open-client','week-create-event','week-open-allday'],
    'calendar/AllDayRow':['week-scroll-late-events','week-open-samples','week-open-client','week-create-event','week-open-allday'],
    'calendar/CurrentTimeIndicator':['week-scroll-late-events','week-open-samples','week-open-client','week-create-event','week-open-allday'],
    'calendar/CalendarDayView':['day-scroll-late-events','day-open-samples','day-open-client','day-create-event'],
    'calendar/TimezoneOverlay':['day-scroll-late-events','day-open-samples','day-open-client','day-create-event'],
    'calendar/EventPopover':['popover-open','popover-edit','popover-delete','popover-close','popover-reopen','popover-escape'],
    'calendar/AttendeeList':['popover-open','popover-edit','popover-delete','popover-close','popover-reopen','popover-escape'],
  };
  const contracts=Object.entries(expected).map(([identity,ids])=>{
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.requestedStateOnly,true);assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),ids);
    assert(contract.steps.every(step=>step.event.includes('trusted native')&&step.source.siteId===`communication-state:${identity}:${step.id}`&&step.source.provenance.includes(identity)));
    return contract;
  });
  const byKey=new Map();for(const contract of contracts){const prior=byKey.get(contract.behaviorKey);if(prior)assert.deepEqual(contract.steps.map(step=>step.id),prior.steps.map(step=>step.id));else byKey.set(contract.behaviorKey,contract);}
  assert.equal(contracts.length,10,'All ten exact Missing35 gallery identities remain represented');
  assert.equal(byKey.size,5,'The five shared aliases do not inflate the unique handler roster');
  assert.equal(contracts.reduce((sum,contract)=>sum+contract.steps.length,0),45,'Each identity retains its own default-fixture action checkpoints');
  assert.equal([...byKey.values()].reduce((sum,contract)=>sum+contract.steps.length,0),20,'Unique local handler checkpoint total is deduplicated by behavior key');
  assert.equal(45*4,180,'Four mobile profiles require 180 identity/profile checkpoints');
  assert.equal(180*2,360,'Each checkpoint requires owned before/after PNGs');
  assert.equal(20*4*2,160,'Deduplicated handler comparison is 80 checkpoints/160 PNGs, not the capture denominator');
  assert.equal(requestedStateContract('calendar/MiniCalendar'),null,'Unrelated calendar siblings stay outside this contract');
  assert.equal(requestedStateContract('agent/TraceViewer'),null,'The canonical TraceViewer check does not create a second gallery specimen contract');
  assert.equal(requestedStateContract('calendar/CurrentTimeIndicator').directControlRole,'display-only indicator within the shared week fixture');
  assert.equal(requestedStateContract('calendar/TimezoneOverlay').directControlRole,'display-only overlay within the shared day fixture');
  assert.equal(requestedStateContract('calendar/AttendeeList').directControlRole,'display-only attendee content within the shared popover fixture');

  assert.throws(()=>assertCommunicationCallerRequest([{action:'delete-event',component:'calendar/EventPopover',value:'review'}],0,'calendar/EventPopover','edit-event','review'),/wrong caller request/,'A plausible but wrong host request must fail the causal control');
  assert.throws(()=>assertCommunicationCallerRequest([{action:'edit-event',component:'calendar/EventPopover',value:'review'},{action:'edit-event',component:'calendar/EventPopover',value:'review'}],0,'calendar/EventPopover','edit-event','review'),/exactly one new caller request/,'Duplicate host requests must fail the causal control');
  const visibleColumns=Array.from({length:6},()=>({insideRoot:true,insideClip:true}));
  assert.equal(assertEvalLastColumnGeometry({scrollLeft:200,previousScrollLeft:0,scrollWidth:580,clientWidth:380,columns:visibleColumns,actionsBefore:2,actionsAfter:2,initiallyVisible:false,didScroll:true}).overflow,true,'Scrollable final column is accepted after local wheel movement with no action');
  assert.equal(assertEvalLastColumnGeometry({scrollLeft:0,previousScrollLeft:0,scrollWidth:380,clientWidth:380,columns:visibleColumns,actionsBefore:2,actionsAfter:2,initiallyVisible:true,didScroll:false}).overflow,false,'A fitting final column is accepted by passive geometry with no wheel or host action');
  assert.throws(()=>assertEvalLastColumnGeometry({scrollLeft:200,previousScrollLeft:0,scrollWidth:580,clientWidth:380,columns:[...visibleColumns.slice(0,5),{insideRoot:true,insideClip:false}],actionsBefore:2,actionsAfter:2,initiallyVisible:false,didScroll:true}),/within the component root and local scrollport/,'A clipped final value cannot pass on wheel movement alone');
  assert.throws(()=>assertEvalLastColumnGeometry({scrollLeft:0,previousScrollLeft:0,scrollWidth:580,clientWidth:380,columns:visibleColumns,actionsBefore:2,actionsAfter:2,initiallyVisible:false,didScroll:false}),/requires native horizontal wheel input/,'An initially hidden final column cannot pass without native wheel input');
  assert.throws(()=>assertEvalLastColumnGeometry({scrollLeft:200,previousScrollLeft:0,scrollWidth:580,clientWidth:380,columns:visibleColumns,actionsBefore:2,actionsAfter:3,initiallyVisible:false,didScroll:true}),/must not emit a host action/,'The passive reachability checkpoint rejects an extra host action');

  const [driver,template,fixture,communicationJS,communicationCSS,actions]=await Promise.all([read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/templates/ely-api-communication.html'),read('internal/gallery/advanced_communication_fixtures.go'),read('ui/gohtmx/assets/ely-api-communication.js'),read('ui/gohtmx/assets/ely-api-communication.css'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs')]);
  assert.match(driver,/if\(contract\.focusedSequence\?\.startsWith\('communication-'\)\)/,'Legacy requested-state contracts may omit focusedSequence and must retain the safe optional guard');
  const communicationPath=driver.slice(driver.indexOf("if(contract.focusedSequence?.startsWith('communication-'))"),driver.indexOf("if(contract.focusedSequence==='vertical-range-native-scroll')"));
  assert.doesNotMatch(communicationPath,/\.dispatchEvent\(|innerHTML|scrollTop\s*=/,'Input stays native and no DOM injection or forced scroll substitutes for user actions');
  assert.match(communicationPath,/mouse\.wheel/);assert.match(communicationPath,/keyboard\.press\('Escape'\)/);assert.match(communicationPath,/aria-expanded/);assert.match(communicationPath,/assertCommunicationCallerRequest/);
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'The existing generic requested-state route must execute these communication contracts without a new whitelist');
  assert.match(communicationPath,/let beforeDate='',expectedDate='';[\s\S]*PageDown selection must equal the independently derived clamped next-month date/,'PageDown result must be checked against a date derived from the pre-action selected date');
  assert.match(communicationPath,/data-ely-date="2026-10-13"\]\[data-ely-time="16:00"/);assert.match(communicationPath,/data-ely-date="2026-10-13"\]\[data-ely-time="16:30"/);
  assert.match(communicationPath,/Exactly one Tuesday 16:00 slot must exist/);assert.match(communicationPath,/event\.start,'2026-10-13T16:00'/);assert.match(communicationPath,/event\.end,'2026-10-13T16:30'/);
  assert.match(communicationJS,/emit\(root,'create-event',\{start:values\[0\],end:values\[1\]\}\)/,'Calendar creation emits an interval payload from native pointer-drag input');
  assert.match(template,/<section class="ely-agent-evals">[\s\S]*?<table>/,'The evaluation table is nested inside its source-defined component section');
  assert.match(communicationCSS,/\.ely-agent-evals\{[^}]*overflow:auto/,'The evaluation section is the native horizontal scroll owner');assert.match(communicationCSS,/\.ely-agent-evals table\{[^}]*min-width:580px/,'The source table can exceed narrow profile width');
  assert.match(communicationPath,/owner=root\.locator\('\.ely-agent-evals'\)/,'The final-column check must use the component section that owns overflow');
  assert.match(communicationPath,/data-eval-column.*?time/,'The final header and cells must be selected by their source-initialized Time-column identity');
  assert.match(communicationPath,/mouse\.wheel\(Math\.max\(120,Math\.round\(box\.width\*\.75\)\),0\)/,'Overflow is inspected with bounded native horizontal wheel input');
  assert.match(communicationPath,/if\(current\.scrollWidth>current\.clientWidth&&!initiallyVisible\)/,'The driver scrolls only when local overflow clips the final column');
  assert.match(fixture,/\{"Value": "time", "Label": "Time"\}/,'The last asserted column is the default fixture Time field');
  assert.equal((template.match(/data-ely-calendar-time-slot data-ely-date="\{\{\.Date\}\}" data-ely-time="\{\{\$slotTime\}\}"/g)||[]).length,2,'Week and day time slots expose both date and time for an exact column match');
  assert.match(communicationPath,/mouse\.wheel\([\s\S]*?requestAnimationFrame\(\(\)=>requestAnimationFrame\(resolve\)\)/,'Every bounded wheel input must settle through two animation frames before reachability is rechecked');
  const calendarKeydown=communicationJS.slice(communicationJS.indexOf("root.addEventListener('keydown',event=>{const day="),communicationJS.indexOf("},options);",communicationJS.indexOf("root.addEventListener('keydown',event=>{const day="))+10);
  assert.match(calendarKeydown,/event\.stopImmediatePropagation\(\)[\s\S]*calendarShift\(day\.value,delta\)[\s\S]*navigate\(delta<0\?'previous':'next',date\)[\s\S]*selectDay\(date\)[\s\S]*next\?\.focus\(\)/,'CalendarMonthView PageDown uses the stateful calendar handler, not the event-only generic fallback');
  assert.match(communicationJS,/emit\(root,'calendar-navigation',\{direction,view:kind,date:shown\}\)/,'The stateful calendar handler emits the navigated date in its caller payload');
  assert(communicationJS.indexOf("if(root.dataset.elyComponent?.startsWith('calendar/'))mountCalendar(root,lifecycle)")<communicationJS.indexOf("root.addEventListener('keydown',onKeyDown)"),'The calendar handler registers before the generic event-only fallback and stops propagation for calendar-day keys');
  assert.match(template,/<td>\{\{\.\}\}<\/td>/,'Evaluation cells remain html/template-escaped text');
  assert.match(template,/\{\{\.Content\}\}/);assert.match(template,/\{\{\.Name\}\}/);assert.doesNotMatch(template,/template\.HTML/,'Communication caller data is not promoted to trusted HTML');
  assert.match(fixture,/case "CalendarWeekView"/);assert.match(fixture,/case "CalendarDayView"/);assert.match(fixture,/case "EventPopover"/);
});
