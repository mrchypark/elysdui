import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {assertCommunicationCallerRequest,assertDockCallerAction,assertDockNativeEvents,assertEvalLastColumnGeometry,assertNativeEmbedOpen,calendarDraftWheelDecision,requestedStateContract,runRequestedStateActions} from './visual-state-audit-drivers.mjs';

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
    'calendar/CalendarDayView':['day-scroll-late-events','day-open-samples','day-open-client','day-create-event','day-reveal-created-draft'],
    'calendar/TimezoneOverlay':['day-scroll-late-events','day-open-samples','day-open-client','day-create-event','day-reveal-created-draft'],
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
  assert.equal(contracts.reduce((sum,contract)=>sum+contract.steps.length,0),47,'Each identity retains its default-fixture checkpoints, including the appended day draft reveal for each exact identity');
  assert.equal([...byKey.values()].reduce((sum,contract)=>sum+contract.steps.length,0),21,'Unique local handler checkpoint total is deduplicated by behavior key');
  assert.equal(47*4,188,'Four mobile profiles require 188 identity/profile checkpoints');
  assert.equal(188*2,376,'Each checkpoint requires owned before/after PNGs');
  assert.equal(21*4*2,168,'Deduplicated handler comparison is 84 checkpoints/168 PNGs, not the alias-expanded capture denominator');
  assert.equal(5*2*4,40,'The requested day rerun is two exact identities × four mobile profiles × five checkpoints');
  assert.equal(40*2,80,'The requested day rerun requires 80 owned before/after PNGs');
  assert.equal(requestedStateContract('calendar/MiniCalendar'),null,'Unrelated calendar siblings stay outside this contract');
  assert.equal(requestedStateContract('agent/TraceViewer'),null,'The canonical TraceViewer check does not create a second gallery specimen contract');
  assert.equal(requestedStateContract('calendar/CurrentTimeIndicator').directControlRole,'display-only indicator within the shared week fixture');
  assert.equal(requestedStateContract('calendar/TimezoneOverlay').directControlRole,'display-only overlay within the shared day fixture');
  assert.equal(requestedStateContract('calendar/AttendeeList').directControlRole,'display-only attendee content within the shared popover fixture');
  const day=requestedStateContract('calendar/CalendarDayView');
  assert.deepEqual(day.steps.slice(0,4).map(step=>step.id),['day-scroll-late-events','day-open-samples','day-open-client','day-create-event'],'The four existing day checkpoints remain in their original order');
  assert.equal(day.steps[4].id,'day-reveal-created-draft');
  assert.match(day.steps[4].expectedState,/complete painted.*16:00.*16:30/);

  const notificationReview=requestedStateContract('feedback/Notification').steps.find(step=>step.id==='notification-open-review');
  assert.match(notificationReview.expectedState,/review\(""\)/,'Nested Review actions do not inherit the notification row value');
  assert.equal(assertCommunicationCallerRequest([{action:'review',component:'feedback/Notification',value:''}],0,'feedback/Notification','review','').event.value,'');
  assert.throws(()=>assertCommunicationCallerRequest([{action:'review',component:'feedback/Notification',value:'review'}],0,'feedback/Notification','review',''),/default-fixture value/,'A row-derived value must not be invented for nested notification actions');

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

