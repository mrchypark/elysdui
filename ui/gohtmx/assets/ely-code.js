// Generic code and JSON spans follow Ely's forms/code.rs lexer.
const keywords = new Set('as async await break case catch class const continue def do else enum export fn for from func function if impl import in let match mut new pub return static struct switch throw try type use var while yield SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER ON AND OR NOT AS GROUP BY ORDER HAVING LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE INDEX DROP ALTER DESC ASC DISTINCT UNION WITH CASE WHEN THEN ELSE END IS IN LIKE BETWEEN EXISTS INTERVAL'.split(' '));
const constants = new Set('false nil None null self this true undefined NULL TRUE FALSE'.split(' '));

export function codeSpans(source, json = false) {
  const spans = [];
  const pattern = /"(?:\\[^\n]|[^"\\\n])*"?|'(?:\\[^\n]|[^'\\\n])*'?|`(?:\\[^\n]|[^`\\\n])*`?|\/\/[^\n]*|[0-9][a-zA-Z0-9._]*|[\p{L}_$][\p{L}\p{N}_$]*|[^\s]/gu;
  for (const match of source.matchAll(pattern)) {
    const text = match[0];
    const kind = text.startsWith('//') ? 'comment' : /^["'`]/.test(text) ? 'string' : /^[0-9]/.test(text) ? 'number' : /^[\p{L}_$]/u.test(text) ? 'word' : 'mark';
    spans.push({start: match.index, end: match.index + text.length, text, kind});
  }
  return spans.map((span, index) => {
    const next = spans[index + 1]?.text;
    let kind = span.kind;
    if (json) {
      if (kind === 'string' && next === ':') kind = 'property';
      else if (kind === 'word') kind = ['true', 'false', 'null'].includes(span.text) ? 'constant' : 'variable';
      else if (kind === 'comment') kind = 'variable';
      else if (kind === 'mark') kind = 'punctuation';
    } else if (kind === 'word') {
      kind = keywords.has(span.text) ? 'keyword' : constants.has(span.text) ? 'constant' : next === '(' ? 'function' : /^\p{Lu}/u.test(span.text) ? 'type' : 'variable';
    } else if (kind === 'mark') kind = '()[]{},.;'.includes(span.text) ? 'punctuation' : 'operator';
    return {...span, kind};
  });
}
