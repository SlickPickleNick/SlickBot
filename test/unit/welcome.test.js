const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPlaceholders, parseColor } = require('../../src/modules/community/welcomeService');

test('Welcome Service String Templating and Color Parsing', async (t) => {
  await t.test('applyPlaceholders replaces member and server tags', () => {
    const member = {
      id: '123456789',
      user: { username: 'Newbie', tag: 'Newbie#0001', createdAt: new Date('2025-01-01') },
      guild: { name: 'Awesome Community', memberCount: 500 }
    };
    const template = 'Welcome {user} ({username}) to {server}! You are member #{memberCount}.';
    const result = applyPlaceholders(template, member);
    assert.equal(result, 'Welcome <@123456789> (Newbie) to Awesome Community! You are member #500.');
  });

  await t.test('parseColor parses valid hex strings', () => {
    assert.equal(parseColor('#ffffff'), 0xffffff);
    assert.equal(parseColor('ff0000'), 0xff0000);
    assert.equal(parseColor('invalid'), null);
    assert.equal(parseColor(null), null);
  });
});
