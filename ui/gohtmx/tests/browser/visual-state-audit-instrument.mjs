import {createHash} from 'node:crypto';
import {parse} from 'acorn';

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
    const expr=chain.find(node=>node.type==='ExpressionStatement'&&node.expression===call);
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
  for(const edit of edits.map((edit,index)=>({...edit,index})).sort((a,b)=>b.at-a.at||b.index-a.index))transformed=transformed.slice(0,edit.at)+edit.text+transformed.slice(edit.at);
  return {source:transformed,interactionSites,unsupported,syncUnsupportedSites,originalSHA,transformedSHA:sha(transformed)};
}
