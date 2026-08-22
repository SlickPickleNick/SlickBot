const test = require('node:test');
const assert = require('node:assert/strict');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { CustomIds } = require('../../src/modules/ui/customIds');
const { MockDatabase } = require('../helpers/mockDb');
const {
  ONBOARDING_STEPS,
  CATEGORY_ONBOARDING_MAP,
  OnboardingService
} = require('../../src/modules/onboarding/onboardingService');
const {
  buildCategoryPanel,
  buildPermissionsPanel,
  buildLoggingPanel,
  buildSetupPanel
} = require('../../src/modules/ui/panels');
const { buildModerationPanel } = require('../../src/modules/moderation/moderationUi');
const {
  buildSupportPanel,
  buildTicketsPanel,
  buildReportsPanel,
  buildApplicationsPanel,
  buildAppealsPanel
} = require('../../src/modules/support/supportUi');
const { buildWelcomePanel } = require('../../src/modules/community/welcomeService');
const { buildRoleManagerPanel } = require('../../src/modules/community/rolePanelService');
const { GiveawayService } = require('../../src/modules/community/giveawayService');
const { BirthdayService } = require('../../src/modules/community/birthdayService');
const { LevelingService } = require('../../src/modules/community/levelingService');
const { CommunityGameService } = require('../../src/modules/community/gameService');
const { FaqService } = require('../../src/modules/community/faqService');
const { SuggestionService } = require('../../src/modules/community/suggestionService');
const { ReferralService } = require('../../src/modules/community/referralService');
const { AchievementService } = require('../../src/modules/community/achievementService');
const { ServerStatsService } = require('../../src/modules/community/serverStatsService');
const { CustomCommandService } = require('../../src/modules/custom/customCommandService');
const { JoinCreateService } = require('../../src/modules/voice/joinCreateService');
const { ScheduledMessageService } = require('../../src/modules/automation/scheduledMessageService');
const { BotUpdatesService } = require('../../src/modules/status/botUpdatesService');
const { SocialFeedService } = require('../../src/modules/automation/socialFeedService');
const { buildUtilityManagerPanel } = require('../../src/modules/utility/utilityUi');

const mockDb = new MockDatabase();

test('Setup Center: Category Panels render with interactive module selects and category onboarding', async (t) => {
  mockDb.install();
  t.after(() => mockDb.uninstall());

  const categories = ['CORE', 'SUPPORT', 'COMMUNITY', 'AUTOMATION'];
  for (const cat of categories) {
    const panel = await buildCategoryPanel('guild-123', cat);
    assert.ok(panel.embeds?.length > 0, `Category ${cat} should have embeds`);
    assert.ok(panel.components?.length >= 2, `Category ${cat} should have select and button rows`);

    // First component should be module select
    const selectMenu = panel.components[0]?.components?.[0];
    const customId = selectMenu?.data?.custom_id || selectMenu?.customId;
    const options = selectMenu?.options || selectMenu?.data?.options || [];
    assert.equal(customId, CustomIds.SetupModuleSelect);
    assert.ok(options.length > 0, `Category ${cat} should have module options`);

    // Second component should have Guided Setup button with category key
    const buttons = panel.components[1]?.components?.map((b) => b.data.custom_id);
    assert.ok(buttons.includes(`${CustomIds.OnboardingModulePrefix}${cat}`), `Category ${cat} should have Guided Setup button`);
    assert.ok(buttons.includes(CustomIds.SetupRefresh), `Category ${cat} should have Setup Center button`);
  }
});

test('Setup Center: ONBOARDING_STEPS covers all module keys and categories', () => {
  const onboarding = new OnboardingService();

  // All category composite workflows must be registered
  const categories = ['CORE', 'SUPPORT', 'COMMUNITY', 'AUTOMATION'];
  for (const cat of categories) {
    assert.ok(CATEGORY_ONBOARDING_MAP[cat]?.length > 0, `CATEGORY_ONBOARDING_MAP should have steps for ${cat}`);
    const session = onboarding.startModuleOnboarding('guild-123', 'user-123', cat);
    assert.ok(session, `startModuleOnboarding should succeed for category ${cat}`);
    assert.equal(session.type, 'CATEGORY_ONBOARDING');
    assert.equal(session.categoryKey, cat);
  }

  // All implemented modules must have registered steps
  const requiredModules = [
    ModuleKeys.PERMISSIONS,
    ModuleKeys.LOGGING,
    ModuleKeys.MODERATION,
    ModuleKeys.LOCKDOWN,
    ModuleKeys.TEMP_ROLES,
    ModuleKeys.UTILITY,
    ModuleKeys.TICKETS,
    ModuleKeys.REPORTS,
    ModuleKeys.APPLICATIONS,
    ModuleKeys.APPEALS,
    ModuleKeys.WELCOME,
    ModuleKeys.REACTION_ROLES,
    ModuleKeys.GIVEAWAYS,
    ModuleKeys.BIRTHDAYS,
    ModuleKeys.LEVELING,
    ModuleKeys.COMMUNITY_GAMES,
    ModuleKeys.FAQ,
    ModuleKeys.SUGGESTIONS,
    ModuleKeys.REFERRALS,
    ModuleKeys.ACHIEVEMENTS,
    ModuleKeys.SERVER_STATS,
    ModuleKeys.CUSTOM_COMMANDS,
    ModuleKeys.JOIN_TO_CREATE,
    ModuleKeys.SCHEDULED_MESSAGES,
    ModuleKeys.BOT_UPDATES,
    ModuleKeys.SOCIAL_FEEDS
  ];

  for (const mod of requiredModules) {
    assert.ok(ONBOARDING_STEPS[mod]?.length > 0, `ONBOARDING_STEPS should define steps for ${mod}`);
    const session = onboarding.startModuleOnboarding('guild-123', 'user-123', mod);
    assert.ok(session, `startModuleOnboarding should create session for ${mod}`);
    assert.equal(session.type, 'MODULE_ONBOARDING');
    assert.equal(session.moduleKey, mod);
  }
});

