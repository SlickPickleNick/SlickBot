const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');
const { MockDatabase } = require('../helpers/mockDb');
const { CustomIds } = require('../../src/modules/ui/customIds');
const { OnboardingService, ONBOARDING_STEPS } = require('../../src/modules/onboarding/onboardingService');
const { buildSetupPanel } = require('../../src/modules/ui/panels');
const setupCommand = require('../../src/commands/setup');

const mockDb = new MockDatabase();
mockDb.install();

// Universal database mocks for modules
mockDb.addHandler(async (text, params = []) => {
  const lower = text.toLowerCase();
  const guildId = params[0] || '123456789012345678';

  if (lower.includes('role_permission_levels')) {
    return { rows: [{ role_id: '100000000000000010', permission_level: 'ADMINISTRATOR' }], rowCount: 1 };
  }
  if (lower.includes('log_module_settings')) {
    return { rows: [{ channel_id: '100000000000000020', module_key: 'TICKETS', enabled: true }], rowCount: 1 };
  }
  if (lower.includes('welcome_configs')) {
    return { rows: [{ guild_id: guildId, channel_id: '100000000000000021', enabled: true }], rowCount: 1 };
  }
  if (lower.includes('welcome_auto_roles')) {
    return { rows: [{ guild_id: guildId, role_id: '100000000000000011' }], rowCount: 1 };
  }
  if (lower.includes('ticket_configs')) {
    return { rows: [{ guild_id: guildId, category_id: '100000000000000030', staff_role_id: '100000000000000012', transcripts_enabled: true }], rowCount: 1 };
  }
  if (lower.includes('ticket_types')) {
    return { rows: [{ id: '1', guild_id: guildId, name: 'General Support', enabled: true, sort_order: 1 }], rowCount: 1 };
  }
  if (lower.includes('giveaway_configs')) {
    return { rows: [{ guild_id: guildId, default_channel_id: '100000000000000022', panel_color: '#7869ff' }], rowCount: 1 };
  }
  if (lower.includes('birthday_configs')) {
    return { rows: [{ guild_id: guildId, channel_id: '100000000000000023', birthday_role_id: '100000000000000013', enabled: true }], rowCount: 1 };
  }
  if (lower.includes('suggestion_configs')) {
    return {
      rows: [{
        guild_id: guildId,
        channel_id: '100000000000000024',
        default_anonymous: true,
        auto_create_threads: true,
        panel_title: 'Server Suggestions',
        panel_description: 'Submit ideas below!',
        panel_active: true
      }],
      rowCount: 1
    };
  }
  if (lower.includes('suggestion_categories')) {
    return { rows: [{ id: 1, guild_id: guildId, name: 'General', active: true, sort_order: 1 }], rowCount: 1 };
  }
  if (lower.includes('bot_updates_configs') || lower.includes('bot_update_subscriptions')) {
    return { rows: [{ guild_id: guildId, channel_id: '100000000000000025', role_id: '100000000000000014', enabled: true }], rowCount: 1 };
  }
  if (lower.includes('social_feed_configs')) {
    return { rows: [{ guild_id: guildId, channel_id: '100000000000000026', default_ping_role_id: '100000000000000015', enabled: true }], rowCount: 1 };
  }
  if (lower.includes('join_create_configs') || lower.includes('join_create_hubs')) {
    return { rows: [{ id: '1', guild_id: guildId, hub_channel_id: '100000000000000027', category_id: '100000000000000031' }], rowCount: 1 };
  }
  if (lower.includes('report_configs')) {
    return { rows: [{ guild_id: guildId, review_channel_id: '100000000000000029', panel_title: 'Report Issues' }], rowCount: 1 };
  }
  if (lower.includes('application_types')) {
    return { rows: [{ id: '1', guild_id: guildId, name: 'Staff Application', channel_id: '100000000000000030', review_channel_id: '100000000000000031', enabled: true, questions: [] }], rowCount: 1 };
  }
  if (lower.includes('appeal_configs')) {
    return { rows: [{ guild_id: guildId, review_channel_id: '100000000000000032', dm_decision_enabled: true }], rowCount: 1 };
  }
  if (lower.includes('role_panels')) {
    return { rows: [{ id: '1', guild_id: guildId, name: 'notification-roles', channel_id: '100000000000000033', title: 'Roles', active: true, display_mode: 'BUTTONS' }], rowCount: 1 };
  }
  if (lower.includes('role_panel_options')) {
    return { rows: [{ id: '1', panel_id: '1', role_id: '100000000000000015', label: 'Announcements', emoji: '📢' }], rowCount: 1 };
  }
  if (lower.includes('leveling_configs')) {
    return { rows: [{ guild_id: guildId, channel_id: '100000000000000034', enabled: true, min_xp: 15, max_xp: 25 }], rowCount: 1 };
  }
  if (lower.includes('starboard_configs')) {
    return { rows: [{ guild_id: guildId, channel_id: '100000000000000035', star_threshold: 3, star_emoji: '⭐', enabled: true }], rowCount: 1 };
  }
  if (lower.includes('achievement_configs')) {
    return { rows: [{ guild_id: guildId, announcement_channel_id: '100000000000000036', enabled: true, dm_enabled: true }], rowCount: 1 };
  }
  if (lower.includes('server_stats_configs')) {
    return { rows: [{ guild_id: guildId, member_channel_id: '100000000000000037', enabled: true }], rowCount: 1 };
  }
  if (lower.includes('referral_configs')) {
    return { rows: [{ guild_id: guildId, referral_xp: 500, enabled: true }], rowCount: 1 };
  }
  if (lower.includes('faq_configs')) {
    return { rows: [{ guild_id: guildId, forum_channel_id: '100000000000000038' }], rowCount: 1 };
  }
  if (lower.includes('counting_game_configs')) {
    return { rows: [{ guild_id: guildId, channel_id: '100000000000000039' }], rowCount: 1 };
  }
  if (lower.includes('automod_configs')) {
    return { rows: [{ guild_id: guildId, spam_action: 'TIMEOUT', log_channel_id: '100000000000000040' }], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
});

test('One-Click Fresh Install System Suite', async (t) => {
  const onboarding = new OnboardingService();

  await t.test('buildGuildJoinGreetingPayload includes OneClickFreshInstall button and Guided Setup button', () => {
    const mockGuild = { name: 'Test Gaming Server', id: '123456789012345678' };
    const payload = onboarding.buildGuildJoinGreetingPayload(mockGuild);

    assert.ok(payload.embeds?.length > 0, 'Embed must be present in join greeting');
    assert.match(payload.embeds[0].data.title, /Welcome to SlickBot/i);
    assert.match(payload.embeds[0].data.description, /One-Click Fresh Install/i);
    assert.match(payload.embeds[0].data.description, /Guided Setup/i);

    assert.ok(payload.components?.length > 0, 'Action row must be present');
    const buttons = payload.components[0].components;
    assert.ok(buttons.length >= 3, 'Must have at least 3 action buttons');

    const freshInstallBtn = buttons.find((b) => b.data.custom_id === CustomIds.OneClickFreshInstall);
    assert.ok(freshInstallBtn, 'OneClickFreshInstall button must exist');
    assert.equal(freshInstallBtn.data.label, 'One-Click Fresh Install');

    const guidedSetupBtn = buttons.find((b) => b.data.custom_id === CustomIds.OnboardingStart);
    assert.ok(guidedSetupBtn, 'Guided Setup button must exist');

    const setupCenterBtn = buttons.find((b) => b.data.custom_id === CustomIds.SetupRefresh);
    assert.ok(setupCenterBtn, 'Setup Center button must exist');
  });

  await t.test('Security rule: Admin and Mod role applyDefault requires explicit user selection', async () => {
    const adminStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_admin_role');
    const modStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_mod_role');

    assert.ok(adminStep, 'server_admin_role step exists');
    assert.ok(modStep, 'server_mod_role step exists');

    const mockGuild = {
      id: '123456789012345678',
      roles: {
        cache: [
          { id: 'existing-admin-role', name: 'Admin' },
          { id: 'existing-mod-role', name: 'Moderator' }
        ]
      }
    };

    const adminDefaultRes = await adminStep.applyDefault(mockGuild);
    assert.match(adminDefaultRes.result, /requires explicit review|No role assigned/i, 'Admin role must not silently auto-map without user review');

    const modDefaultRes = await modStep.applyDefault(mockGuild);
    assert.match(modDefaultRes.result, /requires explicit review|No role assigned/i, 'Mod role must not silently auto-map without user review');
  });

  await t.test('executeOneClickFreshInstall executes all steps with error tolerance and returns structured summary', async () => {
    const createdRoles = new Map();
    const createdChannels = new Map();

    const mockGuild = {
      id: '123456789012345678',
      name: 'Fresh Install Guild',
      memberCount: 42,
      features: ['COMMUNITY'],
      roles: {
        everyone: { id: '123456789012345678' },
        cache: {
          get: (id) => createdRoles.get(id),
          find: (fn) => Array.from(createdRoles.values()).find(fn) || null,
          values: () => createdRoles.values(),
          [Symbol.iterator]: () => createdRoles.values()
        },
        create: async (data) => {
          const role = { id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: data.name, colors: data.colors };
          createdRoles.set(role.id, role);
          return role;
        }
      },
      channels: {
        cache: {
          get: (id) => createdChannels.get(id),
          find: (fn) => Array.from(createdChannels.values()).find(fn) || null,
          values: () => createdChannels.values(),
          [Symbol.iterator]: () => createdChannels.values()
        },
        create: async (data) => {
          const channel = {
            id: `chan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: data.name,
            type: data.type || ChannelType.GuildText,
            send: async () => ({ id: `msg-${Date.now()}`, pin: async () => {} }),
            permissionOverwrites: { set: async () => {} }
          };
          createdChannels.set(channel.id, channel);
          return channel;
        },
        fetch: async (id) => createdChannels.get(id) || null,
        setPositions: async () => {}
      },
      members: {
        me: { id: 'bot-id-123', user: { id: 'bot-id-123' } },
        cache: { get: () => ({ id: 'bot-id-123', user: { id: 'bot-id-123' } }) }
      },
      client: {
        user: { id: 'bot-id-123' }
      }
    };

    const results = await onboarding.executeOneClickFreshInstall(mockGuild);

    assert.equal(results.success, true);
    assert.equal(results.guildId, mockGuild.id);
    assert.ok(results.totalSteps > 0);
    assert.ok(results.completedSteps > 0);
    assert.ok(Array.isArray(results.createdItems));
    assert.ok(results.createdItems.length > 0);
    assert.equal(results.errors.length, 0, 'No errors during simulated fresh install');

    const successPayload = onboarding.buildOneClickInstallSuccessPayload(mockGuild, results);
    assert.ok(successPayload.embeds?.length > 0);
    assert.match(successPayload.embeds[0].data.title, /Fresh Install Complete/i);
    assert.match(successPayload.embeds[0].data.description, /Fresh Install Guild/i);
    assert.ok(successPayload.components?.length > 0);
  });

  await t.test('Setup Center panel includes OneClickFreshInstall button', async () => {
    const panel = await buildSetupPanel('123456789012345678', 'Test Server');
    assert.ok(panel.components?.length >= 2);

    const allButtons = panel.components.flatMap((c) => c.components);
    const freshBtn = allButtons.find((b) => b.data.custom_id === CustomIds.OneClickFreshInstall);
    assert.ok(freshBtn, 'OneClickFreshInstall button must be present in Setup Center home panel');
    assert.equal(freshBtn.data.label, 'One-Click Install');
  });

  await t.test('/setup command includes one_click_install boolean option', () => {
    const json = setupCommand.data.toJSON();
    const opt = json.options.find((o) => o.name === 'one_click_install');
    assert.ok(opt, 'one_click_install option must be registered on /setup command');
    assert.equal(opt.type, 5, 'Option type must be BOOLEAN (5)');
  });
});
