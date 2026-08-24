const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { MockDatabase } = require('../helpers/mockDb');
const { CustomIds } = require('../../src/modules/ui/customIds');
const { MODULE_CATEGORIES, buildCategoryPanel, buildSetupPanel } = require('../../src/modules/ui/panels');
const { OnboardingService, autoCreateChannel, autoCreateRole, ONBOARDING_STEPS } = require('../../src/modules/onboarding/onboardingService');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');

const mockDb = new MockDatabase();
mockDb.install();

test('MODULE_CATEGORIES defines CORE, SUPPORT, COMMUNITY, and AUTOMATION', () => {
  const keys = MODULE_CATEGORIES.map((c) => c.key);
  assert.ok(keys.includes('CORE'), 'Contains CORE category');
  assert.ok(keys.includes('SUPPORT'), 'Contains SUPPORT category');
  assert.ok(keys.includes('COMMUNITY'), 'Contains COMMUNITY category');
  assert.ok(keys.includes('AUTOMATION'), 'Contains AUTOMATION category');
});

test('CustomIds registers all category and onboarding action IDs', () => {
  assert.equal(CustomIds.SetupCategoryCore, 'slickbot:setup:cat:core');
  assert.equal(CustomIds.SetupCategorySupport, 'slickbot:setup:cat:support');
  assert.equal(CustomIds.SetupCategoryCommunity, 'slickbot:setup:cat:community');
  assert.equal(CustomIds.SetupCategoryAutomation, 'slickbot:setup:cat:automation');
  assert.equal(CustomIds.SetupModuleSelect, 'slickbot:setup:module:select');
  assert.equal(CustomIds.OnboardingStart, 'slickbot:onboarding:start');
  assert.equal(CustomIds.OnboardingModulePrefix, 'slickbot:onboarding:mod:');
  assert.equal(CustomIds.OnboardingAutoCreatePrefix, 'slickbot:onboarding:auto:');
  assert.equal(CustomIds.OnboardingSkipPrefix, 'slickbot:onboarding:skip:');
  assert.equal(CustomIds.OnboardingChannelSelectPrefix, 'slickbot:onboarding:chsel:');
  assert.equal(CustomIds.OnboardingRoleSelectPrefix, 'slickbot:onboarding:rolesel:');
});

test('OnboardingService creates server onboarding session and builds payload', () => {
  const onboarding = new OnboardingService();
  const session = onboarding.startServerOnboarding('guild-123', 'user-456');

  assert.ok(session, 'Session created');
  assert.equal(session.guildId, 'guild-123');
  assert.equal(session.userId, 'user-456');
  assert.equal(session.type, 'SERVER_ONBOARDING');
  assert.equal(session.stepIndex, 0);
  assert.equal(session.steps.length, 23, 'Server onboarding covers 23 modules');

  const payload = onboarding.buildOnboardingPayload(session, '#bot-logs');
  assert.ok(payload.embeds?.length > 0, 'Has embed');
  assert.ok(payload.components?.length > 0, 'Has components');
  assert.match(payload.embeds[0].data.title, /Guided Server Onboarding/i);
  assert.match(payload.embeds[0].data.description, /Overall Progress:/i);
  assert.match(payload.embeds[0].data.description, /Module 1 of 22/i);
  assert.match(payload.embeds[0].data.description, /Staff Roles & Permissions/i);
});

test('OnboardingService advances steps and completes', async () => {
  const onboarding = new OnboardingService();
  const session = onboarding.startModuleOnboarding('guild-123', 'user-456', ModuleKeys.LOGGING);

  assert.ok(session, 'Module onboarding session created');
  assert.equal(session.steps.length, 6);

  for (let i = 0; i < session.steps.length; i++) {
    const advance = await onboarding.advanceSession(session, {}, 'SKIP');
    if (i === session.steps.length - 1) {
      assert.equal(advance.done, true);
    } else {
      assert.equal(advance.done, false);
    }
  }

  const finalPayload = onboarding.buildOnboardingPayload(session);
  assert.match(finalPayload.embeds[0].data.title, /Server Onboarding Complete|Onboarding Complete/i);
});

