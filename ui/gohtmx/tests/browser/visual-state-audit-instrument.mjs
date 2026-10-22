import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const interactionMethods=new Set(['click','dispatchEvent','focus','blur','press','fill','check','uncheck','selectOption','setInputFiles','requestSubmit','submit','showModal','close','scrollIntoView']);
const functionNode=node=>node&&(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||node.type==='ArrowFunctionExpression');
const sha=value=>createHash('sha256').update(value).digest('hex');

function walk(node,parent,parents,visit){
  if(!node||typeof node!=='object')return;
  if(typeof node.type==='string'){parents.set(node,parent);visit(node);}
  for(const [key,value] of Object.entries(node)){
    if(key==='start'||key==='end'||key==='loc'||key==='range')continue;
    if(Array.isArray(value))for(const child of value)walk(child,node,parents,visit);
    else if(value&&typeof value==='object')walk(value,node,parents,visit);
  }
}
const ancestors=(node,parents)=>{const out=[];for(let at=node;at;at=parents.get(at))out.push(at);return out;};
const contains=(outer,inner)=>outer.start<=inner.start&&outer.end>=inner.end;
const needsStatementBlock=(stmt,parent)=>parent?.type==='IfStatement'&&(parent.consequent===stmt||parent.alternate===stmt)||['ForStatement','ForOfStatement','ForInStatement','WhileStatement','DoWhileStatement'].includes(parent?.type)&&parent.body===stmt;

function optionalClickStatement(call,parents){
  const member=call.callee,chain=parents.get(call),statement=parents.get(chain);
  return !ancestors(call,parents).find(functionNode)?.generator&&member?.type==='MemberExpression'&&member.object.type==='Identifier'&&!['eval','arguments','globalThis'].includes(member.object.name)&&!member.computed&&member.optional&&member.property.name==='click'
    &&!call.optional&&!call.arguments.length&&chain?.type==='ChainExpression'&&chain.expression===call&&statement?.type==='ExpressionStatement'&&statement.expression===chain?statement:null;
}
function optionalClickEdit(call,statement,nodes,before,after){
  let temporary=`__visualOptionalTarget_${call.start}`;
  while(nodes.some(node=>node.type==='Identifier'&&node.name===temporary))temporary+='_';
  const receiver=call.callee.object.name;
  // Retain the original call spelling as well as this/throws; native TypeError
  // messages include it. The inner binding caches even a global getter once.
  return {at:statement.start,end:statement.end,text:`{const ${temporary}=${receiver};if(${temporary}!==null&&${temporary}!==void 0){const ${receiver}=${temporary};${before}${receiver}?.click();${after}}}`};
}

// Serialized directly into the reference page; no Node binding or promises.
export function synchronousTraceInit(){
  globalThis.__visualSyncTraceState={caseId:null,sealed:false,events:[],lateEvents:[],errors:[],known:{}};
  globalThis.__visualSyncTrace=(site,phase)=>{
    const state=globalThis.__visualSyncTraceState;
    if(state.caseId===null){if(state.sealed){if(state.lateEvents.length<16384)state.lateEvents.push({siteId:site.siteId,phase});else if(!state.errors.includes('late trace budget exceeded'))state.errors.push('late trace budget exceeded');}return;}
    if(!Object.hasOwn(state.known,site.siteId)||state.known[site.siteId]!==site.sourceSHA256||!['enter','exit','unsafe'].includes(phase)){
      state.errors.push('unknown trace site, source hash or phase');throw new Error('Invalid synchronous trace event');
    }
    if(state.events.length>=16384){if(!state.errors.includes('trace event budget exceeded'))state.errors.push('trace event budget exceeded');throw new Error('Synchronous trace event budget exceeded');}
    state.events.push({caseId:state.caseId,ordinal:state.events.length+1,siteId:site.siteId,phase});
  };
}

export function registeredOutcomesEqual(reference,traced){
  return Boolean(reference&&traced)&&['initial','finalTwin'].every(field=>isDeepStrictEqual(reference[field],traced[field]))
    &&['checkResult','actions','hostEvents','finalState'].every(field=>isDeepStrictEqual(reference.result[field],traced.result[field]));
}

// Keep exact equality separate from bounded diagnostics: clocks, caret state
// and twin changes are observable state, not values to normalize away.
export function firstDifference(left,right,path='$'){
  if(isDeepStrictEqual(left,right))return null;
  if(left&&right&&typeof left==='object'&&typeof right==='object'&&Array.isArray(left)===Array.isArray(right)){
    for(const key of new Set([...Object.keys(left),...Object.keys(right)])){
      const difference=firstDifference(left[key],right[key],`${path}${Array.isArray(left)?`[${key}]`:`.${key}`}`);
      if(difference)return difference;
    }
  }
  const compact=value=>JSON.stringify(value)?.slice(0,180)??String(value);
  return {path,original:compact(left),instrumented:compact(right)};
}

export function registeredOutcomeDifferences(reference,traced){
  if(!reference||!traced)return [{path:'$',reason:'missing-registered-outcome',referencePresent:Boolean(reference),tracedPresent:Boolean(traced)}];
  return [
    ...['initial','finalTwin'].map(field=>firstDifference(reference[field],traced[field],`$.${field}`)),
    ...['checkResult','actions','hostEvents','finalState'].map(field=>firstDifference(reference.result[field],traced.result[field],`$.result.${field}`)),
  ].filter(Boolean);
}

export function traceContractStatus(contract,events,calibrated,lateEvents){
  const stack=[];let balanced=true;
  for(const event of events){if(event.phase==='enter')stack.push(event.siteId);else if(event.phase==='exit'&&stack.pop()!==event.siteId)balanced=false;}
  const traceCalibrationValid=Boolean(contract)&&calibrated===true&&!contract.mappingGaps.length&&!lateEvents.length&&events.length>0
    &&balanced&&!stack.length
    &&events.every(event=>['enter','exit','unsafe'].includes(event.phase))
    &&JSON.stringify(events.filter(event=>event.phase!=='exit').map(event=>event.siteId))===JSON.stringify(contract.steps.map(step=>step.source?.siteId));
  return {independentContractGap:!contract,traceCalibrationValid};
}

