const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { CustomIds } = require('../../src/modules/ui/customIds');
const { MODULE_CATEGORIES, buildCategoryPanel, buildSetupPanel } = require('../../src/modules/ui/panels');
const { OnboardingService, autoCreateChannel, autoCreateRole, ONBOARDING_STEPS } = require('../../src/modules/onboarding/onboardingService');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');

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
  assert.equal(session.steps.length, 5);

  const payload = onboarding.buildOnboardingPayload(session);
  assert.ok(payload.embeds?.length > 0, 'Has embed');
  assert.ok(payload.components?.length > 0, 'Has components');
  assert.match(payload.embeds[0].data.title, /Guided Server Onboarding/i);
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
  assert.match(finalPayload.embeds[0].data.title, /Onboarding Complete/i);
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

