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
const { CustomIds } = require('../../src/modules/ui/customIds');
const { PermissionFlagsBits } = require('discord.js');

const mockDb = new MockDatabase();

test('Auto-Mod & Anti-Raid Engine Tests', async (t) => {
  t.beforeEach(() => {
    mockDb.install();
    new AutoModService().clearAllCaches();
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
        raid_join_threshold: params[45]
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
        anti_caps_enabled: params[22],
        raid_shield_enabled: params[44],
        raid_join_threshold: params[45]
      };
      return { rows: [{ ...DEFAULT_AUTOMOD_CONFIG, ...savedRow }], rowCount: 1 };
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
    assert.match(rulePanel.embeds[1].data.description, /Current Action:.*Delete/i);

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

    // 6. Test that updating action to WARN updates cache and renders 'Warn & Delete' immediately
    const service = new AutoModService();
    await service.upsertConfig(guildId, { anti_spam_action: 'WARN' });
    const updatedPanel = await buildAutoModManagerPanel(guildId, 'FILTERS', 'anti_spam');
    const rulesField = updatedPanel.embeds[0].data.fields.find((f) => f.name === 'Active Filter Rules');
    assert.match(rulesField.value, /Warn & Delete/i);
    assert.match(updatedPanel.embeds[1].data.description, /Current Action:.*Warn & Delete/i);
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

  await t.test('Setup Center navigation and Open Manager integration', async () => {
    const { buildModuleDetailPanel } = require('../../src/modules/ui/panels');
    const guildId = 'guild-setup-test';

    // 1. Detail panel reflects correct unconfigured/partial status when timeout role is missing
    mockDb.addHandler('SELECT module_key, enabled FROM module_configs', () => ({
      rows: [{ module_key: ModuleKeys.AUTOMOD, enabled: true }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT enabled, timeout_role_id, raid_alert_channel_id, alert_channel_id', () => ({
      rows: [{ enabled: true, timeout_role_id: null, raid_alert_channel_id: 'chan-1' }],
      rowCount: 1
    }));
    const detailPanel = await buildModuleDetailPanel(guildId, ModuleKeys.AUTOMOD);
    assert.ok(detailPanel.components.length > 0);
    assert.match(detailPanel.embeds[0].data.description, /Partially Configured.*Timeout role not configured/i);
    const detailButtons = detailPanel.components[0].components;
    assert.ok(detailButtons.some((b) => b.data.custom_id === `${CustomIds.SetupOpenManagerPrefix}${ModuleKeys.AUTOMOD}`));
    assert.ok(detailButtons.some((b) => b.data.custom_id === CustomIds.SetupRefresh));

    // 2. Wizard and Manager panels include Core Setup and Setup Center buttons
    const wizard = await buildAutoModWizard(guildId);
    const wizardButtons = wizard.components[1].components;
    assert.ok(wizardButtons.some((b) => b.data.custom_id === CustomIds.SetupCategoryCore));
    assert.ok(wizardButtons.some((b) => b.data.custom_id === CustomIds.SetupRefresh));

    const manager = await buildAutoModManagerPanel(guildId, 'FILTERS');
    const managerButtons = manager.components[2].components;
    assert.ok(managerButtons.some((b) => b.data.custom_id === CustomIds.SetupCategoryCore));
    assert.ok(managerButtons.some((b) => b.data.custom_id === CustomIds.SetupRefresh));
  });

  await t.test('Timeout Role: createTimeoutRole, sync permissions, and exempt appeals & ticket channels', async () => {
    const service = new AutoModService();
    service.clearAllCaches();
    mockDb.addHandler('SELECT * FROM automod_configs', () => ({ rows: [], rowCount: 0 }));
    mockDb.addHandler('SELECT review_channel_id FROM appeal_configs', () => ({ rows: [{ review_channel_id: 'chan-appeals' }] }));
    mockDb.addHandler('INSERT INTO automod_configs', (sql, params) => ({ rows: [{ guild_id: params[0], timeout_role_id: params[44] }] }));

    const editedOverwrites = [];
    const mockGeneralChan = {
      id: 'chan-general',
      name: 'general',
      type: 0, // GuildText
      permissionOverwrites: {
        edit: async (roleId, perms, opts) => {
          editedOverwrites.push({ channelId: 'chan-general', roleId, perms, opts });
        }
      }
    };
    const mockAppealsChan = {
      id: 'chan-appeals',
      name: 'appeals',
      type: 0,
      permissionOverwrites: {
        edit: async (roleId, perms, opts) => {
          editedOverwrites.push({ channelId: 'chan-appeals', roleId, perms, opts });
        }
      }
    };
    const mockTicketChan = {
      id: 'chan-ticket',
      name: 'ticket-0001',
      type: 0,
      topic: 'SlickBot ticket #1 opened by user',
      permissionOverwrites: {
        edit: async (roleId, perms, opts) => {
          editedOverwrites.push({ channelId: 'chan-ticket', roleId, perms, opts });
        }
      }
    };

    const channelsMap = new Map([
      ['chan-general', mockGeneralChan],
      ['chan-appeals', mockAppealsChan],
      ['chan-ticket', mockTicketChan]
    ]);

    const createdRoles = [];
    const mockGuild = {
      id: guildId,
      roles: {
        cache: new Map(),
        create: async (roleData) => {
          const role = { id: 'role-timeout-123', name: roleData.name, ...roleData };
          createdRoles.push(role);
          return role;
        }
      },
      channels: {
        cache: channelsMap,
        fetch: async () => channelsMap
      }
    };

    // 1. Create timeout role & sync
    const res = await service.createTimeoutRole(mockGuild);
    assert.equal(res.ok, true);
    assert.equal(res.role.id, 'role-timeout-123');
    assert.equal(res.syncResult.ok, true);
    assert.equal(res.syncResult.syncedChannelsCount, 2); // general and appeals
    assert.equal(res.syncResult.exemptCount, 1); // appeals

    // Verify general channel was hidden (ViewChannel: false)
    const genEdit = editedOverwrites.find((e) => e.channelId === 'chan-general');
    assert.ok(genEdit);
    assert.equal(genEdit.perms.ViewChannel, false);
    assert.equal(genEdit.perms.SendMessages, false);

    // Verify appeals channel allows View & Read but denies SendMessages
    const appEdit = editedOverwrites.find((e) => e.channelId === 'chan-appeals');
    assert.ok(appEdit);
    assert.equal(appEdit.perms.ViewChannel, true);
    assert.equal(appEdit.perms.ReadMessageHistory, true);
    assert.equal(appEdit.perms.SendMessages, false);

    // Verify ticket channel was skipped entirely
    const ticketEdit = editedOverwrites.find((e) => e.channelId === 'chan-ticket');
    assert.equal(ticketEdit, undefined);
  });

  await t.test('Timeout Role: handleChannelCreate auto-locks newly created channels unless ticket/appeals', async () => {
    const service = new AutoModService();
    service.clearAllCaches();
    mockDb.addHandler('SELECT * FROM automod_configs', () => ({
      rows: [{ guild_id: guildId, timeout_role_id: 'role-timeout-123', timeout_role_lock_new_channels: true, timeout_role_mode: 'HIDE' }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT review_channel_id FROM appeal_configs', () => ({ rows: [{ review_channel_id: 'chan-appeals' }] }));

    const editedOverwrites = [];
    const newChan = {
      id: 'chan-new-announcements',
      name: 'announcements',
      guild: { id: guildId },
      permissionOverwrites: {
        edit: async (roleId, perms, opts) => {
          editedOverwrites.push({ channelId: 'chan-new-announcements', roleId, perms, opts });
        }
      }
    };

    await service.handleChannelCreate(newChan);
    assert.equal(editedOverwrites.length, 1);
    assert.equal(editedOverwrites[0].roleId, 'role-timeout-123');
    assert.equal(editedOverwrites[0].perms.ViewChannel, false);

    // Test that ticket channel creation is ignored
    const newTicketChan = {
      id: 'chan-ticket-99',
      name: 'ticket-9999',
      guild: { id: guildId },
      permissionOverwrites: {
        edit: async (roleId, perms, opts) => {
          editedOverwrites.push({ channelId: 'chan-ticket-99', roleId, perms, opts });
        }
      }
    };
    await service.handleChannelCreate(newTicketChan);
    assert.equal(editedOverwrites.some((e) => e.channelId === 'chan-ticket-99'), false);
  });

  await t.test('Timeout Role: applyTimeout and removeTimeout apply Discord timeout and temporary role', async () => {
    const service = new AutoModService();
    service.clearAllCaches();
    mockDb.addHandler('SELECT * FROM automod_configs', () => ({
      rows: [{ guild_id: guildId, timeout_role_id: 'role-timeout-123' }],
      rowCount: 1
    }));
    mockDb.addHandler('INSERT INTO temporary_role_assignments', (sql, params) => ({
      rows: [{ id: 'temp-assign-1', guild_id: params[0], user_id: params[1], role_id: params[3] }]
    }));
    mockDb.addHandler('SELECT * FROM temporary_role_assignments', () => ({
      rows: [{ id: 'temp-assign-1', guild_id: guildId, user_id: 'user-violator', role_id: 'role-timeout-123', active: true }]
    }));
    mockDb.addHandler('UPDATE temporary_role_assignments', () => ({ rowCount: 1 }));

    let timedOutMs = null;
    let rolesAdded = [];
    let rolesRemoved = [];

    const mockMember = {
      id: 'user-violator',
      user: { id: 'user-violator', tag: 'BadActor#0001', bot: false },
      moderatable: true,
      isCommunicationDisabled: () => timedOutMs !== null,
      timeout: async (ms) => {
        timedOutMs = ms;
      },
      roles: {
        add: async (roleId) => {
          rolesAdded.push(roleId);
        },
        remove: async (roleId) => {
          rolesRemoved.push(roleId);
        }
      },
      guild: {
        id: guildId,
        roles: {
          cache: new Map([
            ['role-timeout-123', { id: 'role-timeout-123', name: 'Timeout', managed: false }]
          ])
        },
        members: {
          fetch: async () => mockMember
        }
      }
    };

    // 1. Apply timeout for 300s
    const applyRes = await service.applyTimeout(mockMember, 300, 'Test violation', { id: 'mod-1', tag: 'Mod#0001' });
    assert.equal(applyRes.nativeTimeout, true);
    assert.equal(applyRes.roleApplied, true);
    assert.equal(timedOutMs, 300 * 1000);
    assert.deepEqual(rolesAdded, ['role-timeout-123']);

    // 2. Remove timeout
    const removeRes = await service.removeTimeout(mockMember, 'Untimeout by staff', { id: 'mod-1', tag: 'Mod#0001' });
    assert.equal(removeRes.nativeUntimeout, true);
    assert.equal(removeRes.roleRemoved, true);
    assert.equal(timedOutMs, null);
    assert.deepEqual(rolesRemoved, ['role-timeout-123']);
  });

  await t.test('buildAutoModManagerPanel renders TIMEOUT tab correctly', async () => {
    mockDb.addHandler('SELECT * FROM automod_configs', () => ({
      rows: [{ guild_id: guildId, timeout_role_id: 'role-timeout-123', timeout_role_mode: 'HIDE', timeout_role_lock_new_channels: true }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT * FROM automod_blacklists', () => ({ rows: [], rowCount: 0 }));

    const panel = await buildAutoModManagerPanel(guildId, 'TIMEOUT');
    assert.equal(panel.embeds.length, 1);
    assert.match(panel.embeds[0].data.title, /Timeout Role/i);
    assert.match(panel.embeds[0].data.fields[0].value, /<@&role-timeout-123>/i);
    assert.match(panel.embeds[0].data.fields[1].value, /Hide Channels/i);
    assert.equal(panel.components.length, 4); // Nav + RoleSelect + ExemptSelect + ActionButtons
    const buttons = panel.components[3].components;
    assert.ok(buttons.some((b) => b.data.custom_id === CustomIds.AutoModTimeoutRoleCreate));
    assert.ok(buttons.some((b) => b.data.custom_id === CustomIds.AutoModTimeoutRoleSync));
    assert.ok(buttons.some((b) => b.data.custom_id === CustomIds.AutoModTimeoutRoleModeToggle));
    assert.ok(buttons.some((b) => b.data.custom_id === CustomIds.AutoModTimeoutRoleLockToggle));
    assert.ok(buttons.some((b) => b.data.custom_id === CustomIds.AutoModTimeoutRoleClear));
  });

  await t.test('Per-rule timeout duration tuning and Timeout & Delete action', async () => {
    const service = new AutoModService();
    const cfg = await service.upsertConfig(guildId, {
      anti_invites_enabled: true,
      anti_invites_timeout_seconds: 3600,
      anti_invites_action: 'TIMEOUT',
      anti_links_enabled: true,
      anti_links_timeout_seconds: 1800,
      anti_links_action: 'TIMEOUT'
    });

    // 1. Check checkAntiInvites returns 3600s timeout
    const inviteViolation = service.checkAntiInvites('Join discord.gg/illegalcode', cfg);
    assert.equal(inviteViolation.action, 'TIMEOUT');
    assert.equal(inviteViolation.timeoutSeconds, 3600);

    // 2. Check checkAntiLinks returns 1800s timeout
    const linkViolation = service.checkAntiLinks('Check out https://scam-site.org', cfg);
    assert.equal(linkViolation.action, 'TIMEOUT');
    assert.equal(linkViolation.timeoutSeconds, 1800);

    // 3. Check buildRuleEditComponents displays Timeout & Delete and duration
    const rulePanel = buildRuleEditComponents(cfg, 'anti_invites');
    assert.match(rulePanel.embed.data.description, /Current Action:.*Timeout & Delete/i);
    assert.match(rulePanel.embed.data.description, /Rule Timeout Duration:.*1h/i);
    const actionButtons = rulePanel.components[1].components;
    assert.ok(actionButtons.some((b) => b.data.label === 'Timeout & Delete'));

    // 4. Check buildThresholdTuneModal includes timeout_duration input
    const modal = buildThresholdTuneModal('anti_invites', cfg);
    assert.equal(modal.components.length, 1);
    assert.equal(modal.components[0].components[0].data.custom_id, 'timeout_duration');
  });

  await t.test('/mod timeout command supports flexible duration strings and options', async () => {
    const modCmd = require('../../src/commands/mod');
    assert.equal(modCmd.data.name, 'mod');
    new AutoModService().clearAllCaches();

    let replyPayload = null;
    let timedOutMemberMs = null;
    let addedRole = null;

    mockDb.addHandler('SELECT * FROM automod_configs', () => ({
      rows: [{ guild_id: guildId, timeout_role_id: 'role-timeout-123' }],
      rowCount: 1
    }));
    mockDb.addHandler('INSERT INTO moderation_cases', () => ({
      rows: [{ id: 'case-1', case_number: 42, action_type: 'TIMEOUT', target_user_id: 'user-violator' }]
    }));
    mockDb.addHandler('INSERT INTO temporary_role_assignments', () => ({
      rows: [{ id: 'temp-1' }]
    }));

    const mockTarget = { id: 'user-violator', tag: 'Violator#1234' };
    const mockMember = {
      id: 'user-violator',
      user: mockTarget,
      moderatable: true,
      timeout: async (ms) => { timedOutMemberMs = ms; },
      roles: {
        add: async (r) => { addedRole = r; }
      },
      guild: {
        id: guildId,
        roles: {
          cache: new Map([['role-timeout-123', { id: 'role-timeout-123', name: 'Timeout', managed: false }]])
        },
        members: {
          fetch: async () => mockMember
        }
      }
    };

    const mockInteraction = {
      guildId,
      user: { id: 'mod-1', tag: 'Mod#0001' },
      guild: {
        id: guildId,
        members: {
          fetch: async () => mockMember
        },
        roles: {
          cache: new Map([['role-timeout-123', { id: 'role-timeout-123', name: 'Timeout', managed: false }]])
        }
      },
      options: {
        getSubcommand: () => 'timeout',
        getUser: () => mockTarget,
        getString: (name) => (name === 'duration' ? '2h' : name === 'reason' ? 'Disruptive behavior' : null),
        getInteger: (name) => null
      },
      reply: async (payload) => { replyPayload = payload; }
    };

    const ctx = {
      db: mockDb,
      logger: { log: async () => {}, writeAudit: async () => {} },
      permissions: {
        ensureGuildConfig: async () => ({})
      },
      moderation: {
        ensureGuildConfig: async () => ({}),
        createCase: async () => ({ id: 'case-1', case_number: 42, action_type: 'TIMEOUT', target_user_id: 'user-violator' })
      }
    };

    await modCmd.execute(mockInteraction, ctx);

    assert.equal(timedOutMemberMs, 2 * 3600 * 1000);
    assert.equal(addedRole, 'role-timeout-123');
    assert.ok(replyPayload);
    assert.match(replyPayload.embeds[0].data.title, /Timeout Applied/i);
    const dualField = replyPayload.embeds[0].data.fields.find((f) => f.name === 'Dual-Layer Enforcement');
    assert.match(dualField.value, /Discord Timeout:.*✅ Applied/i);
    assert.match(dualField.value, /Timeout Role:.*✅ Assigned.*role-timeout-123/i);
  });
});