// Independent synchronous reach probes: no async eligibility or capture edits.
export function synchronousTrace(source,filename='<source>'){
  const tokens=[],ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true,onToken:tokens}),parents=new Map(),nodes=[];
  walk(ast,null,parents,node=>nodes.push(node));
  const calls=nodes.filter(node=>node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&interactionMethods.has(node.callee.computed?node.callee.property.value:node.callee.property.name));
  const edits=[],sites=[],unprobed=[],arrows=new Map();
  for(const call of calls){
    const optional=optionalClickStatement(call,parents);
    const chain=ancestors(call,parents),fn=chain.find(functionNode),statement=optional||chain.find(node=>node.type==='ExpressionStatement'&&node.expression===call);
    const method=call.callee.computed?call.callee.property.value:call.callee.property.name;
    const site={siteId:`${filename}:${call.loc.start.line}:${call.loc.start.column}:${method}`,filename,line:call.loc.start.line,column:call.loc.start.column,method,sourceSHA256:sha(source),sourceAnchor:{start:call.start,end:call.end,text:source.slice(call.start,call.end)}};
    const callback=chain.some(node=>node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&['addEventListener','on','forEach','map','flatMap','some','every','filter','find','findIndex'].includes(node.callee.property.name)&&node.arguments.some(arg=>fn&&contains(arg,fn)));
    const nested=calls.some(other=>other!==call&&contains(call,other));
    const suspended=nodes.some(node=>['AwaitExpression','YieldExpression'].includes(node.type)&&contains(call,node));
    const labelled=chain.find(node=>node.type==='LabeledStatement'&&(!fn||contains(fn,node)));
    // Receiver calls/getters can execute an inner action before this invocation.
    const simpleReceiver=call.callee.object.type==='Identifier'&&!call.callee.computed;
    const safe=statement&&fn&&simpleReceiver&&!callback&&!nested&&!suspended&&!labelled&&(optional||!chain.some(node=>node.type==='ChainExpression'));
    site.traceKind=safe?'statement':'unsafe-region';sites.push(site);
    const hook=phase=>`globalThis.__visualSyncTrace(${JSON.stringify(site)},${JSON.stringify(phase)});`;
    if(safe){
      if(optional){edits.push({...optionalClickEdit(call,statement,nodes,hook('enter'),hook('exit')),order:1});continue;}
      const wrap=needsStatementBlock(statement,parents.get(statement));
      edits.push({at:statement.start,order:1,text:`${wrap?'{':''}${hook('enter')}`});
      edits.push({at:statement.end,order:0,text:`;${hook('exit')}${wrap?'}':''}`});
    }else if(fn?.type==='ArrowFunctionExpression'&&fn.body.type!=='BlockStatement'){
      const arrow=tokens.filter(token=>token.type.label==='=>'&&token.start>=fn.start&&token.end<=fn.body.start).at(-1);
      if(!arrow){unprobed.push(site.siteId);continue;}
      // Preserve parentheses, comments, lexical this and expression return value.
      if(!arrows.has(fn))arrows.set(fn,{at:arrow.end,hooks:[]});
      arrows.get(fn).hooks.push(hook('unsafe'));
    }else{
      const region=labelled||chain.find(node=>node!==call&&(/Statement$/.test(node.type)||node.type==='VariableDeclaration')&&(!fn||contains(fn,node)));
      if(!region||region.type==='BlockStatement'){unprobed.push(site.siteId);continue;}
      const wrap=needsStatementBlock(region,parents.get(region));
      edits.push({at:region.start,order:1,text:`${wrap?'{':''}${hook('unsafe')}`});
      if(wrap)edits.push({at:region.end,order:0,text:'}'});
    }
  }
  for(const [fn,arrow]of arrows){edits.push({at:arrow.at,order:1,text:`{${arrow.hooks.join('')}return (`});edits.push({at:fn.end,order:0,text:');}'});}
  let traced=source;
  for(const edit of edits.sort((a,b)=>b.at-a.at||b.order-a.order))traced=traced.slice(0,edit.at)+edit.text+traced.slice(edit.end??edit.at);
  parse(traced,{ecmaVersion:'latest',sourceType:'module'});
  return {source:traced,originalSHA:sha(source),tracedSHA:sha(traced),sites,unprobed};
}

export function compareActionTrace({originalEvents,capturedEvents,receipts,originalEquivalent,unprobed,knownSiteIds,lateEvents}){
  const blockers=[],stack=[];
  if(originalEquivalent!==true)blockers.push('sync-traced-original-semantics-not-verified');
  if(!Array.isArray(unprobed)||unprobed.length)blockers.push('unprobed-or-unverified-source-sites');
  if(!Array.isArray(lateEvents)||lateEvents.length)blockers.push('late-events-or-unverified-trace-lifecycle');
  const known=new Set(knownSiteIds||[]);
  if([...originalEvents,...capturedEvents].some(event=>typeof event.siteId!=='string'||!known.has(event.siteId)))blockers.push('unknown-source-site');
  if(!originalEvents.length)blockers.push('empty-trace-needs-explicit-noninteractive-contract');
  for(const event of originalEvents){
    if(event.phase==='enter')stack.push(event.siteId);
    else if(event.phase==='exit'){if(stack.pop()!==event.siteId)blockers.push('unbalanced-original-trace');}
    else blockers.push('unsafe-or-unknown-original-region-reached');
  }
  if(stack.length)blockers.push('unbalanced-original-trace');
  const sequence=events=>events.map(event=>[event.siteId,event.phase]);
  if(JSON.stringify(sequence(originalEvents))!==JSON.stringify(sequence(capturedEvents)))blockers.push('captured-invocation-sequence-mismatch');
  const reached=originalEvents.filter(event=>event.phase==='enter').map(event=>event.siteId);
  if(JSON.stringify(reached)!==JSON.stringify(receipts.map(receipt=>receipt.siteId)))blockers.push('capture-receipt-occurrence-mismatch');
  if(receipts.some(receipt=>receipt.captureStatus!=='captured'||receipt.beforeCaptureStatus!=='captured'||receipt.afterCaptureStatus!=='captured'||receipt.beforeCaptureOwnership?.ownedStateEvidence!==true||receipt.afterCaptureOwnership?.ownedStateEvidence!==true))blockers.push('missing-or-unowned-before-after-pixels');
  return {status:blockers.length?'blocked':'passed',reachedOccurrenceCount:reached.length,independentContractCoverage:'not-established-by-trace',blockers:[...new Set(blockers)]};
}

