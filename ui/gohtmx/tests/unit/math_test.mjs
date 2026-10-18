import katex from '../../assets/ely/katex/katex.js';
import {mathOptions} from '../../assets/ely-math.js';

const options = mathOptions();
if (options.output !== 'mathml' || options.trust !== false || !options.throwOnError || options.maxExpand !== 1000 || options.maxSize !== 10) throw new Error('unsafe MathML adapter options');
if (options.macros === mathOptions().macros) throw new Error('macro state is shared between math instances');
for (const [source, marker] of [
  ['\\frac{a+\\sqrt{\\beta}}{c}', '<mfrac>'],
  ['\\int_0^1 x\\,dx', '∫'],
  ['\\begin{matrix}a&b\\\\c&d\\end{matrix}', '<mtable'],
]) {
  const output = katex.renderToString(source, options);
  if (!output.includes('<math') || !output.includes(marker)) throw new Error(`missing MathML for ${source}`);
}
const unsafe = katex.renderToString('\\href{https://unsafe.example}{x}', options);
if (unsafe.includes('href=')) throw new Error('trusted URL attribute in MathML output');