test('WebSocket history and day-event draft reveals append native-wheel checkpoints without changing prior actions',async()=>{
  const socket=requestedStateContract('devtools/WebSocketConsole'),day=requestedStateContract('calendar/CalendarDayView'),dayAlias=requestedStateContract('calendar/TimezoneOverlay');
  assert.deepEqual(socket.steps.slice(0,12).map(step=>step.id),['empty-enter','type-ping','send-enter','type-pong','send-button','request-disconnect','host-ack-closed','type-closed-draft','closed-enter','clear-closed-draft','request-connect','host-ack-open'],'All twelve existing WebSocket send, event, and host-ack checkpoints remain unchanged');
  assert.equal(socket.steps[12].id,'history-wheel-reveal');assert(socket.steps[12].event.includes('native'));assert(socket.steps[12].expectedState.includes('complete first history row'));
  assert.deepEqual(day.steps.slice(0,4).map(step=>step.id),['day-scroll-late-events','day-open-samples','day-open-client','day-create-event'],'All four existing day checkpoints remain unchanged');
  assert.equal(day.steps[4].id,'day-reveal-created-draft');assert.equal(dayAlias.steps[4].id,'day-reveal-created-draft');assert.deepEqual(dayAlias.steps.map(step=>step.id),day.steps.map(step=>step.id));
  assert.equal(13*2,26,'Two WebSocket mobile themes require 26 checkpoints');assert.equal(26*2,52,'WebSocket replay needs 52 before/after primary images');
  assert.equal(5*2*4,40,'Two day identities across four mobile profiles require 40 checkpoints');assert.equal(40*2,80,'Day replay needs 80 before/after primary images');
  const driver=await read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),socketStart=driver.indexOf("if(contract.focusedSequence==='websocket-public-host-boundary')"),socketEnd=driver.indexOf("if(['sheet-native-actions'",socketStart),calendarStart=driver.indexOf("if(contract.focusedSequence==='communication-calendar-week'||contract.focusedSequence==='communication-calendar-day')"),calendarEnd=driver.indexOf("if(contract.focusedSequence==='communication-event-popover')",calendarStart);
  assert(socketStart>=0&&socketEnd>socketStart&&calendarStart>=0&&calendarEnd>calendarStart);
  const socketPath=driver.slice(socketStart,socketEnd),calendarPath=driver.slice(calendarStart,calendarEnd);
  assert.match(socketPath,/root\.page\(\)\.mouse\.wheel\(0,-Math\.max\(120/);assert.match(socketPath,/scrollTop:[^,]+,scrollHeight:[^,]+,clientHeight:[^,]+,scrollMax:/);assert.match(socketPath,/firstRowFullyVisible/);assert.match(socketPath,/history-log/);
  assert.match(calendarPath,/root\.page\(\)\.mouse\.wheel\(decision\.deltaX,decision\.deltaY\)/);assert.match(calendarPath,/scrollLeft:node\.scrollLeft,scrollWidth:node\.scrollWidth,clientWidth:node\.clientWidth,scrollMaxX/);assert.match(calendarPath,/scrollTop:node\.scrollTop,scrollHeight:node\.scrollHeight,clientHeight:node\.clientHeight,scrollMaxY/);assert.match(calendarPath,/draftVisible/);assert.match(calendarPath,/New event · 16:00 – 16:30/);assert.match(calendarPath,/nativeWheels/);
  assert.match(driver,/export function calendarDraftWheelDecision/);assert.match(driver,/if\(left<metrics\.clip\.left\)[\s\S]*?if\(right>metrics\.clip\.right\)[\s\S]*?if\(top<metrics\.clip\.top\)[\s\S]*?if\(bottom>metrics\.clip\.bottom\)/,'The pure classifier resolves horizontal bounds before vertical bounds');
  assert.doesNotMatch(socketPath,/scrollTop\s*=(?!=)|\.scrollIntoView\(|\.style\s*\./,'WebSocket reveal uses native input without forced DOM scrolling or style writes');
  assert.doesNotMatch(calendarPath,/scrollTop\s*=(?!=)|\.scrollIntoView\(|\.style\s*\./,'Calendar reveal uses native input without forced DOM scrolling or style writes');
});

test('calendar draft reveal classifies horizontal clipping before vertical clipping and rejects unreachable text',()=>{
  const metrics=({rects,scrollLeft=0,scrollTop=20})=>({textRects:rects,scrollLeft,scrollWidth:400,clientWidth:300,scrollMaxX:100,scrollTop,scrollHeight:300,clientHeight:100,scrollMaxY:200,clip:{left:0,right:300,top:0,bottom:100}});
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:298,right:312,top:95,bottom:115}]})),{axis:'horizontal',deltaX:12,deltaY:0},'Horizontal overrun takes precedence and does not issue a vertical wheel');
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:-5,right:50,top:20,bottom:35}],scrollLeft:10})),{axis:'horizontal',deltaX:-5,deltaY:0},'A left-clipped fragment uses native horizontal movement toward the start');
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:20,right:80,top:95,bottom:115}]})),{axis:'vertical',deltaX:0,deltaY:15},'Vertical movement is selected only after horizontal bounds fit');
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:20,right:80,top:-5,bottom:35}],scrollTop:10})),{axis:'vertical',deltaX:0,deltaY:-5},'A top-clipped fragment uses native vertical movement toward the start');
  assert.equal(calendarDraftWheelDecision(metrics({rects:[{left:-5,right:20,top:10,bottom:30}]})).reason,'Calendar draft remains clipped at the horizontal start endpoint');
  assert.equal(calendarDraftWheelDecision(metrics({rects:[{left:20,right:330,top:10,bottom:30}]})).reason,'Calendar draft text spans 310px, wider than the owned 300px horizontal scrollport');
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:20,right:80,top:10,bottom:30}]})),{axis:'visible',deltaX:0,deltaY:0});
});