// Registration tables only: never execute a check body or evaluate fixture guards.
export function registrationInventory(source){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}),nodes=[],parents=new Map();
  walk(ast,null,parents,node=>nodes.push(node));
  const declarations=new Map(nodes.filter(node=>node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&!ancestors(parents.get(node),parents).some(functionNode)).map(node=>[node.id.name,node.init]));
  const key=node=>node?.type==='Identifier'?node.name:node?.value;
  const bind=(pattern,value,env)=>{if(pattern?.type==='Identifier')env[pattern.name]=value;else if(pattern?.type==='ArrayPattern'&&Array.isArray(value))pattern.elements.forEach((part,index)=>bind(part,value[index],env));};
  const value=(node,env={},seen=new Set())=>{
    if(!node)return undefined;
    if(node.type==='Literal')return node.value;
    if(node.type==='Identifier'){if(Object.hasOwn(env,node.name))return env[node.name];if(seen.has(node.name))return undefined;return value(declarations.get(node.name),env,new Set([...seen,node.name]));}
    if(node.type==='ArrayExpression'){const items=node.elements.map(item=>value(item,env,seen));return items.includes(undefined)?undefined:items;}
    if(node.type==='ObjectExpression'){const out={};for(const item of node.properties){if(item.type!=='Property'||item.computed)return undefined;const v=value(item.value,env,seen);if(v===undefined)return undefined;out[key(item.key)]=v;}return out;}
    if(node.type==='MemberExpression'){const object=value(node.object,env,seen),property=node.computed?value(node.property,env,seen):key(node.property);return object&&Object.hasOwn(object,property)?object[property]:undefined;}
    if(node.type==='BinaryExpression'&&node.operator==='+'){const a=value(node.left,env,seen),b=value(node.right,env,seen);return a===undefined||b===undefined?undefined:a+b;}
    if(node.type==='TemplateLiteral'){let out=node.quasis[0].value.cooked;for(let i=0;i<node.expressions.length;i++){const v=value(node.expressions[i],env,seen);if(v===undefined)return undefined;out+=v+node.quasis[i+1].value.cooked;}return out;}
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.object.name==='Object'&&key(node.callee.property)==='entries'){const object=value(node.arguments[0],env,seen);return object&&typeof object==='object'?Object.entries(object):undefined;}
    return undefined;
  };
  const registrations=[],unresolved=[];
  for(const registration of nodes.filter(node=>node.type==='CallExpression'&&node.callee.name==='registerChecks')){
    const definitions=registration.arguments[1],target=definitions?.type==='Identifier'?definitions.name:null,entries=new Map();
    const add=(name,node)=>{if(typeof name==='string')entries.set(name,{key:name,registrationLine:registration.loc.start.line,sourceAnchor:{start:node.start,end:node.end}});else unresolved.push({line:node.loc.start.line,reason:'unresolved-registration-key'});};
    const resolving=new Set();
    const pairs=(node,env={})=>{
      if(!node)return;
      if(node.type==='Identifier'){if(resolving.has(node.name)){unresolved.push({line:node.loc.start.line,reason:'cyclic-registration-binding'});return;}resolving.add(node.name);pairs(declarations.get(node.name),env);resolving.delete(node.name);return;}
      if(node.type==='ObjectExpression'){for(const item of node.properties)if(item.type==='Property')add(item.computed?value(item.key,env):key(item.key),item);else pairs(item.argument,env);return;}
      if(node.type==='ArrayExpression'){for(const item of node.elements){if(item?.type==='SpreadElement')pairs(item.argument,env);else if(item?.type==='ArrayExpression')add(value(item.elements[0],env),item);}return;}
      if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'){
        const method=key(node.callee.property);
        if(node.callee.object.name==='Object'&&method==='fromEntries')return pairs(node.arguments[0],env);
        if(['map','flatMap'].includes(method)){
          const items=value(node.callee.object,env),callback=node.arguments[0];
          if(Array.isArray(items)&&callback?.type==='ArrowFunctionExpression'){
            for(const item of items){const next={...env};bind(callback.params[0],item,next);if(method==='map'&&callback.body.type==='ArrayExpression')add(value(callback.body.elements[0],next),callback.body);else pairs(callback.body,next);}return;
          }
        }
      }
      unresolved.push({line:node.loc.start.line,reason:'unresolved-registration-factory'});
    };
    pairs(definitions);
    // Handle this repository's assignment-built checks, finite for-of tables,
    // and add/set factories. Function bodies remain opaque except table writers.
    const writes=(node,env={})=>{
      if(!node||functionNode(node))return;
      if(['IfStatement','SwitchStatement','TryStatement','ForStatement','WhileStatement','DoWhileStatement'].includes(node.type)){unresolved.push({line:node.loc.start.line,reason:'unresolved-conditional-registration-writer'});return;}
      if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&node.left.object.name===target){const name=value(node.left.property,env);if(name!==undefined)add(name,node);return;}
      if(node.type==='ForOfStatement'){
        const items=value(node.right,env);if(!Array.isArray(items)){unresolved.push({line:node.loc.start.line,reason:'unresolved-registration-loop'});return;}
        for(const item of items){const next={...env};bind(node.left.declarations?.[0]?.id||node.left,item,next);writes(node.body,next);}return;
      }
      if(node.type==='CallExpression'&&node.callee.type==='Identifier'){
        const factory=declarations.get(node.callee.name),body=factory?.body;
        if(functionNode(factory)&&body?.type==='CallExpression'&&body.callee.type==='MemberExpression'&&key(body.callee.property)==='forEach'){
          const next={...env};factory.params.forEach((param,index)=>bind(param,value(node.arguments[index],env),next));
          const items=value(body.callee.object,next),callback=body.arguments[0];
          if(Array.isArray(items)&&functionNode(callback))for(const item of items){const scope={...next};bind(callback.params[0],item,scope);writes(callback.body,scope);}return;
        }
      }
      for(const [property,child]of Object.entries(node)){if(['loc','start','end'].includes(property))continue;if(Array.isArray(child))child.forEach(item=>writes(item,env));else if(child&&typeof child==='object')writes(child,env);}
    };
    if(target)for(const node of ast.body)if(node.start<registration.start)writes(node);
    registrations.push(...entries.values());
  }
  const keys=registrations.map(item=>item.key);
  if(new Set(keys).size!==keys.length)throw new Error('duplicate registered check across registerChecks calls');
  return {entries:registrations,unresolved,lookupHelpers:[...declarations].filter(([name,node])=>['need','one','must','require'].includes(name)&&functionNode(node)).map(([name,node])=>({name,line:node.loc.start.line,sourceSHA256:sha(source.slice(node.start,node.end)),sourceAnchor:{start:node.start,end:node.end,text:source.slice(node.start,node.end)},reviewScope:'lookup source only; no receiver purity exemption'}))};
}

