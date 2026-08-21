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
  assert.equal(session.steps.length, 1);

  const advance = await onboarding.advanceSession(session, {}, 'SKIP');
  assert.equal(advance.done, true);

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