test('Core & Safety Panels: Include functional controls and return navigation', async (t) => {
  mockDb.install();
  t.after(() => mockDb.uninstall());

  // Permissions panel
  const permsPanel = await buildPermissionsPanel('guild-123');
  assert.ok(permsPanel.embeds?.length > 0);
  const permsCustomIds = permsPanel.components.flatMap((row) => row.components.map((c) => c.data.custom_id));
  assert.ok(permsCustomIds.includes(CustomIds.PermissionsSetAdminRole), 'Should have Admin Role selector');
  assert.ok(permsCustomIds.includes(CustomIds.PermissionsSetModRole), 'Should have Mod Role selector');
  assert.ok(permsCustomIds.includes(CustomIds.PermissionsApplyDefaults), 'Should have Apply Defaults button');
  assert.ok(permsCustomIds.includes(CustomIds.SetupCategoryCore), 'Should have Core & Safety button');
  assert.ok(permsCustomIds.includes(CustomIds.SetupRefresh), 'Should have Setup Center button');

  // Moderation panel
  const modPanel = await buildModerationPanel('guild-123');
  assert.ok(modPanel.embeds?.length > 0);
  const modCustomIds = modPanel.components.flatMap((row) => row.components.map((c) => c.data.custom_id));
  assert.ok(modCustomIds.includes(CustomIds.ModerationSetLogChannel), 'Should have Mod Log channel selector');
  assert.ok(modCustomIds.includes(CustomIds.SetupCategoryCore), 'Should have Core & Safety button');
  assert.ok(modCustomIds.includes(CustomIds.SetupRefresh), 'Should have Setup Center button');

  // Logging panel
  const logPanel = await buildLoggingPanel('guild-123');
  const logCustomIds = logPanel.components.flatMap((row) => row.components.map((c) => c.data.custom_id));
  assert.ok(logCustomIds.includes(CustomIds.SetupCategoryCore), 'Should have Core & Safety button');
  assert.ok(logCustomIds.includes(CustomIds.SetupRefresh), 'Should have Setup Center button');

  // Utility panel
  const utilPanel = await buildUtilityManagerPanel('guild-123');
  const utilCustomIds = utilPanel.components.flatMap((row) => row.components.map((c) => c.data.custom_id));
  assert.ok(utilCustomIds.includes(CustomIds.SetupCategoryCore), 'Should have Core & Safety button');
  assert.ok(utilCustomIds.includes(CustomIds.SetupRefresh), 'Should have Setup Center button');
});

test('Support Panels: Include review channel selectors and Support Systems return navigation', async (t) => {
  mockDb.install();
  t.after(() => mockDb.uninstall());

  // Support Overview panel
  const supportPanel = await buildSupportPanel('guild-123');
  const supIds = supportPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(supIds.includes(CustomIds.SetupCategorySupport));
  assert.ok(supIds.includes(CustomIds.SetupRefresh));

  // Tickets panel
  const ticketPanel = await buildTicketsPanel('guild-123');
  const tktIds = ticketPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(tktIds.includes(CustomIds.SetupCategorySupport));
  assert.ok(tktIds.includes(CustomIds.SetupRefresh));

  // Reports panel
  const reportPanel = await buildReportsPanel('guild-123');
  const rptIds = reportPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(rptIds.includes(CustomIds.ReportSetReviewChannel), 'Should have Review Channel selector');
  assert.ok(rptIds.includes(CustomIds.ReportSetPingRole), 'Should have Ping Role selector');
  assert.ok(rptIds.includes(CustomIds.SetupCategorySupport));
  assert.ok(rptIds.includes(CustomIds.SetupRefresh));

  // Applications panel
  const appPanel = await buildApplicationsPanel('guild-123');
  const appIds = appPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(appIds.includes(CustomIds.ApplicationSetReviewChannel), 'Should have Review Channel selector');
  assert.ok(appIds.includes(CustomIds.SetupCategorySupport));
  assert.ok(appIds.includes(CustomIds.SetupRefresh));

  // Appeals panel
  const appealPanel = await buildAppealsPanel('guild-123');
  const aplIds = appealPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(aplIds.includes(CustomIds.AppealSetReviewChannel), 'Should have Review Channel selector');
  assert.ok(aplIds.includes(CustomIds.AppealToggleDmDecisions), 'Should have DM Decisions toggle');
  assert.ok(aplIds.includes(CustomIds.SetupCategorySupport));
  assert.ok(aplIds.includes(CustomIds.SetupRefresh));
});