// Inventory one guarded registered driver, following lexical helper calls.
// Unknown guards stay explicit; this does not transform or execute source.
export function resolveCaseActionSites(source,filename,{entry,facts}){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});
  const parents=new Map(),nodes=[];walk(ast,null,parents,node=>nodes.push(node));
  const scope=node=>ancestors(parents.get(node),parents).find(functionNode)||ast;
  const declarations=nodes.flatMap(node=>node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&functionNode(node.init)?[{name:node.id.name,fn:node.init,scope:scope(node)}]:node.type==='FunctionDeclaration'?[{name:node.id.name,fn:node,scope:scope(node)}]:[]);
  const binding=(name,at)=>ancestors(at,parents).filter(node=>functionNode(node)||node===ast).map(scope=>declarations.find(item=>item.scope===scope&&item.name===name)).find(Boolean);
  const owner=fn=>declarations.find(item=>item.fn===fn)?.name||entry;
  const literal=node=>node?.type==='Literal'?node.value:undefined;
  const value=node=>{
    if(!node)return undefined;
    if(node.type==='Literal')return node.value;
    if(node.type==='Identifier')return facts[node.name];
    if(node.type==='ArrayExpression')return node.elements.map(value);
    if(node.type==='MemberExpression')return value(node.object)?.[node.computed?value(node.property):node.property.name];
    if(node.type==='UnaryExpression'&&node.operator==='!'){const v=value(node.argument);return v===undefined?undefined:!v;}
    if(node.type==='BinaryExpression'){
      const a=value(node.left),b=value(node.right);if(a===undefined||b===undefined)return undefined;
      if(node.operator==='===')return a===b;if(node.operator==='!==')return a!==b;
    }
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'){
      const receiver=node.callee.object,method=node.callee.property.name,arg=literal(node.arguments[0]);
      if(receiver.type==='Identifier'&&receiver.name==='root'&&method==='querySelector')return facts.selectors?.[arg];
      if(receiver.type==='Identifier'&&receiver.name==='editor'&&method==='closest'&&arg==='form')return facts.form;
      if(method==='includes'){const base=value(receiver),wanted=value(node.arguments[0]);if(Array.isArray(base)&&wanted!==undefined)return base.includes(wanted);}
    }
    return undefined;
  };
  const assigned=nodes.find(node=>node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&literal(node.left.property)===entry&&functionNode(node.right));
  const root=declarations.find(item=>item.name===entry)?.fn||assigned?.right;
  const sites=[],mappingGaps=[];
  if(!root)return {sites,mappingGaps:[{reason:'entry-function-not-found',entry}]};
  const execute=(node,stack=[],unknown=[])=>{
    if(!node||typeof node!=='object'||functionNode(node))return;
    if(node.type==='IfStatement'){
      const selected=value(node.test);
      if(selected===undefined){const guard=source.slice(node.test.start,node.test.end);execute(node.consequent,stack,[...unknown,guard]);execute(node.alternate,stack,[...unknown,guard]);}
      else execute(selected?node.consequent:node.alternate,stack,unknown);
      return;
    }
    if(node.type==='SwitchStatement'){
      const selected=value(node.discriminant);
      if(selected===undefined){for(const branch of node.cases)for(const stmt of branch.consequent)execute(stmt,stack,[...unknown,'unresolved switch']);}
      else {let active=false;for(const branch of node.cases){active ||= literal(branch.test)===selected;if(active){for(const stmt of branch.consequent)execute(stmt,stack,unknown);if(branch.consequent.some(stmt=>stmt.type==='BreakStatement'))break;}}}
      return;
    }
    if(node.type==='CallExpression'){
      if(node.callee.type==='Identifier'){
        const target=binding(node.callee.name,node);
        if(target){if(stack.includes(target.fn))mappingGaps.push({reason:'recursive-helper',helper:target.name});else execute(target.fn.body,[...stack,target.fn],unknown);}
      }
      const method=node.callee.type==='MemberExpression'?(node.callee.computed?literal(node.callee.property):node.callee.property.name):null;
      if(interactionMethods.has(method)){
        const object=node.callee.object;
        sites.push({siteId:`${filename}:${node.loc.start.line}:${node.loc.start.column}:${method}`,filename,line:node.loc.start.line,column:node.loc.start.column,method,
          owner:owner(stack.at(-1)),control:source.slice(object.start,object.end),controlSelector:object.type==='CallExpression'?literal(object.arguments[1]):null,
          event:method==='dispatchEvent'?literal(node.arguments[0]?.arguments?.[0]):method,
          sourceAnchor:{start:node.start,end:node.end,text:source.slice(node.start,node.end)},unknownGuards:unknown});
      }
    }
    for(const [key,child]of Object.entries(node)){
      if(['start','end','loc'].includes(key))continue;
      if(Array.isArray(child))for(const item of child)execute(item,stack,unknown);else if(child&&typeof child==='object')execute(child,stack,unknown);
    }
  };
  execute(root.body,[root]);
  for(const site of sites)if(site.unknownGuards.length)mappingGaps.push({reason:'unresolved-action-guard',siteId:site.siteId,guards:site.unknownGuards});
  return {sites,mappingGaps};
}

