import assert from 'node:assert/strict';
import {evaluateExpression, validateCron} from '../../assets/ely-expressions.js';

assert.equal(evaluateExpression('price * quantity + (10 - 4) / 2', {price: 8, quantity: 3}), 27);
assert.equal(evaluateExpression('-(.5 + 2) * -2'), 5);
for (const source of ['1 / 0', '1 % 0', 'unknown + 1', '__proto__', 'process.exit()', '1 +', '1 2', '2 ** 3', '1..2', '('.repeat(40)+'1'+')'.repeat(40)]) assert.throws(() => evaluateExpression(source));
assert.equal(validateCron('*/5 0-23 * 1,6 0-7'), '*/5 0-23 * 1,6 0-7');
for (const source of ['* * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8', '*/0 * * * *', '10-2 * * * *', 'a * * * *']) assert.throws(() => validateCron(source));

const {cronPreview} = await import('../../assets/ely-expressions.js');
assert.deepEqual(cronPreview('*/15 * * * *',new Date('2026-09-25T12:00:00Z')).runs,['2026-09-25T12:15:00.000Z','2026-09-25T12:30:00.000Z','2026-09-25T12:45:00.000Z']);
assert.equal(cronPreview('0 9 * * 1-5',new Date('2026-09-25T12:00:00Z'),1).runs[0],'2026-09-28T09:00:00.000Z');
assert.equal(cronPreview('0 9 * * 1-5').description,'At 09:00, Monday through Friday');
assert.equal(cronPreview('0 0 29 2 *',new Date('2026-09-25T12:00:00Z'),1).runs[0],'2028-02-29T00:00:00.000Z');
assert.equal(cronPreview('0 0 1 * 1',new Date('2026-09-25T12:00:00Z'),1).runs[0],'2026-09-28T00:00:00.000Z');
assert.equal(cronPreview('0 0 * * 7',new Date('2026-09-25T12:00:00Z'),1).runs[0],'2026-09-27T00:00:00.000Z');
assert.deepEqual(cronPreview('0 0 30 2 *',new Date('2026-09-25T12:00:00Z')).runs,[]);
assert.throws(()=>cronPreview('* * * * *',new Date('invalid')));

assert.equal(validateCron('0 9 * JAN,MAR MON-FRI'),'0 9 * 1,3 1-5');
assert.throws(()=>validateCron('0 9 * invalid MON'));
