const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function seedEdit(previous,next){const digits=String(next).replace(/[^0-9]/g,'');return digits===''||Number(digits)<=4294967295?digits:previous;}
export function addedRanges(oldText,newText){
  const segmenter=new Intl.Segmenter(undefined,{granularity:'word'}),old=[...segmenter.segment(oldText)].map(s=>s.segment),next=[...segmenter.segment(newText)];
  if(old.length*next.length>250000)return newText?[[0,newText.length]]:[];
  const table=Array.from({length:old.length+1},()=>new Uint32Array(next.length+1));
  for(let i=old.length-1;i>=0;i--)for(let j=next.length-1;j>=0;j--)table[i][j]=old[i]===next[j].segment?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
  const ranges=[];let i=0,j=0;
  while(j<next.length){if(i<old.length&&old[i]===next[j].segment){i++;j++;}else if(i<old.length&&table[i+1][j]>=table[i][j+1])i++;else{const start=next[j].index,end=start+next[j].segment.length,last=ranges.at(-1);if(last&&last[1]===start)last[1]=end;else ranges.push([start,end]);j++;}}
  return ranges.map(([start,end])=>{const text=newText.slice(start,end),first=text.search(/[\p{L}\p{N}]/u),trimmed=text.replace(/[^\p{L}\p{N}]+$/u,'');return first<0?null:[start+first,start+trimmed.length];}).filter(Boolean);
}
export function readMask(text){
  const strokes=JSON.parse(text||'[]');
  if(!Array.isArray(strokes)||strokes.length>2000||!strokes.every(stroke=>stroke&&Number.isFinite(stroke.radius)&&stroke.radius>=.01&&stroke.radius<=.2&&typeof stroke.erase==='boolean'&&Array.isArray(stroke.points)&&stroke.points.length<=20000&&stroke.points.every(point=>Array.isArray(point)&&point.length===2&&point.every(value=>Number.isFinite(value)&&value>=0&&value<=1))))throw Error('Invalid normalized mask strokes.');
  return strokes;
}
export function rasterMask(strokes,columns,rows,ratio){
  const cells=new Uint8Array(columns*rows);
  for(const stroke of strokes){
    const points=stroke.points.map(([x,y])=>[x,y/ratio]),r=stroke.radius;
    for(let at=0;at<points.length;at++){
      const a=points[Math.max(0,at-1)],b=points[at],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
      const left=clamp(Math.floor((Math.min(a[0],b[0])-r)*columns),0,columns),right=clamp(Math.floor((Math.max(a[0],b[0])+r)*columns)+1,0,columns),top=clamp(Math.floor((Math.min(a[1],b[1])-r)*ratio*rows),0,rows),bottom=clamp(Math.floor((Math.max(a[1],b[1])+r)*ratio*rows)+1,0,rows);
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const px=(x+.5)/columns,py=(y+.5)/rows/ratio,t=length?clamp(((px-a[0])*dx+(py-a[1])*dy)/length,0,1):0;if((a[0]+t*dx-px)**2+(a[1]+t*dy-py)**2<=r*r)cells[y*columns+x]=stroke.erase?0:1;}
    }
  }
  return cells;
}
export function brushKey(radius,erase,key){return {radius:key==='['?Math.max(.01,radius*.8):key===']'?Math.min(.2,radius*1.25):radius,erase:key.toLowerCase()==='x'?!erase:erase};}
export function comparisonHeading(index,name,blind,verdict){return blind&&verdict===''?'Model '+String.fromCharCode(65+index):name;}
const clock=value=>{const seconds=Math.floor(Math.max(0,value));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');};

export function initNativeGenerative(root,change,emit){
  const cleanups=[],listen=(node,type,fn,options)=>{node.addEventListener(type,fn,options);cleanups.push(()=>node.removeEventListener(type,fn,options));},blocked=()=>root.dataset.elyDisabled==='true'||!!root.querySelector('fieldset[disabled]');
  const icon=(node,name)=>{node.dataset.nativeIcon=name;node.style.setProperty('--native-icon-url','url("/assets/ely/icons/'+name+'.svg")');};
  root.querySelectorAll('[data-native-generation-panel]').forEach(form=>{
    const prompt=form.querySelector('[data-native-prompt]'),status=form.querySelector('[data-native-generation-status]'),suggestion=form.querySelector('[data-native-suggestion]'),enhance=form.querySelector('[data-native-enhance]'),negative=form.querySelector('[data-native-negative]'),tagEntry=form.querySelector('[data-native-tag-entry]'),tagList=form.querySelector('[data-native-tags]'),seed=form.querySelector('[data-native-seed]');
    let tags=negative.value.split(',').map(value=>value.trim()).filter(Boolean),previousSeed=seed.value,enhancing=form.dataset.enhancing==='true';
    const syncEnhance=()=>{enhance.disabled=enhancing||!prompt.value.trim();enhance.setAttribute('aria-busy',String(enhancing));};
    const drawTags=()=>{tagList.replaceChildren(...tags.map((tag,index)=>{const chip=document.createElement('span'),button=document.createElement('button');chip.append(document.createTextNode(tag));button.type='button';button.dataset.nativeTagRemove=String(index);button.setAttribute('aria-label','Remove '+tag);button.textContent='×';chip.append(button);return chip;}));};
    const setTags=()=>{negative.value=tags.join(',');drawTags();change(root,{negativePrompt:[...tags]});};
    const showSuggestion=text=>{suggestion.dataset.suggestion=text;suggestion.hidden=!text;const body=suggestion.querySelector('p');body.replaceChildren();let at=0;for(const [start,end] of addedRanges(prompt.value,text)){body.append(document.createTextNode(text.slice(at,start)));const mark=document.createElement('mark');mark.textContent=text.slice(start,end);body.append(mark);at=end;}body.append(document.createTextNode(text.slice(at)));enhancing=false;syncEnhance();};
    const choices=(attribute,name)=>{const field=form.elements.namedItem(name),buttons=[...form.querySelectorAll('['+attribute+']')];if(!field)return;const selected=buttons.find(button=>button.dataset.initialSelected==='true');if(!field.value&&selected)field.value=selected.getAttribute(attribute);const sync=()=>buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.getAttribute(attribute)===field.value)));buttons.forEach(button=>listen(button,'click',()=>{if(blocked()||button.disabled)return;field.value=button.getAttribute(attribute);sync();change(root,{[name]:field.value});}));sync();};
    choices('data-native-style','style');choices('data-native-ratio','aspectRatio');
    form.querySelectorAll('[data-native-ratio]').forEach(button=>{const parts=button.dataset.nativeRatio.split(':').map(Number);if(parts.length===2&&parts.every(v=>Number.isFinite(v)&&v>0)){const longest=Math.max(...parts),shape=button.querySelector('i');shape.style.width=16*parts[0]/longest+'px';shape.style.height=16*parts[1]/longest+'px';}});
    listen(tagEntry,'keydown',event=>{if(blocked())return;if(event.key==='Enter'||event.key===','){event.preventDefault();const tag=tagEntry.value.trim();if(tag&&!tags.includes(tag)){tags.push(tag);setTags();}tagEntry.value='';}else if(event.key==='Backspace'&&!tagEntry.value&&tags.length){tags.pop();setTags();}});
    listen(tagList,'click',event=>{const button=event.target.closest('[data-native-tag-remove]');if(!button||blocked())return;tags.splice(Number(button.dataset.nativeTagRemove),1);setTags();tagEntry.focus();});
    listen(seed,'input',()=>{seed.value=seedEdit(previousSeed,seed.value);previousSeed=seed.value;seed.setCustomValidity('');});
    listen(form.querySelector('[data-native-roll]'),'click',()=>{if(blocked())return;seed.value=String(crypto.getRandomValues(new Uint32Array(1))[0]);previousSeed=seed.value;change(root,{seed:seed.value});});
    listen(prompt,'input',syncEnhance);
    listen(root,'ely:action',event=>{if(event.detail?.action===enhance.dataset.elyAction){enhancing=true;syncEnhance();status.textContent='Enhancement requested';}});
    listen(root,'ely:prompt-suggestion',event=>{if(typeof event.detail?.suggestion==='string'){showSuggestion(event.detail.suggestion);status.textContent='';}else if(typeof event.detail?.error==='string'){status.textContent=event.detail.error;enhancing=false;syncEnhance();}});
    suggestion.querySelectorAll('[data-native-resolve]').forEach(button=>listen(button,'click',()=>{if(blocked())return;const accepted=button.dataset.nativeResolve==='use';if(accepted)prompt.value=suggestion.dataset.suggestion;showSuggestion('');change(root,{prompt:prompt.value,accepted});prompt.focus();}));
    listen(form,'keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!blocked()){event.preventDefault();form.requestSubmit();}});
    listen(form,'submit',event=>{if(seed.value!==''&&(!/^\d+$/.test(seed.value)||Number(seed.value)>4294967295)){event.preventDefault();event.stopImmediatePropagation();seed.setCustomValidity('Use an unsigned 32-bit seed or leave it empty.');seed.reportValidity();return;}status.textContent='Generation requested';},true);
    drawTags();if(suggestion.dataset.suggestion)showSuggestion(suggestion.dataset.suggestion);syncEnhance();
  });
  root.querySelectorAll('[data-native-job-progress]').forEach(node=>node.querySelector('circle:last-child').style.strokeDasharray=clamp(Number(node.dataset.nativeJobProgress)||0,0,100)+' 100');
  root.querySelectorAll('.ely-native-variation-picker').forEach(picker=>{
    const radios=[...picker.querySelectorAll('input[type="radio"]')],hero=picker.querySelector('figure img');
    const sync=()=>{radios.forEach(radio=>radio.closest('label').toggleAttribute('data-native-selected',radio.checked));const chosen=radios.find(radio=>radio.checked);if(chosen){const image=chosen.closest('label').querySelector('img');hero.src=image.getAttribute('src');hero.alt=image.alt;}};
    radios.forEach(radio=>listen(radio,'change',sync));sync();
  });
  root.querySelectorAll('[data-native-ab]').forEach(compare=>{
    const sides=[...compare.querySelectorAll('[data-native-ab-side]')],buttons=[...compare.querySelectorAll('[data-native-verdict]')],blind=compare.dataset.blind==='true';
    let verdict=compare.dataset.verdict||'';if(verdict!=='tie'&&verdict!==''&&(!/^\d+$/.test(verdict)||Number(verdict)>=sides.length))verdict='';
    const render=()=>{compare.dataset.verdict=verdict;sides.forEach((side,index)=>{const heading=comparisonHeading(index,side.dataset.model,blind,verdict);side.querySelector('strong').textContent=heading;side.dataset.preferred=String(verdict===String(index));side.querySelector('small').hidden=verdict!==String(index);buttons[index].textContent=heading+' is better';});compare.querySelector('nav').hidden=verdict!=='';compare.querySelector('[data-native-verdict-status]').textContent=verdict==='tie'?'Called a tie':'';};
    buttons.forEach(button=>listen(button,'click',()=>{if(blocked()||verdict!=='')return;verdict=button.dataset.nativeVerdict;render();change(root,{verdict:verdict==='tie'?'tie':Number(verdict)});}));render();
  });
  root.querySelectorAll('.ely-native-compare').forEach(compare=>{
    const slider=compare.querySelector('[data-native-compare]'),after=compare.querySelector('[data-native-compare-after]');let held=false;
    const sync=(send=true)=>{const value=clamp(Number(slider.value),0,100);after.style.clipPath='inset(0 0 0 '+value+'%)';compare.style.setProperty('--native-compare',value+'%');if(send)change(root,{comparison:value});};
    const point=event=>{const bounds=compare.getBoundingClientRect();slider.value=String(clamp((event.clientX-bounds.left)/bounds.width*100,0,100));sync();};
    listen(slider,'input',()=>sync());listen(compare,'pointerdown',event=>{if(blocked()||event.button!==0)return;held=true;point(event);compare.focus();if(event.isTrusted)compare.setPointerCapture?.(event.pointerId);});listen(compare,'pointermove',event=>{if(held)point(event);});for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(compare,type,()=>{held=false;});
    listen(compare,'keydown',event=>{if(blocked()||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();slider.value=String(event.key==='Home'?0:event.key==='End'?100:Number(slider.value)+(event.key==='ArrowLeft'?-5:5));sync();});sync(false);
  });
  root.querySelectorAll('[data-native-inpaint]').forEach(host=>{
    const canvas=host.querySelector('canvas'),context=canvas.getContext('2d'),brush=host.querySelector('[data-native-brush]'),ring=host.querySelector('[data-native-brush-ring]'),error=host.querySelector('[data-native-mask-error]');
    host.style.setProperty('--native-mask-ratio',String(canvas.width/canvas.height));
    let strokes=[],pending=null,held=null,radius=clamp(Number(host.dataset.brushRadius)||(Number(brush.dataset.legacyBrushSize)/(2*canvas.width))||.05,.01,.2),erase=host.dataset.erase==='true';
    try{strokes=readMask(host.dataset.strokes);}catch(cause){error.textContent=cause.message;}
    const render=()=>{
      if(context){context.clearRect(0,0,canvas.width,canvas.height);const columns=320,rows=Math.round(columns*canvas.height/canvas.width),cells=rasterMask(pending?[...strokes,pending]:strokes,columns,rows,canvas.width/canvas.height);context.fillStyle=getComputedStyle(root).getPropertyValue('--color-accent')||getComputedStyle(root).color;context.globalAlpha=.45;for(let y=0;y<rows;y++){let start=-1;for(let x=0;x<=columns;x++){const on=x<columns&&cells[y*columns+x];if(on&&start<0)start=x;if(!on&&start>=0){context.fillRect(start*canvas.width/columns,y*canvas.height/rows,(x-start)*canvas.width/columns,canvas.height/rows);start=-1;}}}context.globalAlpha=1;}else error.textContent='Mask canvas is unavailable.';
      canvas.dataset.geometry=JSON.stringify(strokes);canvas.dataset.mode=erase?'erase':'paint';host.dataset.strokes=canvas.dataset.geometry;brush.value=String(radius);host.querySelector('[data-native-brush-size]').textContent=(radius*100).toFixed(1)+'%';host.querySelectorAll('[data-native-mask-mode]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.nativeMaskMode==='erase')===erase)));host.querySelector('[data-native-mask-undo]').disabled=!strokes.length;host.querySelector('[data-native-mask-clear]').disabled=!strokes.length;
      ring.style.width=radius*200+'%';ring.style.aspectRatio='1';
    };
    const point=event=>{const bounds=canvas.getBoundingClientRect(),x=clamp((event.clientX-bounds.left)/bounds.width,0,1),y=clamp((event.clientY-bounds.top)/bounds.height,0,1);ring.style.left=x*100+'%';ring.style.top=y*100+'%';ring.hidden=false;return[x,y];};
    const brushChanged=()=>{render();change(root,{brush:radius,maskMode:erase?'erase':'paint'});};
    listen(canvas,'pointerdown',event=>{if(blocked()||!context||event.button!==0)return;held=event.pointerId;pending={points:[point(event)],radius,erase};canvas.focus();if(event.isTrusted)canvas.setPointerCapture?.(event.pointerId);render();});
    listen(canvas,'pointermove',event=>{const next=point(event);if(pending&&held===event.pointerId){pending.points.push(next);render();}});
    listen(canvas,'pointerup',event=>{if(!pending||held!==event.pointerId)return;pending.points.push(point(event));strokes.push(pending);pending=null;held=null;render();change(root,{stroke:strokes.at(-1),geometry:strokes});});
    for(const type of ['pointercancel','lostpointercapture'])listen(canvas,type,()=>{if(!pending)return;pending=null;held=null;render();});listen(canvas,'pointerleave',()=>{ring.hidden=true;});
    listen(canvas,'keydown',event=>{if(blocked()||event.metaKey||event.ctrlKey||!['[',']','x','X'].includes(event.key))return;event.preventDefault();({radius,erase}=brushKey(radius,erase,event.key));brushChanged();});
    listen(brush,'input',()=>{if(blocked())return;radius=clamp(Number(brush.value),.01,.2);brushChanged();});
    host.querySelectorAll('[data-native-mask-mode]').forEach(button=>listen(button,'click',()=>{if(blocked())return;erase=button.dataset.nativeMaskMode==='erase';brushChanged();}));
    listen(host.querySelector('[data-native-mask-undo]'),'click',()=>{if(blocked())return;strokes.pop();render();change(root,{geometry:strokes});});listen(host.querySelector('[data-native-mask-clear]'),'click',()=>{if(blocked())return;strokes=[];render();change(root,{geometry:strokes});});
    listen(root,'ely:mask',event=>{try{if(!Array.isArray(event.detail?.strokes))throw Error('Invalid normalized mask strokes.');const next=readMask(JSON.stringify(event.detail.strokes));strokes=next;error.textContent='';render();}catch(cause){error.textContent=cause.message;}});render();
  });
  root.querySelectorAll('[data-native-generated-audio]').forEach(player=>{
    const wave=player.querySelector('[data-native-generated-wave]'),button=player.querySelector('[data-native-generated-play]'),media=player.querySelector('audio'),status=player.querySelector('[data-native-audio-status]');
    let duration=Math.max(0,Number(player.dataset.duration)||0),position=clamp(Number(player.dataset.position)||0,0,duration),playing=player.dataset.playing==='true',making=player.dataset.making===''?null:clamp(Number(player.dataset.making)||0,0,1);
    const render=()=>{player.dataset.position=String(position);player.dataset.playing=String(playing);player.dataset.making=making===null?'':String(making);player.querySelector('[data-native-generated-duration]').textContent=clock(duration);player.querySelector('[data-native-generated-time]').textContent=clock(position)+' / '+clock(duration);wave.setAttribute('aria-valuemax',String(duration));wave.setAttribute('aria-valuenow',String(position));const bars=[...wave.querySelectorAll('rect')];bars.forEach((bar,index)=>bar.classList.toggle('is-played',(index+.5)/bars.length<=position/Math.max(1,duration)));button.setAttribute('aria-label',playing?'Pause':'Play');icon(button.querySelector('[data-native-icon]'),playing?'pause':'play');player.querySelector('.ely-native-generated-player').hidden=making!==null;const progress=player.querySelector('[data-native-audio-making]');progress.hidden=making===null;progress.querySelector('progress').value=making||0;progress.querySelector('small').textContent='Making · '+Math.round((making||0)*100)+'%';player.querySelectorAll('header button').forEach(action=>action.disabled=making!==null);};
    const seek=value=>{if(blocked()||making!==null)return;position=clamp(value,0,duration);if(media)media.currentTime=position;render();change(root,{seek:position,share:duration?position/duration:0});};
    listen(wave,'pointerdown',event=>{if(event.button!==0)return;const bounds=wave.getBoundingClientRect();seek((event.clientX-bounds.left)/bounds.width*duration);});listen(wave,'keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();seek(position+(event.key==='ArrowLeft'?-.05:.05)*duration);}});
    listen(button,'click',()=>{if(blocked()||making!==null)return;const next=!playing;if(media){if(next)media.play().catch(()=>{status.textContent='Playback unavailable';});else media.pause();}else{playing=next;status.textContent=next?'Playback requested':'Pause requested';render();}emit(root,next?'play':'pause',{playing:next});change(root,{playing:next});});
    if(media){for(const type of ['play','pause','timeupdate','loadedmetadata','ended'])listen(media,type,()=>{playing=!media.paused;position=media.currentTime;if(Number.isFinite(media.duration))duration=media.duration;status.textContent='';render();});listen(media,'error',()=>{playing=false;status.textContent='Playback unavailable';render();});cleanups.push(()=>media.pause());}
    listen(root,'ely:generated-audio',event=>{const next=event.detail;if(!next)return;if(Number.isFinite(next.position))position=clamp(next.position,0,duration);if(typeof next.playing==='boolean')playing=next.playing;if(next.making===null||(Number.isFinite(next.making)&&next.making>=0&&next.making<=1))making=next.making;render();});render();
  });
  return ()=>cleanups.forEach(cleanup=>cleanup());
}