/** Instrument test-driver interaction statements. Unsupported sites are returned explicitly. */
export function transform(source,filename='<source>',{registeredCheckEntriesAwaited=false}={}){
  const originalSHA=sha(source),interactionSites=[],unsupported=[],syncUnsupportedSites=[],edits=[];
  let ast;
  try{ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true,allowAwaitOutsideFunction:true});}
  catch(error){return {source,interactionSites,unsupported:[{filename,line:error.loc?.line??null,column:error.loc?.column??null,reason:`parse-error: ${error.message}`}],originalSHA,transformedSHA:originalSHA};}
  const parents=new Map(),nodes=[];walk(ast,null,parents,node=>nodes.push(node));
  const candidates=nodes.filter(node=>node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&interactionMethods.has(node.callee.computed?node.callee.property.value:node.callee.property.name));
  const bindingName=fn=>fn.id?.name||(parents.get(fn)?.type==='VariableDeclarator'&&parents.get(fn).id.type==='Identifier'?parents.get(fn).id.name:null);
  const checkProperties=[],registrationRoots=[];
  const addExpandedEntries=call=>{
    if(call?.type!=='CallExpression')return false;
    if(call.callee.type==='MemberExpression'&&call.callee.object.type==='Identifier'&&call.callee.object.name==='Object'&&call.callee.property.name==='fromEntries'&&call.arguments[0]?.type==='CallExpression')call=call.arguments[0];
    if(call.callee.type!=='MemberExpression'||call.callee.object.type!=='ArrayExpression')return false;
    const array=call.callee.object,callback=call.arguments[0];
    if(callback?.type!=='ArrowFunctionExpression'||callback.body.type!=='ArrayExpression')return false;
    const pair=callback.body.elements;
    if(pair.length!==2||pair[0]?.type!=='Identifier'||pair[1]?.type!=='Identifier')return false;
    for(const item of array.elements)if(item?.type==='Literal'&&typeof item.value==='string')checkProperties.push({key:item.value,value:pair[1]});
    return true;
  };
  const addCheckObject=object=>{
    if(object?.type==='Identifier')object=nodes.find(node=>node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.id.name===object.name)?.init;
    if(addExpandedEntries(object))return;
    if(object?.type!=='ObjectExpression')return;
    for(const property of object.properties){
      if(property.type==='Property'&&property.key.type==='Literal'&&typeof property.key.value==='string')checkProperties.push({key:property.key.value,value:property.value});
      if(property.type==='SpreadElement'&&property.argument.type==='Identifier'){
        const value=nodes.find(node=>node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.id.name===property.argument.name)?.init;
        addExpandedEntries(value);continue;
      }
      if(property.type!=='SpreadElement'||property.argument.type!=='CallExpression'||property.argument.callee.type!=='Identifier'||property.argument.callee.name!=='make')continue;
      const [names,value]=property.argument.arguments;
      if(names?.type==='ArrayExpression'&&value)for(const name of names.elements)if(name?.type==='Literal'&&typeof name.value==='string')checkProperties.push({key:name.value,value});
    }
  };
  for(const node of nodes){
    if(node.type!=='CallExpression'||node.callee.type!=='Identifier'||node.callee.name!=='registerChecks')continue;
    let definitions=node.arguments[1];
    if(definitions?.type==='Identifier')definitions=nodes.find(item=>item.type==='VariableDeclarator'&&item.id.type==='Identifier'&&item.id.name===definitions.name)?.init;
    if(definitions)registrationRoots.push(definitions);
    addCheckObject(node.arguments[1]);
  }
  const registeredEntryFunctions=new Set();
  for(const property of checkProperties){
    if(functionNode(property.value))registeredEntryFunctions.add(property.value);
    else if(property.value.type==='Identifier'){
      const declaration=nodes.find(node=>node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.id.name===property.value.name);
      if(functionNode(declaration?.init))registeredEntryFunctions.add(declaration.init);
    }
  }
  const isRegisteredEntryFunction=fn=>{
    if(registeredEntryFunctions.has(fn))return true;
    const pair=parents.get(fn),builder=pair?.type==='ArrayExpression'&&pair.elements[1]===fn?parents.get(pair):null;
    return functionNode(builder)&&builder.body===pair&&ancestors(builder,parents).some(node=>node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&['map','flatMap'].includes(node.callee.property.name))&&registrationRoots.some(root=>contains(root,fn));
  };
  const hasOnlyRegistrationReferences=fn=>{
    const name=bindingName(fn);if(!name)return true;
    const declaration=fn.id||(parents.get(fn)?.type==='VariableDeclarator'?parents.get(fn).id:null);
    return nodes.filter(node=>node.type==='Identifier'&&node.name===name&&node!==declaration&&!contains(fn,node))
      .every(node=>registrationRoots.some(root=>contains(root,node)));
  };
  const isRegisteredEntryReturn=call=>{
    const caller=ancestors(call,parents).find(functionNode);
    return registeredCheckEntriesAwaited&&caller&&isRegisteredEntryFunction(caller)&&hasOnlyRegistrationReferences(caller)&&(
      // The harness is the only supported consumer: its executor awaits
      // test.check(context). Any direct in-module invocation defeats that proof.
      caller.body===call||ancestors(call,parents).some(node=>node.type==='ReturnStatement'&&node.argument===call&&parents.get(node)===caller.body)
    );
  };
    const refsFor=fn=>{const name=bindingName(fn);return name?nodes.filter(node=>node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name===name&&!contains(fn,node)):[];};
  const identitiesFor=fn=>{
    const out=new Set(),queue=ancestors(fn,parents).filter(functionNode),seen=new Set();
    while(queue.length){const current=queue.shift();if(seen.has(current))continue;seen.add(current);
      for(const property of checkProperties){
        if(contains(property.value,current)){out.add(property.key);continue;}
        if(property.value.type==='Identifier'&&property.value.name===bindingName(current))out.add(property.key);
      }
      for(const call of refsFor(current)){
        const caller=ancestors(call,parents).find(functionNode);if(caller)queue.push(caller);
      }
    }
    return [...out].sort();
  };
  const seedFunctions=new Set(),siteByCall=new Map(),statementByCall=new Map(),siteOwner=new Map();
  for(const call of candidates){
    const chain=ancestors(call,parents),fn=chain.find(functionNode),handler=chain.find(node=>node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&(node.callee.property.name==='addEventListener'||node.callee.property.name==='on'));
    const expr=optionalClickStatement(call,parents)||chain.find(node=>node.type==='ExpressionStatement'&&node.expression===call);
    const method=call.callee.computed?String(call.callee.property.value):call.callee.property.name;
    const checkOwner=chain.find(node=>node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&node.left.computed&&node.left.property.type==='Literal'&&typeof node.left.property.value==='string');
    const checkProperty=chain.find(node=>node.type==='Property'&&node.key.type==='Literal'&&typeof node.key.value==='string');
    const control=source.slice(call.callee.object.start,call.callee.object.end),args=call.arguments.map(arg=>source.slice(arg.start,arg.end));
    const dispatchedEvent=method==='dispatchEvent'?args[0]||null:null;
    const checkIdentity=checkOwner?.left.property.value||checkProperty?.key.value||null;
    const mappedChecks=fn?identitiesFor(fn):[];
    const site={filename,checkIdentity:checkIdentity||mappedChecks[0]||null,mappedChecks,containingFunction:bindingName(fn)||null,line:call.loc.start.line,column:call.loc.start.column,method,control,event:method==='dispatchEvent'?dispatchedEvent:method,action:source.slice(call.start,call.end),arguments:args,sourceAnchor:{start:call.start,end:call.end,text:source.slice(call.start,call.end)},siteId:`${filename}:${call.loc.start.line}:${call.loc.start.column}:${method}`};
    if(handler||!fn||!expr){unsupported.push({...site,reason:handler?'dom-event-handler-callback':'interaction-not-a-standalone-statement'});continue;}
    seedFunctions.add(fn);siteByCall.set(call,site);statementByCall.set(call,expr);siteOwner.set(call,fn);
  }

  const isDOMHandler=fn=>ancestors(fn,parents).some(node=>node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.property.name==='addEventListener'&&node.arguments.some(arg=>contains(arg,fn)));
  const concurrentCallback=fn=>ancestors(fn,parents).find(node=>node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&['forEach','map','flatMap','some','every','filter','find','findIndex'].includes(node.callee.property.name)&&node.arguments.some(arg=>arg===fn));
  const blocked=new Map();
  const potentialFunctions=new Set(seedFunctions),inspect=[...seedFunctions];
  while(inspect.length){
    const fn=inspect.shift(),iteration=concurrentCallback(fn);
    if(iteration)blocked.set(fn,{filename,line:iteration.loc.start.line,column:iteration.loc.start.column,reason:`async-propagation-unsupported: interaction is inside ${iteration.callee.property.name} callback; sequential capture cannot be guaranteed`});
    for(const call of refsFor(fn)){
      const caller=ancestors(call,parents).find(functionNode);
      if(caller&&!potentialFunctions.has(caller)){potentialFunctions.add(caller);inspect.push(caller);}
    }
  }
  for(const fn of potentialFunctions){
    const name=bindingName(fn)||'<anonymous callback>';
    for(const call of refsFor(fn)){
      if(isRegisteredEntryReturn(call))continue;
      const caller=ancestors(call,parents).find(functionNode),iteration=caller&&concurrentCallback(caller);
      if(caller&&(isDOMHandler(caller)||iteration)){
        blocked.set(fn,{filename,line:call.loc.start.line,column:call.loc.start.column,reason:iteration?`async-propagation-unsupported: ${name} is called from ${iteration.callee.property.name} callback; sequential capture cannot be guaranteed`:`async-propagation-unsupported: ${name} is called from a DOM event-handler callback`});break;
      }
      const stmt=ancestors(call,parents).find(node=>node.type==='ExpressionStatement'&&node.expression===call);
      if(!stmt&&parents.get(call)?.type!=='AwaitExpression'){
        blocked.set(fn,{filename,line:call.loc.start.line,column:call.loc.start.column,reason:`async-propagation-unsupported: call to ${name} is nested or passed as a callback`});break;
      }
    }
  }
  // If a caller stays synchronous, its helper must stay synchronous too.
  let changed=true;
  while(changed){changed=false;for(const fn of potentialFunctions)if(!blocked.has(fn))for(const call of refsFor(fn)){
    const caller=ancestors(call,parents).find(functionNode);
    if(caller&&blocked.has(caller)){blocked.set(fn,{filename,line:call.loc.start.line,column:call.loc.start.column,reason:`async-propagation-unsupported: caller ${bindingName(caller)||'<anonymous callback>'} is blocked; preserving synchronous call behavior`});changed=true;break;}
  }}
  // Never touch code reached through a foreign DOM handler. For other blocked
  // drivers, a sync-only hook can report a reached action without making it
  // awaitable or changing the action's return/throw behavior.
  const domBlocked=new Set([...blocked].filter(([,reason])=>reason.reason.includes('DOM event-handler callback')).map(([fn])=>fn));
  changed=true;
  while(changed){changed=false;for(const fn of potentialFunctions)if(!domBlocked.has(fn))for(const call of refsFor(fn)){
    const caller=ancestors(call,parents).find(functionNode);
    if(caller&&domBlocked.has(caller)){domBlocked.add(fn);changed=true;break;}
  }}
  const asyncFunctions=new Set([...seedFunctions].filter(fn=>!blocked.has(fn))),queue=[...asyncFunctions];
  while(queue.length){
    const fn=queue.shift();
    for(const call of refsFor(fn)){
      const chain=ancestors(call,parents),caller=chain.find(functionNode),stmt=chain.find(node=>node.type==='ExpressionStatement'&&node.expression===call);
      if(isRegisteredEntryReturn(call))continue;
      if(blocked.has(fn)||blocked.has(caller)||isDOMHandler(caller)||concurrentCallback(caller))continue;
      if(!stmt&&parents.get(call)?.type!=='AwaitExpression')continue;
      if(caller&&!blocked.has(caller)&&!asyncFunctions.has(caller)){asyncFunctions.add(caller);queue.push(caller);}
    }
  }
  for(const [fn,reason] of blocked){
    unsupported.push(reason);
    for(const [call,site] of siteByCall)if(siteOwner.get(call)===fn){
      const stmt=statementByCall.get(call);
      const telemetrySafe=stmt&&!domBlocked.has(fn);
      unsupported.push({...site,reason:'unsupported-containing-helper',syncTelemetry:telemetrySafe?'available':'unavailable'});
      if(telemetrySafe){
        const hook=`try{globalThis.__visualUnsupportedAction?.(${JSON.stringify(site)})}catch{}`;
        const wrap=needsStatementBlock(stmt,parents.get(stmt));
        edits.push({at:stmt.start,text:wrap?`{${hook}`:hook});
        if(wrap)edits.push({at:stmt.end,text:'}'});
        syncUnsupportedSites.push(site);
      }
      siteByCall.delete(call);statementByCall.delete(call);
    }
  }

  // Function values returned or passed through closures are unsafe unless the enclosing function is already awaited.
  for(const fn of asyncFunctions){
    if(fn.async||fn.generator)continue;
    edits.push({at:fn.start,text:'async '});
  }
  for(const [call,site] of siteByCall){
    const stmt=statementByCall.get(call),fn=ancestors(call,parents).find(functionNode);
    if(!fn)continue;
    const statementText=source.slice(stmt.start,stmt.end);
    const callText=source.slice(call.start,call.end);
    const statementCall=statementText.indexOf(callText);
    if(statementCall<0){unsupported.push({...site,reason:'interaction-statement-range-ambiguous'});continue;}
    const insertion=stmt.end;
    const separator=statementText.trimEnd().endsWith(';')?' ':'; ';
    const serializedSite=JSON.stringify(site);
    if(optionalClickStatement(call,parents)){
      edits.push(optionalClickEdit(call,stmt,nodes,`await globalThis.__visualBeforeAction?.(${serializedSite});`,`await globalThis.__visualCheckpoint?.(${serializedSite});`));
      interactionSites.push(site);continue;
    }
    const wrap=needsStatementBlock(stmt,parents.get(stmt));
    edits.push({at:stmt.start,text:wrap?`{ await globalThis.__visualBeforeAction?.(${serializedSite}); `:`await globalThis.__visualBeforeAction?.(${serializedSite}); `});
    edits.push({at:insertion,text:`${separator}await globalThis.__visualCheckpoint?.(${serializedSite});${wrap?' }':''}`});
    interactionSites.push(site);
  }
  // A registered check may invoke a curried helper that returns an async
  // callback (for example form(...)(args)). Await that callback so the
  // registered executor cannot finish before its final checkpoint.
  const mappedIdentities=new Set([...siteByCall.values()].flatMap(site=>site.mappedChecks));
  for(const node of nodes){
    if(node.type!=='CallExpression'||node.callee.type!=='CallExpression')continue;
    const chain=ancestors(node,parents),fn=chain.find(functionNode),stmt=chain.find(item=>item.type==='ExpressionStatement'&&item.expression===node);
    if(!fn||!stmt||!identitiesFor(fn).some(identity=>mappedIdentities.has(identity)))continue;
    if(!asyncFunctions.has(fn)){asyncFunctions.add(fn);edits.push({at:fn.start,text:'async '});}
    if(parents.get(node)?.type!=='AwaitExpression')edits.push({at:node.start,text:'await '});
  }
  // Add await only at direct helper-call statements that now lead to an async function.
  for(const node of nodes){
    if(node.type!=='CallExpression'||node.callee.type!=='Identifier')continue;
    const calleeName=node.callee.name;
    const target=[...asyncFunctions].find(fn=>bindingName(fn)===calleeName);
    if(!target)continue;
    const chain=ancestors(node,parents),stmt=chain.find(item=>item.type==='ExpressionStatement'&&item.expression===node);
    if(!stmt||parents.get(node)?.type==='AwaitExpression')continue;
    edits.push({at:node.start,text:'await '});
  }

  let transformed=source;
  // Adjacent statements share an offset: finish the previous hook before
  // starting the next one (including an unbraced else branch).
  for(const edit of edits.map((edit,index)=>({...edit,index})).sort((a,b)=>b.at-a.at||b.index-a.index))transformed=transformed.slice(0,edit.at)+edit.text+transformed.slice(edit.end??edit.at);
  return {source:transformed,interactionSites,unsupported,syncUnsupportedSites,originalSHA,transformedSHA:sha(transformed),registeredChecks:[...new Set(checkProperties.map(item=>item.key))].sort()};
}

