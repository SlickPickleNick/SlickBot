const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { MockDatabase } = require('../helpers/mockDb');
const { ONBOARDING_STEPS, STANDARD_CATEGORIES, ensureCategory, reorderServerCategories, autoCreateChannel, autoCreateRole } = require('../../src/modules/onboarding/onboardingService');

const mockDb = new MockDatabase();
mockDb.install();

function createUniversalMockGuild() {
  let snowflakeCounter = 100000000000000000n;
  const nextId = () => (snowflakeCounter++).toString();

  const channelsMap = new Map();
  const rolesMap = new Map();
  const everyoneRole = { id: '100000000000000001', name: '@everyone' };
  rolesMap.set(everyoneRole.id, everyoneRole);

  const guild = {
    id: '100000000000000000',
    name: 'Full Coverage Test Server',
    roles: {
      everyone: everyoneRole,
      cache: {
        get: (id) => rolesMap.get(id),
        find: (fn) => Array.from(rolesMap.values()).find(fn),
        values: () => rolesMap.values(),
        [Symbol.iterator]: () => rolesMap.values()
      },
      create: async (data) => {
        const id = nextId();
        const role = {
          id,
          name: data.name,
          colors: data.colors,
          permissions: data.permissions,
          mentionable: data.mentionable,
          guildId: guild.id
        };
        rolesMap.set(id, role);
        return role;
      }
    },
    channels: {
      cache: {
        get: (id) => channelsMap.get(id),
        find: (fn) => Array.from(channelsMap.values()).find(fn),
        values: () => channelsMap.values(),
        [Symbol.iterator]: () => channelsMap.values()
      },
      create: async (data) => {
        const id = nextId();
        const channel = {
          id,
          name: data.name,
          type: data.type || ChannelType.GuildText,
          parentId: data.parent || null,
          position: data.position || 0,
          topic: data.topic || null,
          permissionOverwrites: data.permissionOverwrites || [],
          send: async (payload) => ({ id: nextId(), channelId: id, pin: async () => {}, ...payload }),
          setPosition: async (pos) => { channel.position = pos; return channel; },
          edit: async (patch) => { Object.assign(channel, patch); return channel; }
        };
        channelsMap.set(id, channel);
        return channel;
      },
      setPositions: async (updates) => {
        for (const u of updates) {
          const c = channelsMap.get(u.channel);
          if (c) c.position = u.position;
        }
        return true;
      },
      fetch: async (id) => channelsMap.get(id) || null
    },
    members: {
      me: { id: '100000000000000099', user: { id: '100000000000000099' } },
      cache: new Map(),
      fetch: async (id) => ({
        id,
        user: { id, tag: 'TestUser#0001', username: 'TestUser' },
        roles: {
          add: async () => {},
          remove: async () => {}
        }
      })
    },
    client: {
      user: { id: '100000000000000099' },
      guilds: {
        fetch: async () => guild
      }
    }
  };

  return { guild, channelsMap, rolesMap };
}