test('Community & Automation Panels: Include category return navigation and functional buttons', async (t) => {
  mockDb.install();
  t.after(() => mockDb.uninstall());

  // Welcome
  const welcomePanel = await buildWelcomePanel('guild-123');
  const welIds = welcomePanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(welIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(welIds.includes(CustomIds.SetupRefresh));

  // Role Panels
  const rolePanel = await buildRoleManagerPanel('guild-123');
  const rolIds = rolePanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(rolIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(rolIds.includes(CustomIds.SetupRefresh));

  // Giveaways
  const giveaways = new GiveawayService();
  const giveawayPanel = await giveaways.buildManagerPanel('guild-123');
  const givIds = giveawayPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(givIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(givIds.includes(CustomIds.SetupRefresh));

  // Birthdays
  const birthdays = new BirthdayService();
  const birthdayPanel = await birthdays.buildManagerPanel('guild-123');
  const bdayIds = birthdayPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(bdayIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(bdayIds.includes(CustomIds.SetupRefresh));

  // Leveling
  const leveling = new LevelingService();
  const lvlPanel = await leveling.buildManagerPanel('guild-123');
  const lvlIds = lvlPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(lvlIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(lvlIds.includes(CustomIds.SetupRefresh));

  // Community Games
  const games = new CommunityGameService();
  const gamePanel = await games.buildManagerPanel('guild-123');
  const gmeIds = gamePanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(gmeIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(gmeIds.includes(CustomIds.SetupRefresh));

  // FAQ
  const faq = new FaqService();
  const faqPanel = await faq.buildManagerPanel('guild-123');
  const faqIds = faqPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(faqIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(faqIds.includes(CustomIds.SetupRefresh));

  // Suggestions
  const suggestions = new SuggestionService();
  const sugPanel = await suggestions.buildManagerPanel('guild-123');
  const sugIds = sugPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(sugIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(sugIds.includes(CustomIds.SetupRefresh));

  // Referrals
  const referrals = new ReferralService();
  const refPanel = await referrals.buildManagerPanel('guild-123');
  const refIds = refPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(refIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(refIds.includes(CustomIds.SetupRefresh));

  // Achievements
  const achievements = new AchievementService();
  const achPanel = await achievements.buildManagerPanel('guild-123');
  const achIds = achPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(achIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(achIds.includes(CustomIds.SetupRefresh));

  // Server Stats
  const serverStats = new ServerStatsService();
  const statPanel = await serverStats.buildManagerPanel({ id: 'guild-123', memberCount: 50 });
  const statIds = statPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(statIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(statIds.includes(CustomIds.SetupRefresh));

  // Custom Commands
  const customCommands = new CustomCommandService();
  const cmdPanel = await customCommands.buildManagerPanel('guild-123');
  const cmdIds = cmdPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(cmdIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(cmdIds.includes(CustomIds.SetupRefresh));

  // Join to Create
  const joinCreate = new JoinCreateService();
  const jtcPanel = await joinCreate.buildManagerPanel({ id: 'guild-123' });
  const jtcIds = jtcPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(jtcIds.includes(CustomIds.SetupCategoryCommunity));
  assert.ok(jtcIds.includes(CustomIds.SetupRefresh));

  // Scheduled Messages
  const sched = new ScheduledMessageService();
  const schedPanel = await sched.buildManagerPanel('guild-123');
  const schIds = schedPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(schIds.includes(CustomIds.SetupCategoryAutomation));
  assert.ok(schIds.includes(CustomIds.SetupRefresh));

  // Bot Updates
  const botUpdates = new BotUpdatesService();
  const botPanel = await botUpdates.buildStatusPanel('guild-123');
  const botIds = botPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(botIds.includes(CustomIds.SetupCategoryAutomation));
  assert.ok(botIds.includes(CustomIds.SetupRefresh));

  // Social Feeds
  const socialFeeds = new SocialFeedService();
  const feedPanel = await socialFeeds.buildManagerPanel('guild-123');
  const fedIds = feedPanel.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.ok(fedIds.includes(CustomIds.SetupCategoryAutomation));
  assert.ok(fedIds.includes(CustomIds.SetupRefresh));
});
