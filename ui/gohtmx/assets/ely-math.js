let katexModule;

export const mathOptions = () => ({
  output: 'mathml', throwOnError: true, trust: false, maxExpand: 1000, maxSize: 10, macros: {},
});

const loadKatex = () => {
  katexModule ||= import('/assets/ely/katex/katex.js').then(module => module.default);
  return katexModule;
};

const contract = node => node.hasAttribute('data-foundation-math') ? {
  source: 'foundationMath', ready: 'foundationMathReady', fallback: 'foundationMathFallback',
} : {
  source: 'elyMath', ready: 'elyMathReady', fallback: 'elyMathFallback',
};

const fallback = (node, value, state) => {
  const text = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mtext');
  text.textContent = value;
  node.replaceChildren(text);
  node.dataset[state.fallback] = 'true';
  node.dataset[state.ready] = 'true';
};

// Lazy KaTeX MathML adapter. It never inserts caller HTML and cancellation is safe on unmount.
export const mountMathML = node => {
  const state = contract(node);
  const raw = node.dataset[state.source] || '';
  let active = true;
  node.dataset[state.ready] = 'false';
  delete node.dataset[state.fallback];
  loadKatex().then(katex => {
    const markup = katex.renderToString(raw, mathOptions());
    const math = new DOMParser().parseFromString(markup, 'text/html').querySelector('math');
    if (!math) throw new Error('KaTeX did not produce MathML');
    if (!active) return;
    node.replaceChildren(...[...math.childNodes].map(child => document.importNode(child, true)));
    node.dataset[state.ready] = 'true';
  }).catch(() => { if (active) fallback(node, raw, state); });
  return () => { active = false; };
};
