const test = require('node:test');
const assert = require('node:assert/strict');
const { GiveawayService } = require('../../src/modules/community/giveawayService');

test('Giveaway Winner Selection Algorithm', async (t) => {
  await t.test('pickWinners selects specified count of unique winners', () => {
    const service = new GiveawayService();
    const entries = [
      { user_id: 'user-1' },
      { user_id: 'user-2' },
      { user_id: 'user-3' },
      { user_id: 'user-4' },
      { user_id: 'user-5' }
    ];

    const winners = service.pickWinners(entries, 3);
    assert.equal(winners.length, 3);
    const unique = new Set(winners);
    assert.equal(unique.size, 3);
    for (const w of winners) {
      assert.ok(entries.some((e) => e.user_id === w));
    }
  });

  await t.test('pickWinners handles pools smaller than requested winner count', () => {
    const service = new GiveawayService();
    const entries = [{ user_id: 'user-1' }, { user_id: 'user-2' }];
    const winners = service.pickWinners(entries, 5);
    assert.equal(winners.length, 2);
  });

  await t.test('pickWinners respects excluded user IDs for rerolls', () => {
    const service = new GiveawayService();
    const entries = [{ user_id: 'user-1' }, { user_id: 'user-2' }, { user_id: 'user-3' }];
    const winners = service.pickWinners(entries, 1, ['user-1', 'user-2']);
    assert.deepEqual(winners, ['user-3']);
  });
});