test('OnboardingService builds greeting payload for new guilds', () => {
  const onboarding = new OnboardingService();
  const mockGuild = { name: 'Test Server' };
  const payload = onboarding.buildGuildJoinGreetingPayload(mockGuild);

  assert.ok(payload.embeds?.length > 0);
  assert.match(payload.embeds[0].data.title, /Welcome to SlickBot/i);
  assert.ok(payload.components?.length > 0);
});

test('autoCreateRole creates a role if it does not already exist', async () => {
  let createdRoleData = null;
  const mockGuild = {
    roles: {
      cache: {
        find: () => null
      },
      create: async (data) => {
        createdRoleData = data;
        return { id: 'role-999', name: data.name };
      }
    }
  };

  const role = await autoCreateRole(mockGuild, { name: 'Admin', color: '#e74c3c' });
  assert.equal(role.id, 'role-999');
  assert.equal(createdRoleData.name, 'Admin');
});

test('autoCreateChannel creates a channel with expected parameters', async () => {
  let createdChannelData = null;
  const mockGuild = {
    roles: {
      everyone: { id: 'everyone-role' }
    },
    channels: {
      cache: {
        find: () => null
      },
      create: async (data) => {
        createdChannelData = data;
        return { id: 'chan-888', name: data.name, type: data.type };
      }
    }
  };

  const channel = await autoCreateChannel(mockGuild, {
    name: 'mod-logs',
    type: ChannelType.GuildText,
    isPrivate: true
  });

  assert.equal(channel.id, 'chan-888');
  assert.equal(createdChannelData.name, 'mod-logs');
  assert.ok(createdChannelData.permissionOverwrites?.length > 0);
});

test('Setup command supports module autocomplete', async () => {
  const setupCommand = require('../../src/commands/setup');
  assert.equal(typeof setupCommand.autocomplete, 'function');

  let respondedChoices = null;
  const mockInteraction = {
    options: {
      getFocused: () => ({ name: 'module', value: 'log' })
    },
    respond: async (choices) => {
      respondedChoices = choices;
    }
  };

  await setupCommand.autocomplete(mockInteraction);
  assert.ok(Array.isArray(respondedChoices));
  assert.ok(respondedChoices.some((c) => c.value === 'LOGGING'));
});

test('LoggingService defines setModuleChannel and setupStarterChannels', () => {
  const { LoggingService } = require('../../src/modules/logging/loggingService');
  const logging = new LoggingService();
  assert.equal(typeof logging.setModuleChannel, 'function');
  assert.equal(typeof logging.setupStarterChannels, 'function');
});

test('PermissionService defines setupRoles', () => {
  const { PermissionService } = require('../../src/modules/permissions/permissionService');
  const permissions = new PermissionService();
  assert.equal(typeof permissions.setupRoles, 'function');
});

test('OnboardingService advanceSession handles KEEP_DEFAULT and KEEP_CURRENT with fallback', async () => {
  const onboarding = new OnboardingService();
  const session = onboarding.startModuleOnboarding('guild-123', 'user-456', ModuleKeys.LOGGING);

  // Mock guild
  const mockGuild = { id: 'guild-123', channels: { cache: [] } };

  // Step 1: KEEP_DEFAULT
  await onboarding.advanceSession(session, mockGuild, 'KEEP_DEFAULT');
  assert.equal(session.stepIndex, 1);
  assert.ok(session.completedSteps[0].result);

  // Step 2: KEEP_CURRENT when nothing exists -> falls back to default
  await onboarding.advanceSession(session, mockGuild, 'KEEP_CURRENT');
  assert.equal(session.stepIndex, 2);
  assert.match(session.completedSteps[1].result, /no current setup stored|default/i);
});

test('buildOnboardingPayload includes Keep Current and Keep Default action buttons', () => {
  const onboarding = new OnboardingService();
  const session = onboarding.startServerOnboarding('guild-123', 'user-456');
  const payload = onboarding.buildOnboardingPayload(session, '#bot-logs');

  assert.ok(payload.components?.length >= 2, 'Has select menu and button row');
  const buttonRow = payload.components[payload.components.length - 1];
  const customIds = buttonRow.components.map((b) => b.data.custom_id);

  assert.ok(customIds.some((id) => id.startsWith(CustomIds.OnboardingKeepCurrentPrefix)), 'Has Keep Current button');
  assert.ok(customIds.some((id) => id.startsWith(CustomIds.OnboardingKeepDefaultPrefix)), 'Has Keep Default button');
  assert.ok(customIds.some((id) => id.startsWith(CustomIds.OnboardingSkipPrefix)), 'Has Skip button');
  assert.ok(customIds.some((id) => id.startsWith(CustomIds.OnboardingCancelPrefix)), 'Has Exit button');
});