// Setup universal DB mock handlers to return realistic rows for any SELECT/INSERT/UPDATE
mockDb.addHandler(async (text, params = []) => {
  const lower = text.toLowerCase();
  const guildId = params[0] || '100000000000000000';

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
    if (lower.includes('bot_update_subscriptions')) {
      return { rows: [{ guild_id: guildId, channel_id: '100000000000000025', role_id: '100000000000000014', active: true }], rowCount: 1 };
    }
    if (lower.includes('social_feed_configs')) {
      return { rows: [{ guild_id: guildId, channel_id: '100000000000000026', platform: 'TWITCH', enabled: true }], rowCount: 1 };
    }
    if (lower.includes('join_create_configs') || lower.includes('join_create_hubs')) {
      return { rows: [{ id: '1', guild_id: guildId, hub_channel_id: '100000000000000027', category_id: '100000000000000031' }], rowCount: 1 };
    }
    if (lower.includes('mod_log_configs')) {
      return { rows: [{ guild_id: guildId, channel_id: '100000000000000028' }], rowCount: 1 };
    }
    if (lower.includes('lockdown_presets')) {
      return { rows: [{ guild_id: guildId, preset_name: 'full', channels: [] }], rowCount: 1 };
    }
    if (lower.includes('utility_configs')) {
      return { rows: [{ guild_id: guildId, snipe_enabled: true, afk_enabled: true, reminders_enabled: true }], rowCount: 1 };
    }
    if (lower.includes('report_configs')) {
      return { rows: [{ guild_id: guildId, review_channel_id: '100000000000000029', panel_title: 'Report Issues' }], rowCount: 1 };
    }
    if (lower.includes('application_types')) {
      return { rows: [{ id: '1', guild_id: guildId, name: 'Staff Application', channel_id: '100000000000000030', review_channel_id: '100000000000000031', enabled: true, questions: [] }], rowCount: 1 };
    }
    if (lower.includes('appeal_configs')) {
      return { rows: [{ guild_id: guildId, review_channel_id: '100000000000000032', dm_decision_enabled: true, dm_include_submission: false }], rowCount: 1 };
    }
    if (lower.includes('role_panels')) {
      return { rows: [{ id: '1', guild_id: guildId, name: 'notification-roles', channel_id: '100000000000000033', title: 'Roles', active: true }], rowCount: 1 };
    }
    if (lower.includes('role_panel_options')) {
      return { rows: [{ id: '1', panel_id: '1', role_id: '100000000000000015', label: 'Announcements', emoji: '📢' }], rowCount: 1 };
    }
    if (lower.includes('leveling_configs')) {
      return { rows: [{ guild_id: guildId, channel_id: '100000000000000034', enabled: true, min_xp: 15, max_xp: 25 }], rowCount: 1 };
    }
    if (lower.includes('game_configs') || lower.includes('counting_configs')) {
      return { rows: [{ guild_id: guildId, channel_id: '100000000000000035', current_number: 1, highest_number: 1 }], rowCount: 1 };
    }
    if (lower.includes('faq_configs') || lower.includes('faq_entries')) {
      return { rows: [{ id: '1', guild_id: guildId, channel_id: '100000000000000036', question: 'How do I get help?', answer: 'Use tickets!' }], rowCount: 1 };
    }
    if (lower.includes('referral_configs')) {
      return { rows: [{ guild_id: guildId, channel_id: '100000000000000037', enabled: true, referral_xp: 100 }], rowCount: 1 };
    }
    if (lower.includes('achievement_configs') || lower.includes('achievement_tiers')) {
      return { rows: [{ id: '1', guild_id: guildId, name: 'First Message', xp_reward: 50 }], rowCount: 1 };
    }
    if (lower.includes('server_stats_configs')) {
      return { rows: [{ guild_id: guildId, member_count_channel_id: '100000000000000038', voice_count_channel_id: '100000000000000039' }], rowCount: 1 };
    }
    if (lower.includes('custom_commands')) {
      return { rows: [{ id: '1', guild_id: guildId, name: 'help', response_text: 'Help is on the way!' }], rowCount: 1 };
    }
    if (lower.includes('scheduled_message_configs') || lower.includes('scheduled_messages')) {
      return { rows: [{ id: '1', guild_id: guildId, channel_id: '100000000000000040', message_content: 'Daily reminder!' }], rowCount: 1 };
    }
    if (lower.includes('automod_configs')) {
      return { rows: [{ guild_id: guildId, anti_spam_enabled: true, anti_invite_enabled: true, log_channel_id: '100000000000000041' }], rowCount: 1 };
    }
    if (lower.includes('starboard_configs')) {
      return { rows: [{ guild_id: guildId, channel_id: '100000000000000042', star_threshold: 3, star_emoji: '⭐', enabled: true }], rowCount: 1 };
    }

    return { rows: [{ id: '1', guild_id: guildId, count: 1 }], rowCount: 1 };
});

