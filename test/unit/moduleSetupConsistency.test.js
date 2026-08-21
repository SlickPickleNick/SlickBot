const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
const { ModuleKeys, implementedModules } = require('../../src/modules/moduleRegistry');
const panelsModule = require('../../src/modules/ui/panels');

const permissionsCmd = require('../../src/commands/permissions');
const loggingCmd = require('../../src/commands/logging');
const statusCmd = require('../../src/commands/status');
const modulesCmd = require('../../src/commands/modules');
const modCmd = require('../../src/commands/mod');
const tempRoleCmd = require('../../src/commands/tempRole');
const customCommandCmd = require('../../src/commands/customCommand');
const joinCreateCmd = require('../../src/commands/joinCreate');
const faqCmd = require('../../src/commands/faq');
const rolesCmd = require('../../src/commands/roles');
const botUpdatesCmd = require('../../src/commands/botUpdates');
const utilityCmd = require('../../src/commands/utility');
const setupCmd = require('../../src/commands/setup');

const mockDb = new MockDatabase();

test('Module Setup & Dashboard Command Consistency', async (t) => {
  t.beforeEach(() => {
    mockDb.install();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  await t.test('All major command files define a manager subcommand', () => {
    const commandsWithManager = [
      permissionsCmd,
      loggingCmd,
      statusCmd,
      modulesCmd,
      modCmd,
      tempRoleCmd,
      customCommandCmd,
      joinCreateCmd,
      faqCmd,
      rolesCmd,
      botUpdatesCmd,
      utilityCmd
    ];

    for (const cmd of commandsWithManager) {
      const json = cmd.data.toJSON();
      const subcommands = json.options ? json.options.filter((opt) => opt.type === 1).map((opt) => opt.name) : [];
      assert.ok(
        subcommands.includes('manager'),
        `Command /${json.name} should include a 'manager' subcommand`
      );
    }
  });

  await t.test('Commands with dedicated setup define a setup subcommand', () => {
    const commandsWithSetup = [
      permissionsCmd,
      loggingCmd,
      customCommandCmd,
      rolesCmd,
      utilityCmd
    ];

    for (const cmd of commandsWithSetup) {
      const json = cmd.data.toJSON();
      const subcommands = json.options ? json.options.filter((opt) => opt.type === 1).map((opt) => opt.name) : [];
      assert.ok(
        subcommands.includes('setup'),
        `Command /${json.name} should include a 'setup' subcommand`
      );
    }
  });

  await t.test('Main /setup command defines optional admin and moderator role options', () => {
    const json = setupCmd.data.toJSON();
    const optionNames = (json.options || []).map((o) => o.name);
    assert.ok(optionNames.includes('log_channel'));
    assert.ok(optionNames.includes('admin_role'));
    assert.ok(optionNames.includes('moderator_role'));
  });

  await t.test('getAllModuleStatuses is exported from panels.js and returns array of statuses', async () => {
    mockDb.addHandler('module_configs', () => ({
      rows: implementedModules.map((key) => ({ module_key: key, enabled: true })),
      rowCount: implementedModules.length
    }));
    mockDb.addHandler('guild_configs', () => ({ rows: [{ default_log_channel_id: '123' }], rowCount: 1 }));
    mockDb.addHandler('log_module_settings', () => ({ rows: [], rowCount: 0 }));

    const statuses = await panelsModule.getAllModuleStatuses('100000000000000001');
    assert.ok(Array.isArray(statuses));
    assert.ok(statuses.length > 0);
  });
});
