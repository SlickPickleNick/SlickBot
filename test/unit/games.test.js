const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseIntegerOrExpression,
  GAME_KEYS
} = require('../../src/modules/community/gameService');

test('Community Games Math and Expression Evaluation', async (t) => {
  await t.test('GAME_KEYS defines supported games', () => {
    assert.equal(GAME_KEYS.COUNTING, 'COUNTING');
    assert.equal(GAME_KEYS.TIC_TAC_TOE, 'TIC_TAC_TOE');
    assert.equal(GAME_KEYS.CONNECT_FOUR, 'CONNECT_FOUR');
  });

  await t.test('parseIntegerOrExpression parses simple integers', () => {
    assert.equal(parseIntegerOrExpression('1', false), 1n);
    assert.equal(parseIntegerOrExpression('100', false), 100n);
    assert.equal(parseIntegerOrExpression('-5', false), -5n);
    assert.equal(parseIntegerOrExpression('abc', false), null);
    assert.equal(parseIntegerOrExpression('', false), null);
  });

  await t.test('parseIntegerOrExpression evaluates math expressions when allowed', () => {
    assert.equal(parseIntegerOrExpression('2 + 3', true), 5n);
    assert.equal(parseIntegerOrExpression('10 * (4 - 2)', true), 20n);
    assert.equal(parseIntegerOrExpression('2 ^ 4', true), 16n);
    assert.equal(parseIntegerOrExpression('20 / 4', true), 5n);
  });

  await t.test('parseIntegerOrExpression rejects invalid expressions or division by zero', () => {
    assert.equal(parseIntegerOrExpression('10 / 0', true), null);
    assert.equal(parseIntegerOrExpression('7 / 2', true), null); // Non-integer division rejected
    assert.equal(parseIntegerOrExpression('2 + * 3', true), null);
  });
});