test('ALL SERVER_ONBOARDING steps have complete metadata and valid lifecycle functions', async () => {
  const steps = ONBOARDING_STEPS.SERVER_ONBOARDING;
  assert.ok(Array.isArray(steps), 'SERVER_ONBOARDING is an array');
  assert.equal(steps.length, 24, 'SERVER_ONBOARDING has exactly 24 steps');

  for (const step of steps) {
    assert.ok(step.id, `Step has id: ${step.id}`);
    assert.ok(step.moduleKey, `Step ${step.id} has moduleKey`);
    assert.ok(step.title, `Step ${step.id} has title`);
    assert.ok(step.description, `Step ${step.id} has description`);
    assert.ok(step.pickerType, `Step ${step.id} has pickerType`);
    assert.ok(step.autoCreateLabel, `Step ${step.id} has autoCreateLabel`);
    assert.ok(step.autoCreateDescription, `Step ${step.id} has autoCreateDescription`);
    assert.equal(typeof step.getCurrent, 'function', `Step ${step.id} has getCurrent function`);
    assert.equal(typeof step.applyDefault, 'function', `Step ${step.id} has applyDefault function`);
    assert.equal(typeof step.applySelection, 'function', `Step ${step.id} has applySelection function`);
    assert.equal(typeof step.autoCreate, 'function', `Step ${step.id} has autoCreate function`);

    // Test getCurrent
    const { guild: mockGuild } = createUniversalMockGuild();
    const current = await step.getCurrent(mockGuild);
    assert.ok(current === null || typeof current === 'string', `Step ${step.id} getCurrent returned string or null`);

    // Test applyDefault
    const defaultRes = await step.applyDefault(mockGuild);
    assert.ok(defaultRes === undefined || typeof defaultRes === 'object', `Step ${step.id} applyDefault succeeded`);

    // Test applySelection
    const selectionRes = await step.applySelection(mockGuild, '100000000000000099');
    assert.ok(selectionRes === undefined || typeof selectionRes === 'object', `Step ${step.id} applySelection succeeded`);

    // Test autoCreate
    const autoRes = await step.autoCreate(mockGuild);
    assert.ok(autoRes, `Step ${step.id} autoCreate returned result`);
    assert.ok(autoRes.created, `Step ${step.id} autoCreate result contains .created string: ${autoRes.created}`);
  }
});

test('ALL individual module steps in ONBOARDING_STEPS have complete metadata and valid lifecycle functions', async () => {
  const moduleKeys = Object.keys(ONBOARDING_STEPS).filter((k) => k !== 'SERVER_ONBOARDING');
  assert.ok(moduleKeys.length >= 20, `Contains at least 20 module step definitions: found ${moduleKeys.length}`);

  for (const moduleKey of moduleKeys) {
    const steps = ONBOARDING_STEPS[moduleKey];
    assert.ok(Array.isArray(steps), `ONBOARDING_STEPS[${moduleKey}] is an array`);
    assert.ok(steps.length > 0, `ONBOARDING_STEPS[${moduleKey}] has at least 1 step`);

    for (const step of steps) {
      assert.ok(step.id, `Module ${moduleKey} step has id: ${step.id}`);
      assert.ok(step.moduleKey, `Module ${moduleKey} step ${step.id} has moduleKey`);
      assert.ok(step.title, `Module ${moduleKey} step ${step.id} has title`);
      assert.ok(step.description, `Module ${moduleKey} step ${step.id} has description`);
      assert.ok(step.pickerType, `Module ${moduleKey} step ${step.id} has pickerType`);
      assert.ok(step.autoCreateLabel, `Module ${moduleKey} step ${step.id} has autoCreateLabel`);
      assert.ok(step.autoCreateDescription, `Module ${moduleKey} step ${step.id} has autoCreateDescription`);
      assert.equal(typeof step.getCurrent, 'function', `Module ${moduleKey} step ${step.id} has getCurrent function`);
      assert.equal(typeof step.applyDefault, 'function', `Module ${moduleKey} step ${step.id} has applyDefault function`);
      assert.equal(typeof step.applySelection, 'function', `Module ${moduleKey} step ${step.id} has applySelection function`);
      assert.equal(typeof step.autoCreate, 'function', `Module ${moduleKey} step ${step.id} has autoCreate function`);

      const { guild: mockGuild } = createUniversalMockGuild();

      // Test getCurrent
      const current = await step.getCurrent(mockGuild);
      assert.ok(current === null || typeof current === 'string', `Module ${moduleKey} step ${step.id} getCurrent returned string or null`);

      // Test applyDefault
      const defaultRes = await step.applyDefault(mockGuild);
      assert.ok(defaultRes === undefined || typeof defaultRes === 'object', `Module ${moduleKey} step ${step.id} applyDefault succeeded`);

      // Test applySelection
      const selectionRes = await step.applySelection(mockGuild, '100000000000000099');
      assert.ok(selectionRes === undefined || typeof selectionRes === 'object', `Module ${moduleKey} step ${step.id} applySelection succeeded`);

      // Test autoCreate
      const autoRes = await step.autoCreate(mockGuild);
      assert.ok(autoRes, `Module ${moduleKey} step ${step.id} autoCreate returned result`);
      assert.ok(autoRes.created, `Module ${moduleKey} step ${step.id} autoCreate result contains .created string: ${autoRes.created}`);
    }
  }
});

