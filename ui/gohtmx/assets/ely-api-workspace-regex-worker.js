// JavaScript regex execution is isolated from the UI and terminated by its owner.
self.onmessage=event=>{
 try {
  let {pattern,flags,text}=event.data;
  if(pattern.length>4096||text.length>65536||!/^[imsx]*$/.test(flags))throw Error('Pattern or sample exceeds supported bounds');
  pattern=pattern.replace(/\(\?P</g,'(?<');
  if(flags.includes('x')){let out='',escaped=false,inside=false,comment=false;for(const c of pattern){if(comment){if(c==='\n')comment=false;continue;}if(escaped){out+='\\'+c;escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='[')inside=true;if(c===']')inside=false;if(!inside&&c==='#'){comment=true;continue;}if(!inside&&/\s/.test(c))continue;out+=c;}pattern=out+(escaped?'\\':'');}
  const expression=new RegExp(pattern,flags.replace('x','')+'gu'),encoder=new TextEncoder(),matches=[];
  for(const match of text.matchAll(expression)){if(matches.length>=512)throw Error('More than 512 matches');const start=encoder.encode(text.slice(0,match.index)).length;matches.push({index:match.index,start,end:start+encoder.encode(match[0]).length,text:match[0],groups:match.groups||Object.fromEntries(match.slice(1).map((v,i)=>[i+1,v??'']))});}
  self.postMessage({matches});
 }catch(error){self.postMessage({error:error.message});}
};

// Loading and scheduling are separate from the bounded regex execution.
self.postMessage({ready:true});