test('IframeEmbed and EmbedCard retain exact native host-open contracts without provider navigation',async()=>{
  const identities=[['misc/IframeEmbed','iframe-open-host'],['misc/EmbedCard','embedcard-open-host']],url='https://example.com',sourceNote='Web views need macOS for now.';
  for(const [identity,stepId]of identities){
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.kind,'IframeEmbed');assert.equal(contract.family,'native');assert.equal(contract.requestedStateOnly,true);assert.equal(contract.focusedSequence,'native-embed-open-host');assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),[stepId]);
    const step=contract.steps[0];assert.equal(step.control,'header button[data-ely-action="open"][data-value="https://example.com"]');assert.match(step.event,/trusted native Playwright button click/);assert(step.expectedState.includes('exact URL')&&step.expectedState.includes('remain unchanged'));assert.equal(step.source.siteId,`native-state:${identity}:${stepId}`);assert(step.source.provenance.includes(identity));
  }
  assert.equal(identities.length*4,8,'Two exact identities over four live profiles require eight checkpoints');assert.equal(identities.length*4*2,16,'Each checkpoint requires before/after primary captures');

  const [catalogue,fixtures,template,api,driver,actions]=await Promise.all([read('ui/gohtmx/components.json'),read('internal/gallery/assets/native-misc-fixtures.json'),read('ui/gohtmx/templates/ely-api-native.html'),read('ui/gohtmx/assets/ely-api.js'),read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs')]);
  const pages=JSON.parse(catalogue).pages,story=pages.flatMap(page=>page.stories).find(item=>item.name==='IframeEmbed'),fixture=JSON.parse(fixtures).IframeEmbed;
  assert.deepEqual(story.components,['IframeEmbed','EmbedCard'],'EmbedCard is the native catalogue alias, with a separate gallery identity');assert.equal(fixture.URL,url);assert.equal(fixture.SourceNote,sourceNote);assert.equal(fixture.HideHeader,true,'The source fixture header policy must remain as-authored');
  assert.match(template,/<header><span>◎ \{\{\.URL\}\}<\/span><button type="button" data-ely-action="\{\{or \.Action "open"\}\}" data-value="\{\{\.URL\}\}" aria-label="Open with host">/,'The embedded native header action stays rendered independently of the source note');
  assert.match(api,/emit\(root, button\.dataset\.elyAction, \{ value: button\.value \|\| button\.dataset\.value \|\| ''/);assert.match(api,/detail: \{ \.\.\.detail, id: root\.id, component: root\.dataset\.elyComponent, action \}/);assert.doesNotMatch(api,/window\.open\s*\(/,'The control emits to the host; it does not navigate or launch an external provider');
  const embedPath=runRequestedStateActions.toString().slice(runRequestedStateActions.toString().indexOf("if(contract.focusedSequence==='native-embed-open-host')"),runRequestedStateActions.toString().indexOf("if(contract.focusedSequence==='dock-native-actions')"));
  assert.match(embedPath,/header button\[data-ely-action="open"\]\[data-value="https:\/\/example\.com"\]/);assert.match(embedPath,/button\.click\(\)/);assert.match(embedPath,/event\.isTrusted/);assert.match(embedPath,/finally/);assert.doesNotMatch(embedPath,/dispatchEvent|window\.open/,'Native input and host request must not be replaced by synthetic dispatch or navigation');
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'The existing generic requested-state route must execute both Embed identities');

  for(const [identity]of identities){
    const rootId=`audit-${identity.replace('/','-')}`,before={id:rootId,component:identity,kind:'IframeEmbed',button:{action:'open',value:url,disabled:false,ariaLabel:'Open with host'},sourceNote,iframeCount:0};
    const action={id:rootId,component:identity,action:'open',value:url},click={trusted:true,id:rootId,component:identity,action:'open',value:url};
    assert.deepEqual(assertNativeEmbedOpen({actions:[action],clicks:[click],identity,rootId,url,before,after:{...before,button:{...before.button}}}),{identity,rootId,url,action:'open',trustedClick:true,localStateUnchanged:true});
    assert.throws(()=>assertNativeEmbedOpen({actions:[{...action,value:'https://wrong.example'}],clicks:[click],identity,rootId,url,before,after:before}),/exact fixture URL/,'A wrong host URL cannot pass');
    const wrongIdentity=identity==='misc/IframeEmbed'?'misc/EmbedCard':'misc/IframeEmbed';
    assert.throws(()=>assertNativeEmbedOpen({actions:[{...action,component:wrongIdentity}],clicks:[click],identity,rootId,url,before,after:before}),/alias identity/,'An alias action cannot be relabeled as its canonical component');
    assert.throws(()=>assertNativeEmbedOpen({actions:[{...action,id:'other-root'}],clicks:[click],identity,rootId,url,before,after:before}),/exact rendered root ID/,'An action from another component root cannot pass');
    assert.throws(()=>assertNativeEmbedOpen({actions:[action],clicks:[{...click,trusted:false}],identity,rootId,url,before,after:before}),/trusted browser input/,'Synthetic click cannot pass');
    assert.throws(()=>assertNativeEmbedOpen({actions:[action],clicks:[click],identity,rootId,url,before,after:{...before,iframeCount:1}}),/must not mutate/,'A provider/frame poststate cannot pass as this host-only fixture action');
  }
});

test('Dock default fixture covers four native tab clicks, Enter/Space activation, and one native HTML drop',async()=>{
  const contract=requestedStateContract('layout/Dock'),ids=['dock-click-files','dock-click-outline','dock-click-search','dock-click-terminal','dock-key-enter-search','dock-key-space-search','dock-drag-files-center'];
  assert.equal(contract?.kind,'Dock');assert.equal(contract.requestedStateOnly,true);assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),ids);
  assert(contract.steps.every(step=>step.source.siteId.startsWith('dock-state:layout/Dock:')&&step.source.sourceAnchor.includes('ely-api-foundation')));
  assert.match(contract.steps[4].event,/trusted native.*keyboard/);assert.match(contract.steps[5].event,/trusted native.*keyboard/);assert.match(contract.steps[6].event,/trusted native.*HTML drag-and-drop/);
  assert.equal(ids.length,7,'Dock contributes seven distinct target checkpoints per selected profile');

  assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Files'}],0,'layout/Dock','Files');
  assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Files',dock:'center'}],0,'layout/Dock','Files','center');
  assert.throws(()=>assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Outline'}],0,'layout/Dock','Files'),/Files/,'A wrong tab payload cannot pass');
  assert.throws(()=>assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Files'},{action:'change',component:'layout/Dock',value:'Files'}],0,'layout/Dock','Files'),/exactly one/,'Duplicate host requests cannot pass');
  assert.throws(()=>assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Files',dock:'right'}],0,'layout/Dock','Files','center'),/center/,'A drop into a different zone cannot pass');
  assertDockNativeEvents('dock-click-files',[{type:'click',trusted:true,detail:1,tab:'Files'}],'Files');
  assertDockNativeEvents('dock-key-enter-search',[{type:'keydown',trusted:true,key:'Enter',tab:'Search'},{type:'click',trusted:true,detail:0,tab:'Search'},{type:'keyup',trusted:true,key:'Enter',tab:'Search'}],'Search');
  assertDockNativeEvents('dock-key-space-search',[{type:'keydown',trusted:true,key:' ',tab:'Search'},{type:'keyup',trusted:true,key:' ',tab:'Search'},{type:'click',trusted:true,detail:0,tab:'Search'}],'Search');
  assertDockNativeEvents('dock-drag-files-center',[{type:'dragstart',trusted:true,tab:'Files'},{type:'dragover',trusted:true,zone:'center'},{type:'drop',trusted:true,zone:'center',transferText:'Files'}],'Files');
  assert.throws(()=>assertDockNativeEvents('dock-click-files',[{type:'click',trusted:false,detail:1,tab:'Files'}],'Files'),/trusted browser input/,'Synthetic click dispatch cannot pass');
  assert.throws(()=>assertDockNativeEvents('dock-key-enter-search',[{type:'keydown',trusted:true,key:'Enter',tab:'Search'},{type:'keyup',trusted:true,key:'Enter',tab:'Search'},{type:'click',trusted:true,detail:0,tab:'Search'}],'Search'),/browser key order/,'Enter in Space order cannot pass');
  assert.throws(()=>assertDockNativeEvents('dock-key-space-search',[{type:'keydown',trusted:true,key:' ',tab:'Search'},{type:'click',trusted:true,detail:0,tab:'Search'},{type:'keyup',trusted:true,key:' ',tab:'Search'}],'Search'),/browser key order/,'Space in Enter order cannot pass');
  assert.throws(()=>assertDockNativeEvents('dock-drag-files-center',[{type:'dragstart',trusted:true,tab:'Files'},{type:'drop',trusted:false,zone:'center',transferText:'Files'}],'Files'),/trusted browser input/,'Synthetic drop cannot pass');
  assert.throws(()=>assertDockNativeEvents('dock-drag-files-center',[{type:'dragstart',trusted:true,tab:'Files'},{type:'drop',trusted:true,zone:'right',transferText:'Files'}],'Files'),/center/,'A drop into the wrong zone cannot pass');

  const [template,fixture,foundation,driver,actions]=await Promise.all([read('ui/gohtmx/templates/ely-api-foundation.html'),read('internal/gallery/advanced_foundation_fixtures.go'),read('ui/gohtmx/assets/ely-api-foundation.js'),read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs')]);
  assert.match(template,/data-foundation-dock-zone="left"[\s\S]*data-foundation-dock-zone="center"[\s\S]*data-foundation-dock-zone="right"[\s\S]*data-foundation-dock-zone="bottom"/,'The contract targets the four default template zones');
  assert.match(fixture,/case "Dock":[\s\S]*"Items": \[\]string\{"Files", "Outline", "Search"\}/,'The default Dock labels are source-backed');
  assert.match(foundation,/const dockTab = event\.target\.closest\('\[data-foundation-dock-tab\]'\)/);assert.match(foundation,/emit\(root, 'change', \{value: dockTab\.textContent\}\)/);
  assert.match(foundation,/const onDragStart = event => \{ const tab = event\.target\.closest\?\.\('\[data-foundation-dock-tab\]'\)/);assert.match(foundation,/emit\(root, 'change', \{dock: dockZone\.dataset\.foundationDockZone, value: label\}\)/);
  const dockPath=runRequestedStateActions.toString().slice(runRequestedStateActions.toString().indexOf("if(contract.focusedSequence==='dock-native-actions')"),runRequestedStateActions.toString().indexOf("if(contract.focusedSequence==='foundation-native-resize')"));
  assert.match(dockPath,/\.click\(\)/);assert.match(dockPath,/\.press\(key\)/);assert.match(dockPath,/\.dragTo\(target\)/);assert.match(dockPath,/event\.isTrusted/);assert.doesNotMatch(dockPath,/dispatchEvent|new DataTransfer/,'Dock input must come from Playwright native interaction, not synthetic dispatch');
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'The existing generic requested-state path must execute Dock without a new whitelist');
});

test('ResizeHandle, Notification identities, local scroll sync, and RTL host locale have exact requested-state mappings',async()=>{
  const expected=[
    ['layout/ResizeHandle','ResizeHandle','foundation-native-resize',['resize-horizontal-pointer','resize-vertical-range-home','resize-horizontal-range-end','resize-separator-arrow-up','resize-separator-arrow-down','resize-separator-home','resize-separator-end']],
    ['feedback/Notification','Notification','interaction-notification-actions',['notification-scroll-last-row','notification-open-review','notification-mark-all-read','notification-clear','notification-reset']],
    ['feedback/NotificationCenter','Notification','interaction-notification-actions',['notification-scroll-last-row','notification-open-review','notification-mark-all-read','notification-clear','notification-reset']],
    ['interaction/ScrollSync','VirtualScroller','interaction-scroll-sync',['scrollsync-before-to-after','scrollsync-after-to-before']],
    ['interaction/VirtualScroller','VirtualScroller','interaction-scroll-sync',['virtual-scroller-advance','virtual-sync-before-to-after','virtual-sync-after-to-before']],
    ['i18n/RTL layout','RTL layout','native-rtl-locale-host',['rtl-locale-he','rtl-locale-en-restore']],
  ];
  for(const [identity,kind,sequence,ids]of expected){
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.kind,kind);assert.equal(contract.requestedStateOnly,true);assert.equal(contract.focusedSequence,sequence);assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),ids);assert(contract.steps.every(step=>step.source.siteId.endsWith(`:${step.id}`)&&step.source.sourceAnchor&&step.source.provenance.length>0));
  }
  assert.equal(expected.reduce((sum,[identity])=>sum+requestedStateContract(identity).steps.length,0),24,'The six exact identities resolve to twenty-four checkpoints per live profile');
  assert.equal(requestedStateContract('layout/SplitPane'),null,'ResizeHandle mapping does not expand to nested SplitPane');
  assert.equal(requestedStateContract('i18n/LocaleNumber'),null,'RTL host event mapping does not invent a locale toggle or expand to LocaleNumber');
  const [actions,foundationTemplate,foundationJS,interactionTemplate,interactionJS,nativeTemplate,nativeJS,foundationFixtures,interactionFixtures,nativeFixtures]=await Promise.all([
    read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs'),read('ui/gohtmx/templates/ely-api-foundation.html'),read('ui/gohtmx/assets/ely-api-foundation.js'),read('ui/gohtmx/templates/ely-api-interaction.html'),read('ui/gohtmx/assets/ely-api-interaction.js'),read('ui/gohtmx/templates/ely-api-native.html'),read('ui/gohtmx/assets/ely-api-native-theme.js'),read('internal/gallery/advanced_foundation_fixtures.go'),read('internal/gallery/advanced_interaction_fixtures.go'),read('internal/gallery/advanced_native_fixtures.go'),
  ]);
  const requested=runRequestedStateActions.toString(),branch=requested.slice(requested.indexOf("if(contract.focusedSequence==='foundation-native-resize')"),requested.indexOf("if(contract.focusedSequence?.startsWith('communication-'))"));
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'All six exact cases use the existing requested-state route');
  assert.match(foundationTemplate,/eq \.Kind "ResizeHandle"[\s\S]*?data-foundation-split-handle[\s\S]*?input class="ely-foundation__split-range" type="range"/);assert.match(foundationJS,/const setSplit = \(split, value\) =>[\s\S]*?emit\(root, 'change', \{value: bounded\}\)/);assert.match(foundationJS,/splitHandle && \['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'\]\.includes\(event\.key\)[\s\S]*?setSplit\(split, event\.key === 'Home' \? 25 : event\.key === 'End' \? 75 : current \+ \(decrease \? -5 : 5\)/,'Separator keyboard contract remains distinct from the native range input');assert.match(foundationFixtures,/"layout\/ResizeHandle": \{"Before": "", "After": "", "Label": "Resize panes"\}/);
  assert.match(interactionTemplate,/eq \.Kind "Notification"[\s\S]*?data-interaction-notification-read[\s\S]*?data-interaction-notification-clear[\s\S]*?data-interaction-notification-reset/);assert.match(interactionTemplate,/eq \.Kind "VirtualScroller"[\s\S]*?data-direct-count[\s\S]*?data-direct-sync/);assert.match(interactionJS,/value = 'read-all'[\s\S]*?value = 'reset'[\s\S]*?value = 'cleared'/);assert.match(interactionJS,/const directWindow = \(count, height, top, viewport\)/);assert.match(interactionJS,/root\.querySelectorAll\('\[data-direct-sync\]'\)[\s\S]*?other\.scrollTop = pane\.scrollTop/);assert.match(interactionFixtures,/if name == "VirtualScroller"[\s\S]*?props\["Count"\], props\["RowHeight"\], props\["Label"\] = 10000, 28, "Ten thousand rows"/);
  const notificationReview=requestedStateContract('feedback/Notification').steps.find(step=>step.id==='notification-open-review');
  assert.match(notificationReview.expectedState,/review\(""\)/,'The nested Review action emits an empty value, not its parent row value');
  assert.match(interactionFixtures,/\{"Label": "Review", "Action": "review", "ButtonVariant": "primary"\}/,'The default nested Review action has no caller-supplied Value');
  assert.equal(assertCommunicationCallerRequest([{action:'review',component:'feedback/Notification',value:''}],0,'feedback/Notification','review','').event.value,'');
  assert.throws(()=>assertCommunicationCallerRequest([{action:'review',component:'feedback/Notification',value:'review'}],0,'feedback/Notification','review',''),/default-fixture value/,'The containing row value must not be inherited by its nested Review button');
  assert.match(branch,/const review=host\.locator\('\[data-ely-action="review"\]'\);assert\.equal\(await review\.count\(\),1/,'Review target is the unique action control within this exact fixture host');
  assert.match(nativeTemplate,/eq \.Kind "RTL layout"[\s\S]*?data-native-locale-scope/);assert.match(nativeJS,/listen\(root,'ely:locale',event=>[\s\S]*?scope\.dataset\.locale=event\.detail\.locale[\s\S]*?sync\(event\)/);assert.match(nativeFixtures,/props\["Locale"\], props\["RTL"\] = "en-US", false/);
  assert.match(branch,/mouse\.move\(x,box\.y\+box\.height\*\.7/);assert.match(branch,/horizontalHandle\.press\(key\)/);assert.match(branch,/resize-separator-arrow-up/);assert.match(branch,/resize-separator-arrow-down/);assert.match(branch,/resize-separator-home/);assert.match(branch,/resize-separator-end/);assert.match(branch,/control==='separator'&&event\.orientation==='horizontal'/);assert.match(branch,/\.press\(key\)/);assert.match(branch,/assertChange\(cursor,'notification',value\)/);assert.match(branch,/notification-scroll-last-row/);assert.match(branch,/mouse\.wheel/);assert.match(branch,/virtual-scroller-advance/);assert.match(branch,/Math\.abs\(positions\[0\]-positions\[1\]\)<=1/);assert.match(branch,/new CustomEvent\('ely:locale'/);assert.match(branch,/twinUnchanged:true/);
  assert.doesNotMatch(branch,/scrollTop\s*=|\.dispatchEvent\(new (?:PointerEvent|MouseEvent|KeyboardEvent)/,'Scroll/resize inputs cannot be replaced by forced scroll assignment or synthetic native input');
  assert.match(branch,/finally\{await root\.evaluate/,'Temporary event observers must be removed even when a checkpoint fails');
});
