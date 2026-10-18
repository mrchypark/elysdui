// Arithmetic is parsed as data. Caller expressions never execute JavaScript.
export function evaluateExpression(source, variables = {}) {
  const text = String(source);
  if (text.length > 1024) throw new Error('Expression is too long.');
  const tokens = text.match(/\d+(?:\.\d*)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/%]|\S/g) || [];
  if (!tokens.length || tokens.length > 256) throw new Error('Enter a bounded arithmetic expression.');
  let cursor = 0;
  const number = (depth = 0) => {
    if (depth > 32) throw new Error('Expression nesting is too deep.');
    const token = tokens[cursor++];
    if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * number(depth + 1);
    if (token === '(') {
      const value = sum(depth + 1);
      if (tokens[cursor++] !== ')') throw new Error('Missing closing parenthesis.');
      return value;
    }
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token || '')) return Number(token);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token || '') && Object.hasOwn(variables, token)) {
      const value = Number(variables[token]);
      if (Number.isFinite(value)) return value;
    }
    throw new Error(`Unknown number or variable: ${token || 'end of expression'}`);
  };
  const product = depth => {
    let value = number(depth);
    while (['*', '/', '%'].includes(tokens[cursor])) {
      const operation = tokens[cursor++], right = number(depth);
      if ((operation === '/' || operation === '%') && right === 0) throw new Error('Division by zero.');
      value = operation === '*' ? value * right : operation === '/' ? value / right : value % right;
    }
    return value;
  };
  const sum = depth => {
    let value = product(depth);
    while (['+', '-'].includes(tokens[cursor])) {
      const operation = tokens[cursor++], right = product(depth);
      value += operation === '+' ? right : -right;
    }
    return value;
  };
  const result = sum(0);
  if (cursor !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid arithmetic expression.');
  return result;
}

export function validateCron(source) {
  const fields = String(source).trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Cron requires minute, hour, day, month and weekday.');
  const aliases = {3:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],4:['SUN','MON','TUE','WED','THU','FRI','SAT']};
  for (const index of [3,4]) fields[index]=fields[index].replace(/[a-z]+/gi,name=>{const value=aliases[index].indexOf(name.toUpperCase());if(value<0)throw new Error(`Unknown cron name: ${name}.`);return String(value+(index===3?1:0));});
  const bounds = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  fields.forEach((field, index) => {
    const [min, max] = bounds[index];
    for (const part of field.split(',')) {
      const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
      if (!match || (match[2] && (!Number(match[2]) || Number(match[2]) > max - min + 1))) throw new Error(`Invalid cron field ${index + 1}.`);
      if (match[1] === '*') continue;
      const range = match[1].split('-').map(Number);
      if (range.some(value => value < min || value > max) || (range.length === 2 && range[0] > range[1])) throw new Error(`Cron field ${index + 1} is outside ${min}–${max}.`);
    }
  });
  return fields.join(' ');
}

export function cronPreview(source, after = new Date(), count = 3) {
  const rule = validateCron(source), fields = rule.split(' '), bounds = [[0,59],[0,23],[1,31],[1,12],[0,7]];
  if (!(after instanceof Date) || !Number.isFinite(after.getTime())) throw new Error('Invalid cron reference date.');
  if (!Number.isInteger(count) || count < 0 || count > 100) throw new Error('Invalid cron result count.');
  const values = fields.map((field,index) => {
    const result = new Set(), [min,max] = bounds[index];
    for (const part of field.split(',')) {
      const [range,stride] = part.split('/'), step = Number(stride || 1);
      const [start,end] = range === '*' ? [min,max] : range.includes('-') ? range.split('-').map(Number) : [Number(range),stride ? max : Number(range)];
      for (let value=start;value<=end;value+=step) result.add(index===4 && value===7 ? 0 : value);
    }
    return [...result].sort((a,b)=>a-b);
  });
  const [minutes,hours,days,months,weekdays] = values, names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const every = /^\*\/(\d+)$/.exec(fields[0]);
  let description = minutes.length===60 && hours.length===24 ? 'Every minute' : every && hours.length===24 ? `Every ${every[1]} minutes` : minutes.length===1 && hours.length===1 ? `At ${String(hours[0]).padStart(2,'0')}:${String(minutes[0]).padStart(2,'0')}` : minutes.length===1 && hours.length===24 ? `At minute ${minutes[0]} of every hour` : `At minute ${minutes.join(', ')} past hour ${hours.join(', ')}`;
  const weekdayText = weekdays.join(',')==='1,2,3,4,5' ? 'Monday through Friday' : weekdays.map(day=>names[day]).join(', ');
  const both = fields[2].startsWith('*') || fields[4].startsWith('*');
  if (both) {
    if (days.length<31) description+=`, on day ${days.join(', ')} of the month`;
    if (weekdays.length<7) description+=(days.length<31?' if it falls on ':', ')+weekdayText;
  } else if (days.length<31 && weekdays.length<7) description+=`, on day ${days.join(', ')} or ${weekdayText}`;
  if (months.length<12) description+=`, in ${months.map(month=>new Intl.DateTimeFormat('en',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,month-1,1)))).join(', ')}`;
  const runs = [], date = new Date(Date.UTC(after.getUTCFullYear(),after.getUTCMonth(),after.getUTCDate()));
  for (let day=0;day<366*5 && runs.length<count;day++,date.setUTCDate(date.getUTCDate()+1)) {
    const dayMatch=days.includes(date.getUTCDate()),weekdayMatch=weekdays.includes(date.getUTCDay());
    if (!months.includes(date.getUTCMonth()+1) || !(both ? dayMatch && weekdayMatch : dayMatch || weekdayMatch)) continue;
    for (const hour of hours) for (const minute of minutes) {
      const at=new Date(date);at.setUTCHours(hour,minute,0,0);
      if (at>after && runs.length<count) runs.push(at.toISOString());
    }
  }
  return {rule,description,runs};
}
