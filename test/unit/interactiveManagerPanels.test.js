const test = require('node:test');
const assert = require('node:assert/strict');
const { CustomIds } = require('../../src/modules/ui/customIds');
const { buildWelcomeEditModal } = require('../../src/modules/community/welcomeService');
const { buildGiveawayStartModal, buildGiveawayConfigModal } = require('../../src/modules/community/giveawayService');
const { buildBirthdayEditModal } = require('../../src/modules/community/birthdayService');
const { buildLevelingConfigModal } = require('../../src/modules/community/levelingService');
const { buildServerStatsConfigModal } = require('../../src/modules/community/serverStatsService');
const { buildCustomCommandCreateModal, buildCustomCommandPrefixModal } = require('../../src/modules/custom/customCommandService');
const { buildReferralsConfigModal } = require('../../src/modules/community/referralService');
const { buildScheduledMessageCreateModal } = require('../../src/modules/automation/scheduledMessageService');

test('Interactive Manager Panels & Modals Suite', async (t) => {
  await t.test('CustomIds exports all interactive module button and modal IDs', () => {
    // Welcome
    assert.equal(typeof CustomIds.WelcomeToggle, 'string');
    assert.equal(typeof CustomIds.WelcomeToggleDm, 'string');
    assert.equal(typeof CustomIds.WelcomeEditModal, 'string');
    assert.equal(typeof CustomIds.WelcomeEditModalSubmit, 'string');

    // Giveaways
    assert.equal(typeof CustomIds.GiveawaysQuickStart, 'string');
    assert.equal(typeof CustomIds.GiveawaysConfigModal, 'string');
    assert.equal(typeof CustomIds.GiveawaysQuickStartModalSubmit, 'string');
    assert.equal(typeof CustomIds.GiveawaysConfigModalSubmit, 'string');

    // Birthdays
    assert.equal(typeof CustomIds.BirthdaysToggle, 'string');
    assert.equal(typeof CustomIds.BirthdaysEditModal, 'string');
    assert.equal(typeof CustomIds.BirthdaysEditModalSubmit, 'string');

    // Leveling
    assert.equal(typeof CustomIds.LevelingToggle, 'string');
    assert.equal(typeof CustomIds.LevelingConfigModal, 'string');
    assert.equal(typeof CustomIds.LevelingToggleMode, 'string');
    assert.equal(typeof CustomIds.LevelingConfigModalSubmit, 'string');

    // Server Stats
    assert.equal(typeof CustomIds.ServerStatsToggle, 'string');
    assert.equal(typeof CustomIds.ServerStatsConfigModal, 'string');
    assert.equal(typeof CustomIds.ServerStatsRefreshNow, 'string');
    assert.equal(typeof CustomIds.ServerStatsConfigModalSubmit, 'string');

    // Custom Commands
    assert.equal(typeof CustomIds.CustomCommandsToggle, 'string');
    assert.equal(typeof CustomIds.CustomCommandsCreateModal, 'string');
    assert.equal(typeof CustomIds.CustomCommandsPrefixModal, 'string');
    assert.equal(typeof CustomIds.CustomCommandsCreateModalSubmit, 'string');
    assert.equal(typeof CustomIds.CustomCommandsPrefixModalSubmit, 'string');

    // Referrals
    assert.equal(typeof CustomIds.ReferralsToggle, 'string');
    assert.equal(typeof CustomIds.ReferralsConfigModal, 'string');
    assert.equal(typeof CustomIds.ReferralsConfigModalSubmit, 'string');

    // Scheduled Messages
    assert.equal(typeof CustomIds.ScheduledMessagesToggle, 'string');
    assert.equal(typeof CustomIds.ScheduledMessagesCreateModal, 'string');
    assert.equal(typeof CustomIds.ScheduledMessagesCreateModalSubmit, 'string');

    // Bot Updates
    assert.equal(typeof CustomIds.BotUpdatesToggle, 'string');
    assert.equal(typeof CustomIds.BotUpdatesTogglePings, 'string');
    assert.equal(typeof CustomIds.BotUpdatesPreview, 'string');
    assert.equal(typeof CustomIds.BotUpdatesSendNow, 'string');

    // Achievements, Temp Roles, FAQ, Games
    assert.equal(typeof CustomIds.AchievementsToggleDm, 'string');
    assert.equal(typeof CustomIds.TempRolesCleanup, 'string');
    assert.equal(typeof CustomIds.FaqRefreshIndex, 'string');
    assert.equal(typeof CustomIds.GamesCountingToggle, 'string');
    assert.equal(typeof CustomIds.GamesTttToggle, 'string');
    assert.equal(typeof CustomIds.GamesC4Toggle, 'string');
  });

  await t.test('buildWelcomeEditModal constructs modal with expected text inputs', () => {
    const modal = buildWelcomeEditModal({ embed_title: 'Welcome', embed_description: 'Hi {user}' });
    assert.equal(modal.data.custom_id, CustomIds.WelcomeEditModalSubmit);
    assert.ok(modal.components.length >= 4);
  });

  await t.test('buildGiveawayStartModal and buildGiveawayConfigModal construct valid modals', () => {
    const startModal = buildGiveawayStartModal();
    assert.equal(startModal.data.custom_id, CustomIds.GiveawaysQuickStartModalSubmit);
    assert.ok(startModal.components.length >= 4);

    const configModal = buildGiveawayConfigModal({ panel_color: '#7869ff' });
    assert.equal(configModal.data.custom_id, CustomIds.GiveawaysConfigModalSubmit);
    assert.ok(configModal.components.length >= 2);
  });

  await t.test('buildBirthdayEditModal constructs valid modal', () => {
    const modal = buildBirthdayEditModal({ announcement_template: 'Happy bday {user}', timezone: 'UTC' });
    assert.equal(modal.data.custom_id, CustomIds.BirthdaysEditModalSubmit);
    assert.ok(modal.components.length >= 2);
  });

  await t.test('buildLevelingConfigModal constructs valid modal with rates and cooldown', () => {
    const modal = buildLevelingConfigModal({ xp_min: 10, xp_max: 20, cooldown_seconds: 45, minimum_message_length: 5 });
    assert.equal(modal.data.custom_id, CustomIds.LevelingConfigModalSubmit);
    assert.ok(modal.components.length >= 4);
  });

  await t.test('buildServerStatsConfigModal constructs valid modal with template inputs', () => {
    const modal = buildServerStatsConfigModal({ member_template: 'Members: {members}' });
    assert.equal(modal.data.custom_id, CustomIds.ServerStatsConfigModalSubmit);
    assert.ok(modal.components.length >= 4);
  });

  await t.test('buildCustomCommandCreateModal and buildCustomCommandPrefixModal construct valid modals', () => {
    const createModal = buildCustomCommandCreateModal('!');
    assert.equal(createModal.data.custom_id, CustomIds.CustomCommandsCreateModalSubmit);
    assert.ok(createModal.components.length >= 4);

    const prefixModal = buildCustomCommandPrefixModal('!');
    assert.equal(prefixModal.data.custom_id, CustomIds.CustomCommandsPrefixModalSubmit);
    assert.ok(prefixModal.components.length >= 1);
  });

  await t.test('buildReferralsConfigModal constructs valid modal', () => {
    const modal = buildReferralsConfigModal({ referral_xp: 250 });
    assert.equal(modal.data.custom_id, CustomIds.ReferralsConfigModalSubmit);
    assert.ok(modal.components.length >= 1);
  });

  await t.test('buildScheduledMessageCreateModal constructs valid modal', () => {
    const modal = buildScheduledMessageCreateModal();
    assert.equal(modal.data.custom_id, CustomIds.ScheduledMessagesCreateModalSubmit);
    assert.ok(modal.components.length >= 3);
  });
});