test('LOG_GROUPS aggregates all LogModuleCatalog modules across 6 primary hubs', () => {
  const { LOG_GROUPS, getLogGroup, LogModuleCatalog } = require('../../src/modules/logging/logEventCatalog');
  assert.equal(LOG_GROUPS.length, 6, 'Has 6 log groups');

  const allModuleKeysInGroups = LOG_GROUPS.flatMap((g) => g.moduleKeys);
  assert.equal(allModuleKeysInGroups.length, 30, 'Covers all 30 log modules');
  assert.equal(allModuleKeysInGroups.length, LogModuleCatalog.length, 'Matches catalog length');

  for (const mod of LogModuleCatalog) {
    const group = getLogGroup(mod.key);
    assert.ok(group, `Module ${mod.key} has an assigned log group`);
  }
});

test('LoggingService defines setupLogGroup, getLogGroupChannels, and autoCreateAllLogChannels', () => {
  const { LoggingService } = require('../../src/modules/logging/loggingService');
  const logging = new LoggingService();
  assert.equal(typeof logging.setupLogGroup, 'function');
  assert.equal(typeof logging.getLogGroupChannels, 'function');
  assert.equal(typeof logging.autoCreateAllLogChannels, 'function');
});

test('SERVER_ONBOARDING provides rich metadata across all 23 module steps', () => {
  const steps = ONBOARDING_STEPS.SERVER_ONBOARDING;
  assert.equal(steps.length, 23);

  for (const step of steps) {
    assert.ok(step.id, 'Step has an id');
    assert.ok(step.moduleKey, `Step ${step.id} has moduleKey`);
    assert.ok(step.moduleName, `Step ${step.id} has moduleName`);
    assert.ok(step.categoryKey, `Step ${step.id} has categoryKey`);
    assert.ok(step.categoryLabel, `Step ${step.id} has categoryLabel`);
    assert.ok(step.moduleOverview, `Step ${step.id} has moduleOverview`);
    assert.ok(step.title, `Step ${step.id} has title`);
    assert.ok(step.description, `Step ${step.id} has description`);
    assert.ok(step.autoCreateLabel, `Step ${step.id} has autoCreateLabel`);
    assert.equal(typeof step.autoCreate, 'function', `Step ${step.id} defines autoCreate`);
  }
});

test('OnboardingService advanceSession with SKIP disables unconfigured module and preserves configured module', async () => {
  const onboarding = new OnboardingService();
  const session = onboarding.startServerOnboarding('guild-123', 'user-456');

  let disabledModule = null;
  let enabledModule = null;
  const mockPermissions = {
    isModuleEnabled: async (guildId, key) => false,
    setModuleEnabled: async (guildId, key, enabled) => {
      if (enabled) enabledModule = key;
      else disabledModule = key;
    }
  };

  const mockGuild = {
    id: 'guild-123',
    channels: { cache: [] }
  };

  // Advance step 0 (Permissions - unconfigured) with SKIP -> should disable
  await onboarding.advanceSession(session, mockGuild, 'SKIP', {}, mockPermissions);
  assert.equal(disabledModule, ModuleKeys.PERMISSIONS);
  assert.match(session.completedSteps[0].result, /Disabled/i);

  // Advance step 1 (Logging) with AUTO_CREATE -> should enable
  await onboarding.advanceSession(session, mockGuild, 'AUTO_CREATE', { created: 'bot-logs' }, mockPermissions);
  assert.equal(enabledModule, ModuleKeys.LOGGING);
  assert.match(session.completedSteps[1].result, /Enabled/i);
});

