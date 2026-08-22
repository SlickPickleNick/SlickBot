const test = require('node:test');
const assert = require('node:assert/strict');
const helpCommand = require('../../src/commands/help');
const {
  HELP_CATALOG,
  HELP_CATEGORIES,
  MODULE_LABELS,
  getHelpAutocomplete,
  buildCommandHelpPayload,
  buildModuleHelpPayload,
  buildCategoryHelpPayload,
  buildHelpPayload,
  handleHelpSearch
} = require('../../src/modules/help/helpService');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { CustomIds } = require('../../src/modules/ui/customIds');

test('Help System: Command Registration and Autocomplete Options', () => {
  assert.equal(helpCommand.data.name, 'help');
  assert.equal(typeof helpCommand.autocomplete, 'function');

  const json = helpCommand.data.toJSON();
  assert.equal(json.options.length, 2);

  const commandOpt = json.options.find((o) => o.name === 'command');
  const moduleOpt = json.options.find((o) => o.name === 'module');

  assert.ok(commandOpt, 'command option should exist');
  assert.equal(commandOpt.autocomplete, true);
  assert.ok(moduleOpt, 'module option should exist');
  assert.equal(moduleOpt.autocomplete, true);
});

test('Help System: Autocomplete Helper returns filtered command and module choices', () => {
  const purgeChoices = getHelpAutocomplete('command', 'pur');
  assert.ok(purgeChoices.length >= 1);
  assert.ok(purgeChoices.some((c) => c.value === 'purge'));

  const ticketChoices = getHelpAutocomplete('command', 'ticket');
  assert.ok(ticketChoices.some((c) => c.value === 'ticket'));

  const modChoices = getHelpAutocomplete('module', 'mod');
  assert.ok(modChoices.some((c) => c.value === ModuleKeys.MODERATION));
});

test('Help System: HELP_CATALOG covers all core and essential commands', () => {
  const commandNames = HELP_CATALOG.map((c) => c.name);
  const essential = ['ping', 'help', 'setup', 'mod', 'purge', 'ticket', 'giveaway', 'level', 'games', 'feed', 'lockdown', 'temp-role'];

  for (const name of essential) {
    assert.ok(commandNames.includes(name), `HELP_CATALOG should include '${name}'`);
  }
});

test('Help System: buildCommandHelpPayload renders syntax, arguments, and quick actions', () => {
  const payload = buildCommandHelpPayload('purge');
  assert.ok(payload.embeds?.length > 0);
  const embed = payload.embeds[0].data;
  assert.ok(embed.title.includes('/purge'));
  assert.ok(embed.description.includes('Syntax'));
  assert.ok(embed.description.includes('Examples'));

  assert.ok(payload.components?.length > 0);
});

test('Help System: buildModuleHelpPayload renders module overview and command list', () => {
  const payload = buildModuleHelpPayload(ModuleKeys.TICKETS);
  assert.ok(payload.embeds?.length > 0);
  const embed = payload.embeds[0].data;
  assert.ok(embed.title.includes('Support Tickets'));
  assert.ok(embed.description.includes('/ticket'));
  assert.ok(payload.components?.length > 0);
});

test('Help System: buildCategoryHelpPayload filters and paginates commands cleanly', () => {
  const page1 = buildCategoryHelpPayload('MEMBER', 'member', 1);
  const page2 = buildCategoryHelpPayload('MEMBER', 'member', 2);

  assert.ok(page1.embeds?.length > 0);
  assert.ok(page1.embeds[0].data.description.includes('Page 1'));

  // Verify pagination navigation row
  const navRow = page1.components.find((row) =>
    row.components.some((c) => c.data?.custom_id?.startsWith(CustomIds.HelpPagePrefix))
  );
  assert.ok(navRow, 'Navigation row with page buttons should exist');

  const prevBtn = navRow.components.find((c) => c.data?.label === 'Previous');
  assert.equal(prevBtn.data.disabled, true, 'Previous button on page 1 should be disabled');

  const indicatorBtn = navRow.components.find((c) => c.data?.custom_id === 'slickbot:help:page_indicator');
  assert.ok(indicatorBtn.data.label.includes('Page 1 of'));

  if (page2.embeds[0].data.description.includes('Page 2')) {
    const page2Nav = page2.components.find((row) =>
      row.components.some((c) => c.data?.custom_id?.startsWith(CustomIds.HelpPagePrefix))
    );
    const page2Prev = page2Nav.components.find((c) => c.data?.label === 'Previous');
    assert.equal(page2Prev.data.disabled, false, 'Previous button on page 2 should be enabled');
  }
});

test('Help System: handleHelpSearch finds commands by keyword', () => {
  const searchResults = handleHelpSearch('timeout');
  assert.ok(searchResults.embeds?.length > 0);
  assert.ok(searchResults.embeds[0].data.description.includes('/mod'));

  const emptyResults = handleHelpSearch('nonexistentxyz123');
  assert.ok(emptyResults.embeds[0].data.title.includes('Search Results'));
  assert.ok(emptyResults.embeds[0].data.description.includes('No commands matched'));
});
