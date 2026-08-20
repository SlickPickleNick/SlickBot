const test = require('node:test');
const assert = require('node:assert/strict');

const { truncate, asCodeBlock } = require('../../src/utils/format');
const {
  createBaseEmbed,
  createSuccessEmbed,
  createWarningEmbed,
  createErrorEmbed,
  formatEnabled,
  formatStatusBadge,
  SlickBotColors
} = require('../../src/modules/ui/uiService');
const { CustomIds } = require('../../src/modules/ui/customIds');

test('Formatting and UI helper functions', async (t) => {
  await t.test('truncate limits string length with ellipsis', () => {
    assert.equal(truncate('hello world', 5), 'he...');
    assert.equal(truncate('hello', 5), 'hello');
    assert.equal(truncate('', 5), '');
    assert.equal(truncate(null, 5), '');
  });

  await t.test('asCodeBlock wraps text in code block syntax', () => {
    assert.equal(asCodeBlock('SELECT 1'), '```text\nSELECT 1\n```');
  });

  await t.test('createBaseEmbed creates embed with title, description, and color', () => {
    const embed = createBaseEmbed({
      title: 'Test Title',
      description: 'Test Description',
      color: SlickBotColors.PRIMARY
    });
    assert.equal(embed.data.title, 'Test Title');
    assert.equal(embed.data.description, 'Test Description');
    assert.equal(embed.data.color, SlickBotColors.PRIMARY);
  });

  await t.test('createBaseEmbed safely truncates oversized descriptions and titles', () => {
    const longDesc = 'A'.repeat(5000);
    const longTitle = 'T'.repeat(300);
    const embed = createBaseEmbed({
      title: longTitle,
      description: longDesc
    });
    assert.ok(embed.data.description.length <= 4000);
    assert.ok(embed.data.description.endsWith('...'));
    assert.ok(embed.data.title.length <= 256);
  });

  await t.test('createSuccessEmbed, createWarningEmbed, createErrorEmbed apply proper colors', () => {
    const success = createSuccessEmbed('Success', 'Operation completed');
    assert.equal(success.data.color, SlickBotColors.SUCCESS);

    const warning = createWarningEmbed('Warning', 'Check configuration');
    assert.equal(warning.data.color, SlickBotColors.WARNING);

    const error = createErrorEmbed('Error', 'Operation failed');
    assert.equal(error.data.color, SlickBotColors.ERROR);
  });

  await t.test('formatEnabled and formatStatusBadge format display strings', () => {
    assert.equal(formatEnabled(true), 'Enabled');
    assert.equal(formatEnabled(false), 'Disabled');
    assert.equal(formatStatusBadge('online'), 'Online');
    assert.equal(formatStatusBadge('dnd'), 'Do Not Disturb');
    assert.equal(formatStatusBadge('idle'), 'Idle');
  });

  await t.test('CustomIds provides defined button and select prefixes', () => {
    assert.ok(CustomIds.TicketsRefresh);
    assert.ok(CustomIds.AchievementsHistoryPrefix);
    assert.ok(CustomIds.SetupRefresh);
  });
});