// Candidate call-graph mappings are not fixture-specific expected action lists.
export function staticCoverageManifest(inventory,sources,contractFor=()=>null){
  if(!Array.isArray(inventory.cases)||!inventory.cases.length)throw new Error('inventory has no cases');
  const ids=inventory.cases.map(item=>`${item.name}`);
  if(new Set(ids).size!==ids.length)throw new Error('duplicate component inventory IDs');
  const modules={};
  for(const {name,filename,source}of sources){
    if(modules[name])throw new Error(`duplicate module: ${name}`);
    const result=transform(source,filename,{registeredCheckEntriesAwaited:true});
    if(result.unsupported.some(site=>site.reason.startsWith('parse-error:')))throw new Error(`cannot parse ${filename}`);
    const registration=registrationInventory(source);
    const staticSource=source.replace(/(["'`(=\s])\/assets\//g,'$1/visual-action-audit/assets/');
    const staticResult=transform(staticSource,filename,{registeredCheckEntriesAwaited:true});
    const trace=synchronousTrace(source,filename),staticTrace=synchronousTrace(staticSource,filename);
    modules[name]={filename,sourceSHA256:result.originalSHA,transformedSHA256:result.transformedSHA,registeredChecks:[...new Set([...result.registeredChecks,...registration.entries.map(item=>item.key)])].sort(),registration,
      counts:{checkpointed:result.interactionSites.length,mappedCheckpointSites:result.interactionSites.filter(site=>site.checkIdentity||site.mappedChecks.length).length,
        unsupported:result.unsupported.length,unsupportedActionSites:result.unsupported.filter(site=>site.siteId).length},
      sites:result.interactionSites,unsupported:result.unsupported,
      syncTrace:{tracedSHA256:trace.tracedSHA,siteCount:trace.sites.length,unsafeRegionSiteCount:trace.sites.filter(site=>site.traceKind==='unsafe-region').length,unsafeSiteIds:trace.sites.filter(site=>site.traceKind==='unsafe-region').map(site=>site.siteId),unprobed:trace.unprobed},
      staticSyncTrace:{tracedSHA256:staticTrace.tracedSHA,siteCount:staticTrace.sites.length,unsafeRegionSiteCount:staticTrace.sites.filter(site=>site.traceKind==='unsafe-region').length,unsafeSiteIds:staticTrace.sites.filter(site=>site.traceKind==='unsafe-region').map(site=>site.siteId),unprobed:staticTrace.unprobed},
      staticAudit:{basePath:'/visual-action-audit/',sourceSHA256:staticResult.originalSHA,transformedSHA256:staticResult.transformedSHA,sites:staticResult.interactionSites,unsupported:staticResult.unsupported}};
  }
  const cases=inventory.cases.map(item=>{
    if(!item.name||!item.key||!item.family||!modules[item.family])throw new Error(`invalid inventory case: ${item.name}`);
    const candidates=Object.entries(modules).filter(([name])=>name===item.family||item.family==='native'&&name==='native-tooling');
    const matches=site=>site.checkIdentity===item.key||site.mappedChecks?.includes(item.key);
    const candidateSafeSiteIds=candidates.flatMap(([,module])=>module.sites.filter(matches).map(site=>site.siteId));
    const candidateUnsupportedSiteIds=candidates.flatMap(([,module])=>module.unsupported.filter(site=>site.siteId&&matches(site)).map(site=>site.siteId));
    const registeredModules=candidates.filter(([,module])=>module.registeredChecks.includes(item.key)).map(([name])=>name);
    if(registeredModules.length>1)throw new Error(`ambiguous registered module: ${item.key}`);
    const source=sources.find(module=>module.name===item.family),contract=contractFor(item.name,source.source,source.filename);
    const mappingGaps=contract?contract.mappingGaps:[{reason:'fixture-specific-action-contract-unresolved'}];
    const blockers=[...mappingGaps];
    for(const name of registeredModules)if(!actionModuleNames(item.family).includes(name))blockers.push({reason:'registered-module-not-transformed-by-action-runner',module:name});
    return {caseId:`gallery:${item.name}`,componentIdentity:item.name,family:item.family,checkKey:item.key,registeredModules,
      registrationStatus:registeredModules.length?'statically-resolved':'unresolved-not-missing-proof',candidateSafeSiteIds,candidateUnsupportedSiteIds,
      exactContract:contract?{stepCount:contract.steps.length,siteIds:contract.steps.map(step=>step.source?.siteId||null),mappingGaps}:null,blockers};
  });
  const count=field=>Object.values(modules).reduce((total,module)=>total+module.counts[field],0);
  return {schemaVersion:1,kind:'static-action-coverage-preflight',scope:'finite gallery fixtures; no runtime or pixel proof',
    inventorySHA256:sha(JSON.stringify(inventory)),modules,cases,
    counts:{cases:cases.length,distinctCheckKeys:new Set(cases.map(item=>item.checkKey)).size,checkpointed:count('checkpointed'),mappedCheckpointSites:count('mappedCheckpointSites'),
      unsupportedRecords:count('unsupported'),unsupportedActionSites:count('unsupportedActionSites'),
      casesWithCandidateUnsupportedSites:cases.filter(item=>item.candidateUnsupportedSiteIds.length).length,
      casesWithoutCandidateSites:cases.filter(item=>!item.candidateSafeSiteIds.length&&!item.candidateUnsupportedSiteIds.length).length,
      unresolvedRegistrations:cases.filter(item=>!item.registeredModules.length).length,
      exactContracts:cases.filter(item=>item.exactContract&&!item.exactContract.mappingGaps.length).length,
      blockingCases:cases.filter(item=>item.blockers.length).length},
    blockingCaseIds:cases.filter(item=>item.blockers.length).map(item=>item.caseId),safeForFullActionClaim:false};
}

export const actionModuleNames=family=>family==='native'?['native','native-tooling']:[family];

export function prepareActionModule(name,localSource,manifest,surface){
  const filename=`internal/gallery/assets/advanced-${name}-checks.js`,expected=manifest.modules?.[name];
  if(!expected||expected.filename!==filename||expected.sourceSHA256!==sha(localSource))throw new Error(`coverage source hash mismatch: ${filename}`);
  const source=surface==='static-audit'?localSource.replace(/(["'`(=\s])\/assets\//g,'$1/visual-action-audit/assets/'):localSource;
  const transformed=transform(source,filename,{registeredCheckEntriesAwaited:true}),served=surface==='static-audit'?expected.staticAudit:expected;
  const trace=synchronousTrace(source,filename),traceManifest=surface==='static-audit'?expected.staticSyncTrace:expected.syncTrace;
  if(!traceManifest||traceManifest.tracedSHA256!==trace.tracedSHA)throw new Error(`coverage synchronous trace hash mismatch: ${filename}`);
  const registeredChecks=[...new Set([...transform(localSource,filename,{registeredCheckEntriesAwaited:true}).registeredChecks,...registrationInventory(localSource).entries.map(item=>item.key)])].sort();
  if(JSON.stringify(expected.registeredChecks)!==JSON.stringify(registeredChecks))throw new Error(`coverage registration mismatch: ${filename}`);
  if(!served||served.sourceSHA256!==transformed.originalSHA||served.transformedSHA256!==transformed.transformedSHA||sha(JSON.stringify(served.sites))!==sha(JSON.stringify(transformed.interactionSites))||sha(JSON.stringify(served.unsupported))!==sha(JSON.stringify(transformed.unsupported)))throw new Error(`coverage AST/hash mismatch: ${filename} (${surface})`);
  return {name,filename,localSource,source,transformed,registeredChecks,trace};
}

async function coverageCLI(){
  const {readFile,writeFile}=await import('node:fs/promises');
  const {execFileSync}=await import('node:child_process');
  const {caseActionContract}=await import('./visual-state-audit-drivers.mjs');
  const args=process.argv.slice(2),inventoryArg=args.find(arg=>arg.startsWith('--coverage-inventory=')),outputArg=args.find(arg=>arg.startsWith('--coverage-output='));
  if(args.length!==2||!inventoryArg||!outputArg)throw new Error('Usage: node visual-state-audit-instrument.mjs --coverage-inventory=<gallery-check-inventory.json> --coverage-output=<new-manifest.json>');
  const repo=fileURLToPath(new URL('../../../../',import.meta.url)),inventoryPath=resolve(inventoryArg.split('=').slice(1).join('=')),outputPath=resolve(outputArg.split('=').slice(1).join('='));
  const revision=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
  const before=revision(),inventoryBytes=await readFile(inventoryPath),sources=[];
  for(const name of ['foundation','interaction','data','workspace','communication','native','forms','native-tooling']){
    const filename=`internal/gallery/assets/advanced-${name}-checks.js`;
    sources.push({name,filename,source:await readFile(resolve(repo,filename),'utf8')});
  }
  const instrumenterBytes=await readFile(new URL(import.meta.url)),driverBytes=await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url)),actionBytes=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url));
  const inventory=JSON.parse(inventoryBytes);
  if(inventory.cases?.length!==1313||inventory.stories?.length!==624)throw new Error('expected current 1313-case / 624-story inventory');
  const report=staticCoverageManifest(inventory,sources,caseActionContract);
  for(const module of sources)for(const surface of ['live-audit','static-audit'])prepareActionModule(module.name,module.source,report,surface);
  for(const source of sources)if(sha(await readFile(resolve(repo,source.filename)))!==sha(source.source))throw new Error(`source drift: ${source.filename}`);
  if(sha(await readFile(inventoryPath))!==sha(inventoryBytes)||revision()!==before||sha(await readFile(new URL(import.meta.url)))!==sha(instrumenterBytes)||sha(await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url)))!==sha(driverBytes)||sha(await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url)))!==sha(actionBytes))throw new Error('coverage input drift');
  report.source={revision:before,nodeVersion:process.version,gitStatus:execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),inventoryPath,inventoryBytesSHA256:sha(inventoryBytes),instrumenterSHA256:sha(instrumenterBytes),driversSHA256:sha(driverBytes),actionsSHA256:sha(actionBytes),inputsStable:true};
  await writeFile(outputPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({outputPath,sha256:sha(await readFile(outputPath)),counts:report.counts,safeForFullActionClaim:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)coverageCLI().catch(error=>{console.error(error);process.exitCode=1;});
