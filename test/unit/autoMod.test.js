const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AutoModService,
  DEFAULT_AUTOMOD_CONFIG,
  DEFAULT_BLACKLIST_PATTERNS,
  AUTOMOD_PRESETS,
  RULE_KEYS,
  buildBlacklistAddModal
} = require('../../src/modules/moderation/autoModService');
const {
  buildAutoModWizard,
  buildAutoModManagerPanel,
  buildRuleEditComponents,
  buildThresholdTuneModal,
  buildDomainWhitelistModal
} = require('../../src/modules/moderation/autoModUi');
const { MockDatabase } = require('../helpers/mockDb');
const { createMockChannel, createMockGuild, createMockUser } = require('../helpers/mockDiscord');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { ActionKeys } = require('../../src/modules/permissions/actionKeys');
const automodCmd = require('../../src/commands/automod');
const { commands, commandMap } = require('../../src/commands');
const { validateCommandPayloads } = require('../../src/utils/commandValidation');
const { PermissionFlagsBits } = require('discord.js');

const mockDb = new MockDatabase();

test('Auto-Mod & Anti-Raid Engine Tests', async (t) => {
  t.beforeEach(() => {
    mockDb.install();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  const guildId = '100000000000000001';
  const channelId = '200000000000000001';
  const userId = '300000000000000001';

  await t.test('getConfig returns default settings when no record exists', async () => {
    const service = new AutoModService();
    mockDb.addHandler('SELECT * FROM automod_configs', () => ({ rows: [], rowCount: 0 }));

    const config = await service.getConfig(guildId);
    assert.equal(config.enabled, true);
    assert.equal(config.anti_invites_enabled, true);
    assert.equal(config.anti_spam_enabled, true);
    assert.equal(config.raid_shield_enabled, true);
    assert.equal(config.default_blacklist_enabled, true);
  });

  await t.test('upsertConfig updates settings and reflects in cache', async () => {
    const service = new AutoModService();
    let savedRow = null;

    mockDb.addHandler('SELECT * FROM automod_configs', () => ({ rows: savedRow ? [savedRow] : [], rowCount: savedRow ? 1 : 0 }));
    mockDb.addHandler('INSERT INTO automod_configs', (sql, params) => {
      savedRow = {
        guild_id: params[0],
        enabled: params[1],
        anti_invites_enabled: params[2],
        anti_spam_max_messages: params[10],
        raid_join_threshold: params[40]
      };
      return { rows: [savedRow], rowCount: 1 };
    });

    const updated = await service.upsertConfig(guildId, {
      anti_invites_enabled: false,
      anti_spam_max_messages: 10,
      raid_join_threshold: 12
    });

    assert.equal(updated.anti_invites_enabled, false);
    assert.equal(updated.anti_spam_max_messages, 10);
    assert.equal(updated.raid_join_threshold, 12);

    const cached = await service.getConfig(guildId);
    assert.equal(cached.anti_spam_max_messages, 10);
  });

  await t.test('checkAntiInvites flags unauthorized Discord invites but allows whitelisted codes', () => {
    const service = new AutoModService();
    const config = {
      anti_invites_enabled: true,
      anti_invites_action: 'DELETE',
      whitelisted_invites: ['slickpickle']
    };

    // Block generic invite
    const violation1 = service.checkAntiInvites('Join my server at discord.gg/evil123 now!', config);
    assert.ok(violation1);
    assert.equal(violation1.rule, 'ANTI_INVITES');

    // Block dsc.gg invite
    const violation2 = service.checkAntiInvites('Visit https://dsc.gg/coolserver', config);
    assert.ok(violation2);

    // Allow whitelisted invite
    const allowed = service.checkAntiInvites('Join discord.gg/slickpickle today!', config);
    assert.equal(allowed, null);
  });

  await t.test('checkAntiLinks flags external URLs but respects domain whitelist', () => {
    const service = new AutoModService();
    const config = {
      anti_links_enabled: true,
      anti_links_action: 'DELETE',
      whitelisted_domains: ['youtube.com', 'twitch.tv']
    };

    // Block unapproved link
    const violation = service.checkAntiLinks('Check this out: https://sketchy-site.xyz/login', config);
    assert.ok(violation);
    assert.equal(violation.rule, 'ANTI_LINKS');

    // Allow whitelisted domain
    const allowed1 = service.checkAntiLinks('Watch my video at https://www.youtube.com/watch?v=123', config);
    assert.equal(allowed1, null);

    const allowed2 = service.checkAntiLinks('Live stream on https://twitch.tv/ninja', config);
    assert.equal(allowed2, null);
  });

  await t.test('checkSpamAndDuplicates detects message flood and duplicate repetition', () => {
    const service = new AutoModService();
    const config = {
      anti_spam_enabled: true,
      anti_spam_max_messages: 4,
      anti_spam_seconds: 4,
      anti_duplicates_enabled: true,
      anti_duplicates_max_count: 3,
      anti_duplicates_seconds: 10
    };

    // Anti-Spam (4 messages in rapid succession)
    assert.equal(service.checkSpamAndDuplicates(guildId, userId, 'msg 1', config), null);
    assert.equal(service.checkSpamAndDuplicates(guildId, userId, 'msg 2', config), null);
    assert.equal(service.checkSpamAndDuplicates(guildId, userId, 'msg 3', config), null);
    const spamViolation = service.checkSpamAndDuplicates(guildId, userId, 'msg 4', config);
    assert.ok(spamViolation);
    assert.equal(spamViolation.rule, 'ANTI_SPAM');

    // Anti-Duplicates (3 identical messages)
    const otherUser = 'user-456';
    assert.equal(service.checkSpamAndDuplicates(guildId, otherUser, 'same message spam', config), null);
    assert.equal(service.checkSpamAndDuplicates(guildId, otherUser, 'same message spam', config), null);
    const dupViolation = service.checkSpamAndDuplicates(guildId, otherUser, 'same message spam', config);
    assert.ok(dupViolation);
    assert.equal(dupViolation.rule, 'ANTI_DUPLICATES');
  });

  await t.test('checkAntiMentions, checkAntiCaps, checkAntiZalgo, checkAntiEmojis detect excessive violations', () => {
    const service = new AutoModService();
    const config = {
      anti_mentions_enabled: true,
      anti_mentions_max_count: 4,
      anti_caps_enabled: true,
      anti_caps_min_chars: 10,
      anti_caps_percent: 70,
      anti_emojis_enabled: true,
      anti_emojis_max_count: 5,
      anti_zalgo_enabled: true
    };

    // Mentions
    const mockMsg = {
      mentions: {
        users: new Map([['1', {}], ['2', {}], ['3', {}]]),
        roles: new Map([['4', {}]])
      }
    };
    const mentionViolation = service.checkAntiMentions(mockMsg, config);
    assert.ok(mentionViolation);
    assert.equal(mentionViolation.rule, 'ANTI_MENTIONS');

    // Caps
    const capsViolation = service.checkAntiCaps('HELLO EVERYONE THIS IS ALL CAPS MESSAGE', config);
    assert.ok(capsViolation);
    assert.equal(capsViolation.rule, 'ANTI_CAPS');

    // Emojis
    const emojiViolation = service.checkAntiEmojis('😀 😁 😂 🤣 😃 😄', config);
    assert.ok(emojiViolation);
    assert.equal(emojiViolation.rule, 'ANTI_EMOJIS');

    // Zalgo
    const zalgoViolation = service.checkAntiZalgo('Ḧ̶̡̦́ë̶̡̦́l̴̡̦̈́l̷̡̦̈́ö̶̡̦́', config);
    assert.ok(zalgoViolation);
    assert.equal(zalgoViolation.rule, 'ANTI_ZALGO');
  });

  await t.test('checkBlacklists blocks default phishing phrases and custom patterns', () => {
    const service = new AutoModService();
    const config = {
      default_blacklist_enabled: true,
      word_blacklist_action: 'DELETE'
    };

    // 1. Default Built-in Phishing Filter
    const scamViolation = service.checkBlacklists('Click here for free nitro gift!', [], config);
    assert.ok(scamViolation);
    assert.equal(scamViolation.rule, 'DEFAULT_BLACKLIST');

    // 2. Custom Exact Word Match
    const customBlacklists = [
      { pattern: 'bannedword', match_type: 'WORD', severity: 'WARN' },
      { pattern: 'badlink', match_type: 'WILDCARD', severity: 'DELETE' },
      { pattern: 'token[0-9]{4}', match_type: 'REGEX', severity: 'TIMEOUT' }
    ];

    const wordViolation = service.checkBlacklists('This contains bannedword inside', customBlacklists, config);
    assert.ok(wordViolation);
    assert.equal(wordViolation.rule, 'WORD_BLACKLIST');
    assert.equal(wordViolation.action, 'WARN');

    // 3. Custom Regex Match
    const regexViolation = service.checkBlacklists('Here is token9999 secret', customBlacklists, config);
    assert.ok(regexViolation);
    assert.equal(regexViolation.rule, 'REGEX_BLACKLIST');
    assert.equal(regexViolation.action, 'TIMEOUT');
  });

  await t.test('isExempt allows administrators, whitelisted roles, channels, and users', () => {
    const service = new AutoModService();
    const config = {
      exempt_roles: ['role-mod'],
      exempt_channels: ['channel-bot'],
      exempt_users: ['user-vip']
    };

    // Admin member
    const adminMember = {
      id: 'admin-1',
      permissions: { has: (p) => p === PermissionFlagsBits.Administrator },
      roles: { cache: new Map() }
    };
    assert.equal(service.isExempt(adminMember, { id: 'c1' }, config), true);

    // Whitelisted user
    const vipMember = {
      id: 'user-vip',
      permissions: { has: () => false },
      roles: { cache: new Map() }
    };
    assert.equal(service.isExempt(vipMember, { id: 'c1' }, config), true);

    // Whitelisted channel
    const regularMember = {
      id: 'regular-user',
      permissions: { has: () => false },
      roles: { cache: new Map() }
    };
    assert.equal(service.isExempt(regularMember, { id: 'channel-bot' }, config), true);

    // Non-exempt user in regular channel
    assert.equal(service.isExempt(regularMember, { id: 'channel-general' }, config), false);
  });

  await t.test('processViolation deletes message, creates moderation case, and notifies user', async () => {
    const service = new AutoModService();
    let messageDeleted = false;
    let createdCase = null;
    let userDMed = false;

    const mockMessage = {
      id: 'msg-1',
      guild: { id: guildId, name: 'Test Server' },
      channel: { id: channelId },
      author: {
        id: userId,
        tag: 'baduser#0001',
        send: async () => { userDMed = true; }
      },
      member: {
        moderatable: true,
        timeout: async () => {}
      },
      content: 'free nitro at discordnitro.gift',
      delete: async () => { messageDeleted = true; }
    };

    const mockModerationService = {
      createCase: async (input) => {
        createdCase = input;
        return { case_number: 42, ...input };
      }
    };

    const violation = {
      rule: 'DEFAULT_BLACKLIST',
      label: 'Known Phishing Phrase',
      action: 'WARN',
      timeoutSeconds: 0,
      matched: 'free nitro'
    };

    const config = {
      dm_notification_enabled: true
    };

    await service.processViolation({
      message: mockMessage,
      violation,
      config,
      logger: null,
      moderationService: mockModerationService
    });

    assert.equal(messageDeleted, true);
    assert.equal(userDMed, true);
    assert.ok(createdCase);
    assert.equal(createdCase.actionType, 'WARN');
    assert.match(createdCase.reason, /Auto-Mod/);
  });

  await t.test('handleGuildMemberAdd detects join burst and dispatches staff raid alert with lockdown prompt', async () => {
    const service = new AutoModService();
    let alertSent = null;

    mockDb.addHandler('SELECT * FROM automod_configs', () => ({
      rows: [{
        guild_id: guildId,
        enabled: true,
        raid_shield_enabled: true,
        raid_join_threshold: 3,
        raid_join_seconds: 10,
        raid_min_account_age_hours: 24,
        raid_alert_channel_id: 'channel-mod-log'
      }],
      rowCount: 1
    }));

    const mockAlertChannel = {
      id: 'channel-mod-log',
      type: 0,
      isTextBased: () => true,
      send: async (payload) => { alertSent = payload; }
    };

    const mockGuild = {
      id: guildId,
      name: 'Test Server',
      channels: {
        cache: new Map([['channel-mod-log', mockAlertChannel]]),
        fetch: async () => mockAlertChannel
      }
    };

    const makeMember = (id) => ({
      id,
      guild: mockGuild,
      displayName: `User${id}`,
      user: {
        id,
        tag: `User${id}#0000`,
        createdTimestamp: Date.now() - 3600000 // 1 hour old (flagged new)
      }
    });

    // 1. Join 1 -> no alert
    await service.handleGuildMemberAdd(makeMember('user-1'));
    assert.equal(alertSent, null);

    // 2. Join 2 -> no alert
    await service.handleGuildMemberAdd(makeMember('user-2'));
    assert.equal(alertSent, null);

    // 3. Join 3 (threshold = 3) -> Triggers staff emergency alert!
    await service.handleGuildMemberAdd(makeMember('user-3'));
    assert.ok(alertSent);
    assert.equal(alertSent.embeds.length, 1);
    assert.match(alertSent.embeds[0].data.title, /Anti-Raid/);
    assert.match(alertSent.embeds[0].data.description, /bot does NOT start lockdowns automatically/i);
    assert.equal(alertSent.components.length, 1);
  });

  await t.test('buildBlacklistAddModal returns complete modal payload', () => {
    const modal = buildBlacklistAddModal();
    assert.equal(modal.data.title, 'Add Word / Regex to Blacklist');
    assert.equal(modal.components.length, 3);
  });

  await t.test('applyPreset configures Balanced, Strict, and Lightweight baselines', async () => {
    const service = new AutoModService();
    let savedRow = null;

    mockDb.addHandler('SELECT * FROM automod_configs', () => ({ rows: savedRow ? [savedRow] : [], rowCount: savedRow ? 1 : 0 }));
    mockDb.addHandler('INSERT INTO automod_configs', (sql, params) => {
      savedRow = {
        guild_id: params[0],
        enabled: params[1],
        anti_invites_enabled: params[2],
        anti_links_enabled: params[5],
        anti_spam_enabled: params[8],
        anti_spam_max_messages: params[10],
        anti_caps_enabled: params[20],
        raid_shield_enabled: params[39],
        raid_join_threshold: params[40]
      };
      return { rows: [savedRow], rowCount: 1 };
    });

    // 1. Balanced
    const balancedResult = await service.applyPreset(guildId, 'BALANCED');
    assert.equal(balancedResult.ok, true);
    assert.match(balancedResult.preset, /Balanced/i);
    assert.equal(balancedResult.config.anti_invites_enabled, true);
    assert.equal(balancedResult.config.anti_links_enabled, false);

    // 2. Strict
    const strictResult = await service.applyPreset(guildId, 'STRICT');
    assert.equal(strictResult.ok, true);
    assert.match(strictResult.preset, /Strict/i);
    assert.equal(strictResult.config.anti_links_enabled, true);
    assert.equal(strictResult.config.anti_caps_enabled, true);

    // 3. Lightweight
    const lightResult = await service.applyPreset(guildId, 'LIGHTWEIGHT');
    assert.equal(lightResult.ok, true);
    assert.match(lightResult.preset, /Anti-Spam/i);
    assert.equal(lightResult.config.anti_invites_enabled, false);
  });

  await t.test('buildAutoModWizard returns preset buttons and setup instructions', async () => {
    mockDb.addHandler('SELECT * FROM automod_configs', () => ({ rows: [], rowCount: 0 }));
    const wizard = await buildAutoModWizard(guildId);
    assert.equal(wizard.embeds.length, 1);
    assert.match(wizard.embeds[0].data.title, /Setup Wizard/i);
    assert.equal(wizard.components.length, 2);
    // Preset row has 3 buttons
    assert.equal(wizard.components[0].components.length, 3);
  });

  await t.test('buildAutoModManagerPanel renders all tabs, select menus, and rule cards', async () => {
    mockDb.addHandler('SELECT * FROM automod_configs', () => ({ rows: [], rowCount: 0 }));
    mockDb.addHandler('SELECT * FROM automod_blacklists', () => ({ rows: [], rowCount: 0 }));

    // 1. Filters tab (default)
    const filtersPanel = await buildAutoModManagerPanel(guildId, 'FILTERS');
    assert.equal(filtersPanel.embeds.length, 1);
    assert.equal(filtersPanel.components.length, 3); // Nav + Rule Select + Quick Toggles

    // 2. Filters tab with selected rule (e.g. anti_spam)
    const rulePanel = await buildAutoModManagerPanel(guildId, 'FILTERS', 'anti_spam');
    assert.equal(rulePanel.embeds.length, 2); // Master summary + Rule Settings card
    assert.ok(rulePanel.components.length >= 3);

    // 3. Blacklist tab
    const blacklistPanel = await buildAutoModManagerPanel(guildId, 'BLACKLIST');
    assert.match(blacklistPanel.embeds[0].data.title, /Blacklist Manager/i);

    // 4. Whitelist tab with Role and Channel Select Menus
    const whitelistPanel = await buildAutoModManagerPanel(guildId, 'WHITELIST');
    assert.match(whitelistPanel.embeds[0].data.title, /Exemptions & Whitelists/i);
    assert.equal(whitelistPanel.components.length, 4); // Nav + RoleSelect + ChannelSelect + Domain button

    // 5. Raid tab with Channel, Sensitivity, and Age Select Menus
    const raidPanel = await buildAutoModManagerPanel(guildId, 'RAID');
    assert.match(raidPanel.embeds[0].data.title, /Anti-Raid/i);
    assert.equal(raidPanel.components.length, 5); // Nav + ChannelSelect + SensitivitySelect + AgeSelect + Toggle
  });

  await t.test('buildThresholdTuneModal and buildDomainWhitelistModal construct valid modals', () => {
    const spamModal = buildThresholdTuneModal('anti_spam', { anti_spam_max_messages: 5, anti_spam_seconds: 4 });
    assert.match(spamModal.data.title, /anti_spam/i);
    assert.equal(spamModal.components.length, 3);

    const domainModal = buildDomainWhitelistModal();
    assert.equal(domainModal.data.title, 'Add Whitelisted Domain');
    assert.equal(domainModal.components.length, 1);
  });

  await t.test('/automod command and all application payloads pass validation', () => {
    assert.equal(automodCmd.data.name, 'automod');
    assert.equal(automodCmd.moduleKey, ModuleKeys.AUTOMOD);

    const makeInteraction = (subcommand) => ({
      options: { getSubcommand: () => subcommand }
    });

    assert.equal(automodCmd.getActionKey(makeInteraction('status')), ActionKeys.AutoModView);
    assert.equal(automodCmd.getActionKey(makeInteraction('setup')), ActionKeys.AutoModManage);
    assert.equal(automodCmd.getActionKey(makeInteraction('manager')), ActionKeys.AutoModManage);
    assert.equal(automodCmd.getActionKey(makeInteraction('rule')), ActionKeys.AutoModManage);
    assert.equal(automodCmd.getActionKey(makeInteraction('blacklist-add')), ActionKeys.AutoModBlacklist);
    assert.equal(automodCmd.getActionKey(makeInteraction('whitelist-add')), ActionKeys.AutoModWhitelist);
    assert.equal(automodCmd.getActionKey(makeInteraction('raid')), ActionKeys.AutoModRaid);
    assert.equal(automodCmd.getActionKey(makeInteraction('reset')), ActionKeys.AutoModReset);

    // Command registry export check
    assert.equal(commandMap.has('automod'), true);

    const payloads = commands.map((c) => c.data.toJSON());
    const errors = validateCommandPayloads(payloads);
    assert.deepEqual(errors, []);
  });
});
