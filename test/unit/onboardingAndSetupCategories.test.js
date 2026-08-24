const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { MockDatabase } = require('../helpers/mockDb');
const { CustomIds } = require('../../src/modules/ui/customIds');
const { MODULE_CATEGORIES, buildCategoryPanel, buildSetupPanel } = require('../../src/modules/ui/panels');
const { OnboardingService, autoCreateChannel, autoCreateRole, ensureCategory, STANDARD_CATEGORIES, ONBOARDING_STEPS } = require('../../src/modules/onboarding/onboardingService');
const { AppealService } = require('../../src/modules/support/supportService');
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
  assert.equal(session.steps.length, 25, 'Server onboarding covers 25 steps');

  const payload = onboarding.buildOnboardingPayload(session, '#bot-logs');
  assert.ok(payload.embeds?.length > 0, 'Has embed');
  assert.ok(payload.components?.length > 0, 'Has components');
  assert.match(payload.embeds[0].data.title, /Guided Server Onboarding/i);
  assert.match(payload.embeds[0].data.description, /Overall Progress:/i);
  assert.match(payload.embeds[0].data.description, /Module 1 of \d+/i);
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

test('autoCreateRole creates a role without color by default and with colors when specified', async () => {
  let createdRoleData = null;
  const mockGuild = {
    roles: {
      cache: {
        find: () => null
      },
      create: async (data) => {
        createdRoleData = data;
        return { id: 'role-999', name: data.name, colors: data.colors };
      }
    }
  };

  const uncoloredRole = await autoCreateRole(mockGuild, { name: 'Admin' });
  assert.equal(uncoloredRole.id, 'role-999');
  assert.equal(createdRoleData.name, 'Admin');
  assert.equal(createdRoleData.colors, undefined, 'Functional roles are colorless by default');

  const coloredRole = await autoCreateRole(mockGuild, { name: 'Red', color: '#e74c3c' });
  assert.equal(createdRoleData.name, 'Red');
  assert.deepEqual(createdRoleData.colors, { primaryColor: 0xe74c3c }, 'Cosmetic roles pass discord.js primaryColor');
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

test('SERVER_ONBOARDING provides rich metadata across all 25 module steps', () => {
  const steps = ONBOARDING_STEPS.SERVER_ONBOARDING;
  assert.equal(steps.length, 25);

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

  // Advance step 0 (Admin Role - unconfigured) with SKIP -> should disable
  await onboarding.advanceSession(session, mockGuild, 'SKIP', {}, mockPermissions);
  assert.equal(disabledModule, ModuleKeys.PERMISSIONS);
  assert.match(session.completedSteps[0].result, /Disabled/i);

  // Advance step 1 (Mod Role - unconfigured) with SKIP -> should disable
  await onboarding.advanceSession(session, mockGuild, 'SKIP', {}, mockPermissions);
  assert.equal(disabledModule, ModuleKeys.PERMISSIONS);

  // Advance step 2 (Logging) with AUTO_CREATE -> should enable
  await onboarding.advanceSession(session, mockGuild, 'AUTO_CREATE', { created: 'bot-logs' }, mockPermissions);
  assert.equal(enabledModule, ModuleKeys.LOGGING);
  assert.match(session.completedSteps[2].result, /Enabled/i);
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

test('ApplicationService defines ensureDefaultType and provisions default questions', async () => {
  const { ApplicationService } = require('../../src/modules/support/supportService');
  const applications = new ApplicationService();

  assert.equal(typeof applications.ensureDefaultType, 'function');

  mockDb.addHandler('application_types', {
    rows: [{
      id: 1,
      guild_id: 'guild-app-test',
      name: 'Staff Application',
      review_channel_id: 'chan-app-review',
      enabled: true
    }],
    rowCount: 1
  });
  mockDb.addHandler('application_questions', {
    rows: [
      { id: 10, application_type_id: 1, question_text: 'Why do you want to join?', required: true, display_order: 1 }
    ],
    rowCount: 1
  });

  const type = await applications.ensureDefaultType('guild-app-test', 'chan-app-review');
  assert.ok(type);
  assert.equal(type.name, 'Staff Application');
});

test('SERVER_ONBOARDING server_admin_role and server_mod_role create distinct colorless roles', async () => {
  const adminStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_admin_role');
  const modStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_mod_role');

  assert.ok(adminStep, 'Admin step exists in SERVER_ONBOARDING');
  assert.ok(modStep, 'Mod step exists in SERVER_ONBOARDING');

  const createdRoles = [];
  const mockGuild = {
    id: 'guild-roles-distinct',
    roles: {
      cache: [],
      create: async (opts) => {
        const r = { id: `role-${opts.name.toLowerCase()}`, name: opts.name, color: opts.color };
        createdRoles.push(r);
        return r;
      }
    }
  };

  const adminRes = await adminStep.autoCreate(mockGuild);
  assert.ok(adminRes.created);
  assert.match(adminRes.created, /@Admin/i);

  const modRes = await modStep.autoCreate(mockGuild);
  assert.ok(modRes.created);
  assert.match(modRes.created, /@Moderator/i);

  assert.equal(createdRoles.length, 2);
  assert.equal(createdRoles[0].name, 'Admin');
  assert.equal(createdRoles[0].color, undefined, 'Admin role is colorless');
  assert.equal(createdRoles[1].name, 'Moderator');
  assert.equal(createdRoles[1].color, undefined, 'Moderator role is colorless');
});

test('SERVER_ONBOARDING applications autoCreate provisions review channel, apply channel, and sends panel', async () => {
  const appStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_applications');
  assert.ok(appStep, 'Applications step exists');

  let sentPayload = null;
  const mockGuild = {
    id: 'guild-app-autocreate-test',
    channels: {
      cache: [],
      create: async (opts) => ({
        id: `chan-${opts.name}`,
        name: opts.name,
        send: async (payload) => {
          sentPayload = payload;
          return { id: 'msg-app-panel' };
        }
      })
    }
  };

  mockDb.addHandler('application_types', {
    rows: [{
      id: 1,
      guild_id: 'guild-app-autocreate-test',
      name: 'Staff Application',
      review_channel_id: 'chan-app-review',
      enabled: true
    }],
    rowCount: 1
  });
  mockDb.addHandler('application_questions', {
    rows: [
      { id: 1, application_type_id: 1, question_text: 'Why do you want to join?', required: true, display_order: 1 }
    ],
    rowCount: 1
  });

  const res = await appStep.autoCreate(mockGuild);
  assert.ok(res.created);
  assert.match(res.created, /app-review/i);
  assert.match(res.created, /apply-here/i);
  assert.ok(sentPayload, 'Application panel was published');
  assert.ok(sentPayload.embeds?.length > 0);
});

test('AppealService.updateConfig correctly uses COALESCE for dm_decision_enabled and dm_include_submission', async () => {
  const appeals = new AppealService();

  let executedSql = null;
  let executedParams = null;

  mockDb.addHandler('appeal_configs', (sql, params) => {
    executedSql = sql;
    executedParams = params;
    return {
      rows: [{
        guild_id: params[0],
        review_channel_id: params[1],
        dm_decision_enabled: params[2] !== null ? params[2] : true,
        dm_include_submission: params[3] !== null ? params[3] : false,
        panel_title: params[4],
        panel_description: params[5],
        panel_color: params[6],
        panel_header_image_url: params[7],
        panel_display_mode: params[8] || 'BUTTONS'
      }],
      rowCount: 1
    };
  });

  // Call without optional boolean flags
  const result = await appeals.updateConfig('guild-appeal-test', {
    reviewChannelId: 'chan-appeal-reviews'
  });

  assert.ok(result);
  assert.match(executedSql, /COALESCE\(\$3, true\)/i);
  assert.match(executedSql, /COALESCE\(\$4, false\)/i);
  assert.equal(executedParams[0], 'guild-appeal-test');
  assert.equal(executedParams[1], 'chan-appeal-reviews');
  assert.equal(executedParams[2], null, 'Unspecified dmDecisionEnabled passes null so COALESCE applies default true');
  assert.equal(executedParams[3], null, 'Unspecified dmIncludeSubmission passes null so COALESCE applies default false');
});

test('STANDARD_CATEGORIES defines standard categories with names and keywords', () => {
  assert.ok(STANDARD_CATEGORIES.START_HERE, 'Has START_HERE category');
  assert.ok(STANDARD_CATEGORIES.COMMUNITY, 'Has COMMUNITY category');
  assert.ok(STANDARD_CATEGORIES.GAMES, 'Has GAMES category');
  assert.ok(STANDARD_CATEGORIES.SUPPORT, 'Has SUPPORT category');
  assert.ok(STANDARD_CATEGORIES.STAFF, 'Has STAFF category');
  assert.ok(STANDARD_CATEGORIES.LOGS, 'Has LOGS category');
  assert.ok(STANDARD_CATEGORIES.VOICE, 'Has VOICE category');
  assert.ok(STANDARD_CATEGORIES.STATS, 'Has STATS category');

  assert.match(STANDARD_CATEGORIES.START_HERE.name, /Start Here/i);
  assert.match(STANDARD_CATEGORIES.COMMUNITY.name, /Community Hub/i);
  assert.match(STANDARD_CATEGORIES.GAMES.name, /Games/i);
  assert.match(STANDARD_CATEGORIES.SUPPORT.name, /Support/i);
  assert.match(STANDARD_CATEGORIES.STAFF.name, /Staff/i);
  assert.match(STANDARD_CATEGORIES.LOGS.name, /Logs/i);
});

test('ensureCategory reuses existing category by name, emoji prefix, or keywords', async () => {
  let createdCategoryData = null;
  const mockGuild = {
    roles: {
      everyone: { id: 'role-everyone' }
    },
    channels: {
      cache: [
        { id: 'cat-existing-staff', name: '🛡️ Staff Area', type: ChannelType.GuildCategory },
        { id: 'cat-community-plain', name: 'community', type: ChannelType.GuildCategory }
      ],
      create: async (data) => {
        createdCategoryData = data;
        return { id: 'cat-newly-created', name: data.name, type: data.type };
      }
    }
  };

  // 1. Reuses exact match
  const staffCat = await ensureCategory(mockGuild, { name: '🛡️ Staff Area' });
  assert.equal(staffCat.id, 'cat-existing-staff');
  assert.equal(createdCategoryData, null);

  // 2. Reuses keyword/stripped emoji match
  const commCat = await ensureCategory(mockGuild, { name: '🎉 Community Hub', keywords: ['community', 'general', 'hub'] });
  assert.equal(commCat.id, 'cat-community-plain');
  assert.equal(createdCategoryData, null);

  // 3. Creates new category when no match exists
  const logsCat = await ensureCategory(mockGuild, { name: '📋 Server Logs', keywords: ['server logs', 'logging', 'audit logs'], isPrivate: true });
  assert.equal(logsCat.id, 'cat-newly-created');
  assert.equal(createdCategoryData.name, '📋 Server Logs');
  assert.equal(createdCategoryData.type, ChannelType.GuildCategory);
});

test('autoCreateChannel automatically assigns parent category using categoryName', async () => {
  let createdChannelData = null;
  const mockGuild = {
    roles: {
      everyone: { id: 'role-everyone' }
    },
    channels: {
      cache: [
        { id: 'cat-start-here', name: '📌 Start Here', type: ChannelType.GuildCategory }
      ],
      create: async (data) => {
        createdChannelData = data;
        return { id: 'chan-created', name: data.name, parentId: data.parent };
      }
    }
  };

  const channel = await autoCreateChannel(mockGuild, {
    name: 'rules',
    categoryName: STANDARD_CATEGORIES.START_HERE.name,
    isPrivate: false
  });

  assert.equal(channel.id, 'chan-created');
  assert.equal(createdChannelData.parent, 'cat-start-here', 'Channel parentId is set to the resolved category ID');
});

test('SERVER_ONBOARDING notification reaction roles panel includes Bot Updates role with 🤖 emoji', async () => {
  const notifStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_reaction_roles');
  assert.ok(notifStep, 'Reaction roles step found');

  const createdRoles = [];
  let sentPayload = null;

  const mockGuild = {
    id: 'guild-rr-botupdates',
    roles: {
      cache: [],
      create: async (opts) => {
        const r = { id: `10000000000000000${createdRoles.length + 1}`, name: opts.name };
        createdRoles.push(r);
        return r;
      }
    },
    channels: {
      cache: [],
      create: async (opts) => ({
        id: 'chan-get-roles',
        name: opts.name,
        send: async (payload) => {
          sentPayload = payload;
          return { id: 'msg-rr-notifs' };
        }
      })
    }
  };

  const optionsAdded = [];
  mockDb.addHandler('role_panels', {
    rows: [{
      id: 1,
      guild_id: 'guild-rr-botupdates',
      name: 'notification-roles',
      title: '🔔 Notification & Community Roles',
      mode: 'MULTI',
      panel_display_mode: 'BUTTONS',
      active: true
    }],
    rowCount: 1
  });
  mockDb.addHandler('role_panel_options', (sql, params) => {
    if (sql && sql.includes('INSERT INTO role_panel_options')) {
      optionsAdded.push({
        panelId: params[0],
        roleId: params[1],
        label: params[4],
        emoji: params[5]
      });
      return { rows: [{ id: optionsAdded.length }], rowCount: 1 };
    }
    return {
      rows: optionsAdded.map((opt, i) => ({
        id: i + 1,
        panel_id: opt.panelId,
        role_id: opt.roleId,
        option_key: `role:${opt.roleId}`,
        label: opt.label,
        emoji: opt.emoji,
        active: true
      })),
      rowCount: optionsAdded.length
    };
  });

  const res = await notifStep.autoCreate(mockGuild);
  assert.ok(res.created);
  assert.match(res.created, /4 roles/i);

  const roleNames = createdRoles.map((r) => r.name);
  assert.ok(roleNames.includes('Announcements'));
  assert.ok(roleNames.includes('Events'));
  assert.ok(roleNames.includes('Giveaways'));
  assert.ok(roleNames.includes('Bot Updates'));

  const botUpdatesOption = optionsAdded.find((o) => o.label === 'Bot Updates');
  assert.ok(botUpdatesOption, 'Bot Updates option added to panel');
  assert.equal(botUpdatesOption.emoji, '🤖');
});

test('SERVER_ONBOARDING bot updates autoCreate creates private #bot-news gated to @Bot Updates role', async () => {
  const botUpdatesStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_bot_updates');
  assert.ok(botUpdatesStep, 'Bot updates step exists in SERVER_ONBOARDING');

  let createdChannelData = null;
  const botUpdatesRole = { id: 'role-bot-updates', name: 'Bot Updates' };

  const mockGuild = {
    id: 'guild-botupdates-gating',
    roles: {
      everyone: { id: 'role-everyone-id' },
      cache: [botUpdatesRole],
      create: async (opts) => ({ id: 'role-new', name: opts.name })
    },
    channels: {
      cache: [],
      create: async (opts) => {
        createdChannelData = opts;
        return {
          id: 'chan-bot-news',
          name: opts.name,
          parentId: opts.parent,
          send: async () => ({ id: 'msg-feed' })
        };
      }
    }
  };

  mockDb.addHandler('bot_update_subscriptions', {
    rows: [{
      guild_id: 'guild-botupdates-gating',
      channel_id: 'chan-bot-news',
      role_id: 'role-bot-updates',
      subscribed_types: ['PATCH_NOTE', 'RELEASE', 'ANNOUNCEMENT', 'INCIDENT'],
      active: true
    }],
    rowCount: 1
  });

  const res = await botUpdatesStep.autoCreate(mockGuild);
  assert.ok(res.created);
  assert.match(res.created, /bot-news/i);
  assert.match(res.created, /Bot Updates/i);

  assert.ok(createdChannelData, 'Channel was created');
  assert.equal(createdChannelData.name, 'bot-news');

  // Verify permission overwrites: @everyone is denied ViewChannel, @Bot Updates is allowed ViewChannel + ReadMessageHistory
  const overwrites = createdChannelData.permissionOverwrites;
  assert.ok(Array.isArray(overwrites), 'Has permission overwrites');

  const everyoneOverwrite = overwrites.find((o) => o.id === 'role-everyone-id');
  assert.ok(everyoneOverwrite, 'Has @everyone overwrite');
  assert.ok(everyoneOverwrite.deny.includes(PermissionFlagsBits.ViewChannel), '@everyone ViewChannel is denied');

  const botUpdatesOverwrite = overwrites.find((o) => o.id === 'role-bot-updates');
  assert.ok(botUpdatesOverwrite, 'Has @Bot Updates overwrite');
  assert.ok(botUpdatesOverwrite.allow.includes(PermissionFlagsBits.ViewChannel), '@Bot Updates ViewChannel is allowed');
  assert.ok(botUpdatesOverwrite.allow.includes(PermissionFlagsBits.ReadMessageHistory), '@Bot Updates ReadMessageHistory is allowed');
});

test('SuggestionService.setup works with both (guildId, options) and ({ guildId, ...options })', async () => {
  const { SuggestionService } = require('../../src/modules/community/suggestionService');
  const suggestions = new SuggestionService();

  mockDb.addHandler('suggestion_configs', {
    rows: [{
      guild_id: 'guild-sug-test',
      channel_id: 'chan-sug-123',
      review_channel_id: null,
      log_channel_id: null,
      default_anonymous: false,
      auto_create_threads: true
    }],
    rowCount: 1
  });
  mockDb.addHandler('suggestion_categories', {
    rows: [{ id: 1, guild_id: 'guild-sug-test', name: 'General', active: true, sort_order: 1 }],
    rowCount: 1
  });

  // Call with positional (guildId, options)
  const resultPositional = await suggestions.setup('guild-sug-test', { channelId: 'chan-sug-123', autoCreateThreads: true });
  assert.ok(resultPositional, 'Positional setup returned config');

  // Call with single object ({ guildId, ...options })
  const resultObject = await suggestions.setup({ guildId: 'guild-sug-test', channelId: 'chan-sug-123' });
  assert.ok(resultObject, 'Object setup returned config');
});

test('ensureCategory distinguishes between 📁 Open Tickets and 🎫 Help & Support', async () => {
  const categories = [
    { id: 'cat-open-tickets', name: '📁 Open Tickets', type: ChannelType.GuildCategory },
    { id: 'cat-support', name: '🎫 Help & Support', type: ChannelType.GuildCategory }
  ];

  const mockGuild = {
    channels: {
      cache: categories,
      create: async () => assert.fail('Should find existing category')
    }
  };

  // Searching for Help & Support should NOT match Open Tickets
  const foundSupport = await ensureCategory(mockGuild, {
    name: STANDARD_CATEGORIES.SUPPORT.name,
    keywords: STANDARD_CATEGORIES.SUPPORT.keywords,
    isPrivate: false
  });
  assert.equal(foundSupport.id, 'cat-support', 'Found Help & Support category');

  // Searching for Open Tickets should match Open Tickets
  const foundTickets = await ensureCategory(mockGuild, {
    name: '📁 Open Tickets',
    keywords: ['open tickets', 'active tickets', 'ticket channels', 'tickets'],
    isPrivate: true
  });
  assert.equal(foundTickets.id, 'cat-open-tickets', 'Found Open Tickets category');
});

test('SERVER_ONBOARDING server_tickets autoCreate places #submit-tickets in Help & Support and assigns Open Tickets to ticket_configs', async () => {
  const ticketsStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_tickets');
  assert.ok(ticketsStep, 'Tickets step exists in SERVER_ONBOARDING');

  const createdChannels = [];
  const mockGuild = {
    id: 'guild-tickets-isolation',
    roles: {
      everyone: { id: 'role-everyone-id' },
      cache: [],
      create: async (opts) => ({ id: `role-${opts.name.toLowerCase().replace(/\s+/g, '-')}`, name: opts.name })
    },
    channels: {
      cache: [],
      create: async (opts) => {
        const id = `chan-${opts.name.toLowerCase().replace(/\s+/g, '-')}`;
        const chan = {
          id,
          name: opts.name,
          type: opts.type,
          parent: opts.parent,
          send: async () => ({ id: 'msg-panel' })
        };
        createdChannels.push(chan);
        mockGuild.channels.cache.push(chan);
        return chan;
      }
    }
  };

  mockDb.addHandler('ticket_configs', {
    rows: [{
      guild_id: 'guild-tickets-isolation',
      category_id: 'chan-📁-open-tickets',
      staff_role_id: 'role-support-staff',
      transcripts_enabled: true
    }],
    rowCount: 1
  });
  mockDb.addHandler('ticket_types', {
    rows: [{ id: '1', guild_id: 'guild-tickets-isolation', name: 'General Support', enabled: true, sort_order: 1 }],
    rowCount: 1
  });

  const res = await ticketsStep.autoCreate(mockGuild);
  assert.ok(res.created);
  assert.match(res.created, /Open Tickets/i);
  assert.match(res.created, /submit-tickets/i);

  const openTicketsCat = createdChannels.find((c) => c.name.includes('Open Tickets'));
  const helpSupportCat = createdChannels.find((c) => c.name.includes('Help & Support'));
  const submitTicketsChan = createdChannels.find((c) => c.name === 'submit-tickets');

  assert.ok(openTicketsCat, 'Open Tickets category created');
  assert.ok(helpSupportCat, 'Help & Support category created');
  assert.ok(submitTicketsChan, 'submit-tickets channel created');

  // Submit tickets must be in Help & Support category, NOT Open Tickets category
  assert.equal(submitTicketsChan.parent, helpSupportCat.id, 'submit-tickets is parented to Help & Support');
});

test('STANDARD_CATEGORIES defines requested category ordering: Stats > Start Here > Support > Open Tickets > Community > Games > Voice > Staff > Logs', () => {
  assert.equal(STANDARD_CATEGORIES.STATS.position, 0, 'Server Stats is position 0');
  assert.equal(STANDARD_CATEGORIES.START_HERE.position, 1, 'Start Here is position 1');
  assert.equal(STANDARD_CATEGORIES.SUPPORT.position, 2, 'Help & Support is position 2');
  assert.equal(STANDARD_CATEGORIES.OPEN_TICKETS.position, 3, 'Open Tickets is position 3');
  assert.equal(STANDARD_CATEGORIES.COMMUNITY.position, 4, 'Community Hub is position 4');
  assert.equal(STANDARD_CATEGORIES.GAMES.position, 5, 'Games & Activities is position 5');
  assert.equal(STANDARD_CATEGORIES.VOICE.position, 6, 'Dynamic Voice is position 6');
  assert.equal(STANDARD_CATEGORIES.STAFF.position, 7, 'Staff Area is position 7');
  assert.equal(STANDARD_CATEGORIES.LOGS.position, 8, 'Server Logs is position 8');
});

test('reorderServerCategories syncs category positions based on STANDARD_CATEGORIES', async () => {
  const { reorderServerCategories } = require('../../src/modules/onboarding/onboardingService');
  let setPositionsPayload = null;

  const mockGuild = {
    channels: {
      cache: [
        { id: 'cat-logs', name: '📋 Server Logs', type: ChannelType.GuildCategory },
        { id: 'cat-stats', name: '📊 Server Stats', type: ChannelType.GuildCategory },
        { id: 'cat-tickets', name: '📁 Open Tickets', type: ChannelType.GuildCategory },
        { id: 'cat-start', name: '📌 Start Here', type: ChannelType.GuildCategory }
      ],
      setPositions: async (updates) => {
        setPositionsPayload = updates;
      }
    }
  };

  await reorderServerCategories(mockGuild);
  assert.ok(setPositionsPayload, 'setPositions called');
  assert.equal(setPositionsPayload.find((u) => u.channel === 'cat-stats')?.position, 0);
  assert.equal(setPositionsPayload.find((u) => u.channel === 'cat-start')?.position, 1);
  assert.equal(setPositionsPayload.find((u) => u.channel === 'cat-tickets')?.position, 3);
  assert.equal(setPositionsPayload.find((u) => u.channel === 'cat-logs')?.position, 8);
});

test('SuggestionService.prototype.buildPanelPayload returns valid interactive panel message payload', () => {
  const { SuggestionService } = require('../../src/modules/community/suggestionService');
  const suggestions = new SuggestionService();

  const cfg = {
    panel_title: 'Server Suggestions',
    panel_description: 'Have an idea? Submit below!',
    panel_header_image_url: null
  };

  const payload = suggestions.buildPanelPayload(cfg);
  assert.ok(payload, 'Payload generated');
  assert.ok(payload.embeds?.length > 0, 'Has embeds');
  assert.ok(payload.components?.length > 0, 'Has components');
  assert.equal(payload.embeds[0].data.title, 'Server Suggestions');
});

test('SERVER_ONBOARDING server_suggestions autoCreate provisions #suggestions and publishes panel', async () => {
  const suggestionsStep = ONBOARDING_STEPS.SERVER_ONBOARDING.find((s) => s.id === 'server_suggestions');
  assert.ok(suggestionsStep, 'server_suggestions exists in SERVER_ONBOARDING');

  let sentMessagePayload = null;
  const mockGuild = {
    id: 'guild-sug-autocreate',
    roles: {
      everyone: { id: 'role-everyone-id' },
      cache: []
    },
    channels: {
      cache: [],
      create: async (opts) => ({
        id: 'chan-sug-99',
        name: opts.name,
        type: opts.type,
        send: async (payload) => {
          sentMessagePayload = payload;
          return { id: 'msg-sug-panel' };
        }
      })
    }
  };

  mockDb.addHandler('suggestion_configs', {
    rows: [{
      guild_id: 'guild-sug-autocreate',
      channel_id: 'chan-sug-99',
      default_anonymous: false,
      auto_create_threads: true,
      panel_title: 'Server Suggestions',
      panel_description: 'Submit an idea!'
    }],
    rowCount: 1
  });
  mockDb.addHandler('suggestion_categories', {
    rows: [{ id: 1, guild_id: 'guild-sug-autocreate', name: 'General', active: true, sort_order: 1 }],
    rowCount: 1
  });

  const res = await suggestionsStep.autoCreate(mockGuild);
  assert.ok(res.created);
  assert.match(res.created, /suggestions/i);
  assert.match(res.created, /Suggestion Panel published/i);
  assert.ok(sentMessagePayload, 'Panel payload was sent to channel');
});


