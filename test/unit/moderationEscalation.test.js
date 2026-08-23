const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
const { ModerationService } = require('../../src/modules/moderation/moderationService');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { ActionKeys } = require('../../src/modules/permissions/actionKeys');
const modCmd = require('../../src/commands/mod');
const { commands, commandMap } = require('../../src/commands');
const { validateCommandPayloads } = require('../../src/utils/commandValidation');

const mockDb = new MockDatabase();

test('Moderation Infraction Auto-Escalation Engine Tests', async (t) => {
  let service;
  const guildId = '100000000000000001';
  const targetUserId = '200000000000000001';

  t.beforeEach(() => {
    mockDb.install();
    service = new ModerationService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  await t.test('setEscalationRule, getEscalationRules, and removeEscalationRule manage rules', async () => {
    let rules = [];

    mockDb.addHandler('INSERT INTO moderation_escalation_rules', (sql, params) => {
      const existingIdx = rules.findIndex((r) => r.warning_count === params[1]);
      const newRule = {
        id: 'rule-1',
        guild_id: params[0],
        warning_count: params[1],
        punishment: params[2],
        duration_seconds: params[3],
        active: true
      };
      if (existingIdx >= 0) rules[existingIdx] = newRule;
      else rules.push(newRule);
      return { rows: [newRule], rowCount: 1 };
    });

    mockDb.addHandler('SELECT * FROM moderation_escalation_rules', () => ({
      rows: rules.filter((r) => r.active).sort((a, b) => a.warning_count - b.warning_count),
      rowCount: rules.length
    }));

    mockDb.addHandler('DELETE FROM moderation_escalation_rules', (sql, params) => {
      const removed = rules.find((r) => r.warning_count === params[1]);
      rules = rules.filter((r) => r.warning_count !== params[1]);
      return { rows: removed ? [removed] : [], rowCount: removed ? 1 : 0 };
    });

    // 1. Add 3-warning timeout rule (1 hour = 3600s)
    const rule1 = await service.setEscalationRule(guildId, 3, 'TIMEOUT', 3600);
    assert.equal(rule1.warning_count, 3);
    assert.equal(rule1.punishment, 'TIMEOUT');
    assert.equal(rule1.duration_seconds, 3600);

    // 2. Add 5-warning kick rule
    await service.setEscalationRule(guildId, 5, 'KICK');

    // 3. List rules
    const list = await service.getEscalationRules(guildId);
    assert.equal(list.length, 2);
    assert.equal(list[0].warning_count, 3);
    assert.equal(list[1].warning_count, 5);

    // 4. Remove rule
    const removed = await service.removeEscalationRule(guildId, 3);
    assert.ok(removed);
    const listAfter = await service.getEscalationRules(guildId);
    assert.equal(listAfter.length, 1);
    assert.equal(listAfter[0].warning_count, 5);
  });

  await t.test('getActiveWarningCount calculates active non-expired warnings', async () => {
    mockDb.addHandler('COUNT(*)::int AS count', (sql, params) => {
      assert.equal(params[0], guildId);
      assert.equal(params[1], targetUserId);
      return { rows: [{ count: 3 }], rowCount: 1 };
    });

    const count = await service.getActiveWarningCount(guildId, targetUserId, 30);
    assert.equal(count, 3);
  });

  await t.test('checkAndApplyEscalation triggers Timeout and creates escalation case', async () => {
    let timeoutApplied = false;
    let createdCase = null;
    let loggedEvent = null;

    mockDb.addHandler('COUNT(*)::int AS count', () => ({
      rows: [{ count: 3 }],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT * FROM moderation_escalation_rules', () => ({
      rows: [{ id: 'rule-3', guild_id: guildId, warning_count: 3, punishment: 'TIMEOUT', duration_seconds: 3600, active: true }],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT COALESCE(MAX(case_number), 0) + 1 AS next_number', () => ({
      rows: [{ next_number: 101 }],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO moderation_cases', (sql, params) => {
      createdCase = {
        id: 'case-101',
        guild_id: params[0],
        case_number: params[1],
        target_user_id: params[2],
        action_type: params[5],
        reason: params[6],
        duration_seconds: params[8]
      };
      return { rows: [createdCase], rowCount: 1 };
    });

    const mockMember = {
      id: targetUserId,
      user: { id: targetUserId, tag: 'BadActor#0001', bot: false },
      timeout: async () => { timeoutApplied = true; }
    };

    const mockGuild = {
      id: guildId,
      members: { fetch: async () => mockMember }
    };

    const mockAutoMod = {
      applyTimeout: async () => { timeoutApplied = true; return { roleApplied: true }; }
    };

    const mockLogger = {
      log: async (event) => { loggedEvent = event; }
    };

    const result = await service.checkAndApplyEscalation({
      guild: mockGuild,
      member: mockMember,
      targetUser: mockMember.user,
      actorUser: { id: 'mod-1' },
      autoMod: mockAutoMod,
      logger: mockLogger
    });

    assert.equal(result.escalated, true);
    assert.equal(result.punishment, 'TIMEOUT');
    assert.equal(result.warningCount, 3);
    assert.equal(timeoutApplied, true);
    assert.ok(createdCase);
    assert.equal(createdCase.case_number, 101);
    assert.equal(createdCase.action_type, 'TIMEOUT');
    assert.ok(loggedEvent);
    assert.equal(loggedEvent.eventKey, 'moderation-auto-escalation');
  });

  await t.test('checkAndApplyEscalation triggers Ban when 5-warning threshold is met', async () => {
    let banCreated = false;
    let createdCase = null;

    mockDb.addHandler('COUNT(*)::int AS count', () => ({
      rows: [{ count: 5 }],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT * FROM moderation_escalation_rules', () => ({
      rows: [
        { id: 'rule-3', guild_id: guildId, warning_count: 3, punishment: 'TIMEOUT', duration_seconds: 3600, active: true },
        { id: 'rule-5', guild_id: guildId, warning_count: 5, punishment: 'BAN', duration_seconds: null, active: true }
      ],
      rowCount: 2
    }));

    mockDb.addHandler('SELECT COALESCE(MAX(case_number), 0) + 1 AS next_number', () => ({
      rows: [{ next_number: 105 }],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO moderation_cases', (sql, params) => {
      createdCase = {
        id: 'case-105',
        case_number: params[1],
        action_type: params[5],
        reason: params[6]
      };
      return { rows: [createdCase], rowCount: 1 };
    });

    const mockGuild = {
      id: guildId,
      bans: {
        create: async (userId) => {
          if (userId === targetUserId) banCreated = true;
        }
      }
    };

    const targetUser = { id: targetUserId, tag: 'RepeatOffender#0001' };

    const result = await service.checkAndApplyEscalation({
      guild: mockGuild,
      targetUser,
      actorUser: { id: 'mod-1' }
    });

    assert.equal(result.escalated, true);
    assert.equal(result.punishment, 'BAN');
    assert.equal(result.warningCount, 5);
    assert.equal(banCreated, true);
    assert.ok(createdCase);
    assert.equal(createdCase.action_type, 'BAN');
  });

  await t.test('/mod warn command evaluates auto-escalation and formats reply embed', async () => {
    let replyEmbed = null;

    mockDb.addHandler('SELECT COALESCE(MAX(case_number), 0) + 1 AS next_number', () => ({
      rows: [{ next_number: 10 }],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO moderation_cases', (sql, params) => ({
      rows: [{
        id: 'case-10',
        guild_id: params[0],
        case_number: params[1],
        target_user_id: params[2],
        action_type: params[5],
        reason: params[6],
        status: 'OPEN'
      }],
      rowCount: 1
    }));

    mockDb.addHandler('COUNT(*)::int AS count', () => ({
      rows: [{ count: 3 }],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT * FROM moderation_escalation_rules', () => ({
      rows: [{ id: 'rule-3', guild_id: guildId, warning_count: 3, punishment: 'TIMEOUT', duration_seconds: 1800, active: true }],
      rowCount: 1
    }));

    const mockTargetUser = { id: targetUserId, tag: 'WarnTarget#0001', send: async () => {} };
    const mockMember = { id: targetUserId, user: mockTargetUser, timeout: async () => {} };

    const mockInteraction = {
      guildId,
      guild: {
        id: guildId,
        name: 'Test Guild',
        members: { fetch: async () => mockMember }
      },
      user: { id: 'mod-1', tag: 'Mod#0001' },
      options: {
        getSubcommand: () => 'warn',
        getUser: (name) => (name === 'user' ? mockTargetUser : null),
        getString: (name) => (name === 'reason' ? 'Disruptive behavior in chat' : null),
        getBoolean: () => false
      },
      reply: async (payload) => { replyEmbed = payload.embeds[0]; }
    };

    const ctx = {
      permissions: { ensureGuildConfig: async () => {} },
      logger: { log: async () => {} }
    };

    await modCmd.execute(mockInteraction, ctx);

    assert.ok(replyEmbed);
    assert.match(replyEmbed.data.title, /Warning Case Created/i);
    const activeField = replyEmbed.data.fields.find((f) => f.name === 'Active Warnings');
    assert.ok(activeField);
    assert.match(activeField.value, /\*\*3\*\* warning\(s\)/i);
    const autoEscField = replyEmbed.data.fields.find((f) => f.name.includes('Infraction Auto-Escalation Applied'));
    assert.ok(autoEscField);
    assert.match(autoEscField.value, /Action Executed: \*\*TIMEOUT\*\*/i);
  });

  await t.test('/mod escalation subcommands and validation', () => {
    assert.equal(modCmd.data.name, 'mod');
    assert.equal(modCmd.moduleKey, ModuleKeys.MODERATION);

    const makeInteraction = (subcommand) => ({
      options: { getSubcommand: () => subcommand }
    });

    assert.equal(modCmd.getActionKey(makeInteraction('warn')), ActionKeys.ModerationWarn);
    assert.equal(modCmd.getActionKey(makeInteraction('warnings')), ActionKeys.ModerationWarnings);
    assert.equal(modCmd.getActionKey(makeInteraction('escalation-list')), ActionKeys.ModerationEscalation);
    assert.equal(modCmd.getActionKey(makeInteraction('escalation-set')), ActionKeys.ModerationEscalation);
    assert.equal(modCmd.getActionKey(makeInteraction('escalation-remove')), ActionKeys.ModerationEscalation);

    assert.equal(commandMap.has('mod'), true);
    const payloads = commands.map((c) => c.data.toJSON());
    const errors = validateCommandPayloads(payloads);
    assert.deepEqual(errors, []);
  });
});