test('OnboardingService session lifecycle and payload rendering', async () => {
  const { OnboardingService } = require('../../src/modules/onboarding/onboardingService');
  const onboarding = new OnboardingService();
  const { guild: mockGuild } = createUniversalMockGuild();

  // 1. Start Server Onboarding Session
  const session = onboarding.startServerOnboardingSession(mockGuild.id, 'user-12345');
  assert.ok(session, 'Session started');
  assert.equal(session.guildId, mockGuild.id);
  assert.equal(session.userId, 'user-12345');
  assert.equal(session.type, 'SERVER_ONBOARDING');
  assert.equal(session.stepIndex, 0);

  // 2. Render initial step payload
  const initialPayload = onboarding.buildOnboardingPayload(session, null);
  assert.ok(initialPayload.embeds?.length > 0, 'Embed generated');
  assert.ok(initialPayload.components?.length > 0, 'Components generated');

  // 3. Advance with AUTO_CREATE
  const adv1 = await onboarding.advanceSession(session, mockGuild, 'AUTO_CREATE', { created: '@Admin role' });
  assert.equal(adv1.done, false);
  assert.equal(session.stepIndex, 1);
  assert.equal(session.completedSteps.length, 1);

  // 4. Advance with SELECT
  const adv2 = await onboarding.advanceSession(session, mockGuild, 'SELECT', { selected: '<#chan-123>' });
  assert.equal(adv2.done, false);
  assert.equal(session.stepIndex, 2);

  // 5. Advance with KEEP_CURRENT
  const adv3 = await onboarding.advanceSession(session, mockGuild, 'KEEP_CURRENT');
  assert.equal(adv3.done, false);
  assert.equal(session.stepIndex, 3);

  // 6. Advance with KEEP_DEFAULT
  const adv4 = await onboarding.advanceSession(session, mockGuild, 'KEEP_DEFAULT');
  assert.equal(adv4.done, false);
  assert.equal(session.stepIndex, 4);

  // 7. Advance with SKIP
  const adv5 = await onboarding.advanceSession(session, mockGuild, 'SKIP');
  assert.equal(adv5.done, false);
  assert.equal(session.stepIndex, 5);

  // 8. Jump to end of session
  session.stepIndex = session.steps.length;
  const completedPayload = onboarding.buildOnboardingPayload(session, null);
  assert.ok(completedPayload.embeds?.length > 0);
  assert.match(completedPayload.embeds[0].data.title, /Complete/i);

  // 9. Category & Module sessions
  const catSession = onboarding.startCategoryOnboardingSession(mockGuild.id, 'user-12345', 'CORE');
  assert.ok(catSession, 'Category session created');
  assert.equal(catSession.type, 'CATEGORY_ONBOARDING');

  const modSession = onboarding.startModuleOnboardingSession(mockGuild.id, 'user-12345', 'TICKETS');
  assert.ok(modSession, 'Module session created');
  assert.equal(modSession.type, 'MODULE_ONBOARDING');

  // 10. Welcome payload
  const welcomePayload = onboarding.buildWelcomePayload(mockGuild);
  assert.ok(welcomePayload.embeds?.length > 0);
  assert.ok(welcomePayload.components?.length > 0);
});
