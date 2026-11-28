import {createControl} from '/assets/ui-controls.js';

const api = window.ElyTheme;
const preset = document.querySelector('#theme-preset'), name = document.querySelector('#theme-name'), mode = document.querySelector('#theme-mode');
const json = document.querySelector('#theme-json'), message = document.querySelector('[data-theme-message]'), check = document.querySelector('[data-theme-check]'), apply = document.querySelector('[data-theme-apply]');
const labels = {'color-paper':'Page background', 'color-ink':'Body text', 'color-muted':'Muted text', 'color-line':'Divider', 'color-accent':'Accent', surface:'Surface', border:'Input border', 'accent-hover':'Accent hover', 'accent-tint':'Accent background', 'on-accent':'On-accent text', focus:'Focus', draft:'Pending', 'draft-tint':'Pending background', approved:'Approved', 'approved-tint':'Approved background', warning:'Warning', 'warning-tint':'Warning background', error:'Error', 'error-tint':'Error background'};
let draft;
const notify = text => { message.textContent = text; };
function update() {
  try {
    for (const preview of document.querySelectorAll('[data-theme-preview]')) api.preview(preview,draft,preview.dataset.themePreview);
    const problems = api.issues(draft), invalid = !name.checkValidity() || [...document.querySelectorAll('[data-theme-hex]')].some(input => !input.checkValidity());
    check.dataset.invalid = String(problems.length > 0 || invalid);
    check.textContent = invalid ? 'Check the name and HEX color values.' : problems.length ? problems.map(p=>`${p.mode} · ${labels[p.foreground]} / ${labels[p.background]}: ${p.ratio.toFixed(2)}:1 (minimum ${p.minimum}:1)`).join('\n') : 'All 30 light and dark contrast checks passed';
    apply.disabled = Boolean(problems.length || invalid);
    json.value = JSON.stringify(draft,null,2);
  } catch (error) { apply.disabled = true; check.dataset.invalid = 'true'; check.textContent = error.message; }
}
function renderFields() {
  document.querySelector('[data-theme-fields]').replaceChildren();
  document.querySelector('[data-theme-status-fields]').replaceChildren();
  for (const [index,key] of api.tokens.entries()) {
    const row=document.createElement('div');row.className='theme-field';
    const label=document.createElement('label');label.htmlFor='theme-color-'+key;label.append(document.createTextNode(labels[key]));
    const token=document.createElement('code');token.textContent=key;label.append(token);
    const hex=createControl('input',{id:label.htmlFor,type:'text',value:draft[mode.value][key],pattern:'#[0-9A-Fa-f]{6}',maxlength:7,required:true,'aria-label':labels[key]+' HEX','data-theme-hex':key});
    const picker=createControl('input',{type:'color',value:draft[mode.value][key],'aria-label':labels[key]+' color picker'});
    hex.addEventListener('input',()=>{if(hex.checkValidity()){draft[mode.value][key]=hex.value.toUpperCase();picker.value=hex.value;}update();});
    picker.addEventListener('input',()=>{draft[mode.value][key]=picker.value.toUpperCase();hex.value=draft[mode.value][key];update();});
    row.append(label,hex,picker);document.querySelector(index<11?'[data-theme-fields]':'[data-theme-status-fields]').append(row);
  }
  update();
}
function choose(id) { draft=api.get(id);draft.id='custom';name.value=draft.name;renderFields(); }
const active=api.current();
if(active.id==='custom'){const option=document.createElement('option');option.value='custom';option.textContent='Saved theme';preset.append(option);preset.value='custom';}
else if([...preset.options].some(option=>option.value===active.id))preset.value=active.id;
choose(preset.value);
preset.addEventListener('change',()=>{choose(preset.value);notify('Previewing this theme. Apply it to use it across the gallery.');});
mode.addEventListener('change',renderFields);
name.addEventListener('input',()=>{draft.name=name.value;update();});
apply.addEventListener('click',()=>{try {api.register(draft);api.apply(draft.id);notify('Theme applied. Your settings carry across pages and reloads.');}catch(error){notify(error.message);}});
document.querySelector('[data-theme-reset]').addEventListener('click',()=>{api.apply('ely');preset.value='ely';choose('ely');notify('Restored the default Ely Neutral theme.');});
document.querySelector('[data-theme-import]').addEventListener('click',()=>{
  try {const imported=JSON.parse(json.value);api.issues(imported);draft=imported;draft.id='custom';name.value=draft.name;renderFields();notify('Imported JSON as a new theme. Check the contrast before applying.');}
  catch(error){notify('Import failed: '+(error instanceof SyntaxError ? 'Check that the JSON is valid.' : error.message));}
});
document.querySelector('[data-theme-copy]').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText(json.value);notify('Theme JSON copied.');}
  catch {json.focus();json.select();notify('Clipboard access is unavailable. Copy the selected JSON manually.');}
});