test('SERVER_ONBOARDING tickets autoCreate creates channels, roles, and sends public panel', async () => {
  const ticketStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_tickets');
  assert.ok(ticketStep, 'Tickets step found in SERVER_ONBOARDING');

  let sentPayload = null;
  const mockGuild = {
    id: 'guild-tickets-test',
    roles: {
      cache: [],
      create: async (opts) => ({ id: 'role-support', name: opts.name })
    },
    channels: {
      cache: [],
      create: async (opts) => {
        if (opts.type === ChannelType.GuildCategory) {
          return { id: 'cat-tickets', name: opts.name, type: opts.type };
        }
        return {
          id: 'chan-submit-tickets',
          name: opts.name,
          type: opts.type,
          send: async (payload) => {
            sentPayload = payload;
            return { id: 'msg-123' };
          }
        };
      }
    }
  };

  mockDb.addHandler('ticket_configs', {
    rows: [{
      guild_id: 'guild-tickets-test',
      category_id: 'cat-tickets',
      staff_role_id: 'role-support',
      ticket_limit: 1,
      transcript_enabled: true,
      naming_format: 'ticket-{username}-{number}',
      close_delete_seconds: 10,
      panel_display_mode: 'BUTTONS'
    }],
    rowCount: 1
  });
  mockDb.addHandler('ticket_types', {
    rows: [{
      id: 1,
      guild_id: 'guild-tickets-test',
      name: 'Admin Support',
      label: 'Admin Support',
      enabled: true
    }],
    rowCount: 1
  });

  const res = await ticketStep.autoCreate(mockGuild);
  assert.ok(res.created);
  assert.match(res.created, /Tickets/i);
  assert.match(res.created, /submit-tickets/i);
  assert.ok(sentPayload, 'Panel payload was sent to channel');
  assert.ok(sentPayload.embeds?.length > 0, 'Panel payload has embed');
  assert.ok(sentPayload.components?.length > 0, 'Panel payload has interactive buttons');
});

test('SERVER_ONBOARDING reaction roles autoCreate creates notification buttons and color roles dropdown preset', async () => {
  const notifStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_reaction_roles');
  const colorStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_color_roles');
  assert.ok(notifStep, 'Notification roles step exists');
  assert.ok(colorStep, 'Color roles step exists');

  const createdRoles = [];
  const sentPayloads = [];

  const mockGuild = {
    id: 'guild-roles-test',
    roles: {
      cache: [],
      create: async (opts) => {
        const r = { id: `role-${opts.name.toLowerCase()}`, name: opts.name };
        createdRoles.push(r);
        return r;
      }
    },
    channels: {
      cache: [],
      create: async (opts) => {
        return {
          id: 'chan-get-roles',
          name: opts.name,
          send: async (payload) => {
            sentPayloads.push(payload);
            return { id: 'msg-roles' };
          }
        };
      }
    }
  };

  mockDb.addHandler('role_panels', (sql, params) => {
    if ((sql && sql.includes('color-roles')) || (params && params.includes('color-roles'))) {
      return {
        rows: [{
          id: 2,
          guild_id: 'guild-roles-test',
          name: 'color-roles',
          title: '🎨 Pick Your Name Color',
          mode: 'SINGLE',
          panel_display_mode: 'DROPDOWN',
          active: true
        }],
        rowCount: 1
      };
    }
    return {
      rows: [{
        id: 1,
        guild_id: 'guild-roles-test',
        name: 'notification-roles',
        title: '🔔 Notification & Community Roles',
        mode: 'MULTI',
        panel_display_mode: 'BUTTONS',
        active: true
      }],
      rowCount: 1
    };
  });

  mockDb.addHandler('role_panel_options', (sql, params) => {
    if (params && params.includes(2)) {
      return {
        rows: [{
          id: 20,
          panel_id: 2,
          role_id: 'role-red',
          option_key: 'role:role-red',
          label: 'Red',
          emoji: '🔴',
          button_color: '#e74c3c',
          active: true
        }],
        rowCount: 1
      };
    }
    return {
      rows: [{
        id: 10,
        panel_id: 1,
        role_id: 'role-announcements',
        option_key: 'role:role-announcements',
        label: 'Announcements',
        emoji: '📢',
        button_color: '#3498db',
        active: true
      }],
      rowCount: 1
    };
  });

  const notifRes = await notifStep.autoCreate(mockGuild);
  assert.ok(notifRes.created);
  assert.match(notifRes.created, /Notification Role Panel published/i);

  const colorRes = await colorStep.autoCreate(mockGuild);
  assert.ok(colorRes.created);
  assert.match(colorRes.created, /8 Color Roles & Dropdown Panel published/i);
  assert.equal(sentPayloads.length, 2, 'Both panels sent to channel');
});

