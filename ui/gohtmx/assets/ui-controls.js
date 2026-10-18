// Clone server-rendered shared controls so browser callers use the same markup.
export function createControl(name, attributes = {}, text = '') {
	if (!['input', 'textarea', 'select', 'checkbox', 'button'].includes(name)) throw new Error(`Unknown shared control: ${name}`);
  const template = document.querySelector(`[data-ui-control-template="${name}"]`);
  if (!template) throw new Error(`Missing shared control template: ${name}`);
  const node = template.content.firstElementChild.cloneNode(true);
  const control = node.matches('input,textarea,select,button') ? node : node.querySelector('input,textarea,select,button');
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class' || key === 'className') control.classList.add(...String(value).split(/\s+/).filter(Boolean));
    else if (key === 'value') control.value = value;
    else if (/^on/i.test(key) || key === 'innerHTML') throw new Error(`Unsupported control attribute: ${key}`);
    else control.setAttribute(key, value === true ? '' : String(value));
  }
  if (text !== '') control.textContent = text;
  return node;
}
