const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readVariable,
  readOptionalVariable,
  readNumber,
  normalizeList,
  env
} = require('../../src/config/env');

test('Environment parsing helpers', async (t) => {
  await t.test('readVariable returns value from process.env or fallback', () => {
    process.env.TEST_UNIT_VAR = 'hello_world';
    assert.equal(readVariable('TEST_UNIT_VAR', [], 'fallback'), 'hello_world');
    assert.equal(readVariable('NON_EXISTENT_VAR_XYZ', [], 'fallback_val'), 'fallback_val');
    delete process.env.TEST_UNIT_VAR;
  });

  await t.test('readNumber parses positive integers from env', () => {
    process.env.TEST_PORT_VAR = '8080';
    assert.equal(readNumber('TEST_PORT_VAR', 3000), 8080);
    assert.equal(readNumber('NON_EXISTENT_PORT_VAR', 3000), 3000);
    delete process.env.TEST_PORT_VAR;
  });

  await t.test('normalizeList splits comma separated values and filters empties', () => {
    assert.deepEqual(normalizeList('a, b, c'), ['a', 'b', 'c']);
    assert.deepEqual(normalizeList('123, 456, 789'), ['123', '456', '789']);
    assert.deepEqual(normalizeList(''), []);
    assert.deepEqual(normalizeList(null), []);
  });

  await t.test('env object has default values populated', () => {
    assert.equal(typeof env.PORT, 'number');
    assert.ok(env.DEFAULT_TIMEZONE);
  });
});