test('SERVER_ONBOARDING birthdays autoCreate creates role, channel, and sends registration panel', async () => {
  const bdayStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_birthdays');
  assert.ok(bdayStep, 'Birthdays step exists');

  let sentPayload = null;
  const mockGuild = {
    id: 'guild-bday-test',
    roles: {
      cache: [],
      create: async (opts) => ({ id: 'role-bday', name: opts.name })
    },
    channels: {
      cache: [],
      create: async (opts) => ({
        id: 'chan-bday',
        name: opts.name,
        send: async (payload) => {
          sentPayload = payload;
          return { id: 'msg-bday' };
        }
      })
    }
  };

  mockDb.addHandler('birthday_configs', {
    rows: [{
      guild_id: 'guild-bday-test',
      channel_id: 'chan-bday',
      birthday_role_id: 'role-bday',
      enabled: true
    }],
    rowCount: 1
  });

  const res = await bdayStep.autoCreate(mockGuild);
  assert.ok(res.created);
  assert.match(res.created, /Birthday Registration Panel published/i);
  assert.ok(sentPayload, 'Birthday panel was sent');
  assert.ok(sentPayload.components?.length > 0, 'Birthday panel has interactive buttons');
  const customId = sentPayload.components[0].components[0].data.custom_id;
  assert.equal(customId, CustomIds.BirthdaySetOpen);
});

test('SERVER_ONBOARDING community games autoCreate creates channels and sends games panel', async () => {
  const gamesStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_community_games');
  assert.ok(gamesStep, 'Community games step exists');

  let sentPayload = null;
  const mockGuild = {
    id: 'guild-games-test',
    channels: {
      cache: [],
      create: async (opts) => ({
        id: `chan-${opts.name}`,
        name: opts.name,
        send: async (payload) => {
          sentPayload = payload;
          return { id: 'msg-games' };
        }
      })
    }
  };

  mockDb.addHandler('community_game_configs', {
    rows: [
      { guild_id: 'guild-games-test', game_key: 'TIC_TAC_TOE', enabled: true },
      { guild_id: 'guild-games-test', game_key: 'CONNECT_FOUR', enabled: true },
      { guild_id: 'guild-games-test', game_key: 'COUNTING', enabled: true }
    ],
    rowCount: 3
  });
  mockDb.addHandler('counting_game_configs', {
    rows: [{ guild_id: 'guild-games-test', channel_id: 'chan-counting', current_number: 0, record_number: 0, enabled: true }],
    rowCount: 1
  });

  const res = await gamesStep.autoCreate(mockGuild);
  assert.ok(res.created);
  assert.match(res.created, /Games Panel published/i);
  assert.ok(sentPayload, 'Game lounge panel was sent');
  assert.ok(sentPayload.embeds?.length > 0, 'Game lounge panel has embed');
  assert.ok(sentPayload.components?.length > 0, 'Game lounge panel has interactive challenge buttons');
});

test('SERVER_ONBOARDING social feeds autoCreate creates channel and pins live creator directory', async () => {
  const feedsStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_social_feeds');
  assert.ok(feedsStep, 'Social feeds step exists');

  let sentPayload = null;
  let pinned = false;
  const mockGuild = {
    id: 'guild-feeds-test',
    client: {},
    channels: {
      cache: [],
      create: async (opts) => ({
        id: 'chan-stream-alerts',
        name: opts.name,
        send: async (payload) => {
          sentPayload = payload;
          return {
            id: 'msg-feeds-hub',
            pin: async () => { pinned = true; }
          };
        }
      })
    }
  };

  mockDb.addHandler('social_feed_configs', {
    rows: [{
      guild_id: 'guild-feeds-test',
      default_channel_id: 'chan-stream-alerts',
      live_directory_channel_id: 'chan-stream-alerts',
      enabled: true
    }],
    rowCount: 1
  });
  mockDb.addHandler('social_feeds', {
    rows: [],
    rowCount: 0
  });

  const res = await feedsStep.autoCreate(mockGuild);
  assert.ok(res.created);
  assert.match(res.created, /Live Creator Hub pinned/i);
  assert.ok(sentPayload, 'Live directory payload was sent');
  assert.equal(pinned, true, 'Live directory message was pinned');
});


