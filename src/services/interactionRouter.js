const { ActionRowBuilder, MessageFlags, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { CustomIds } = require('../modules/ui/customIds');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { ModuleKeys, isCoreModule } = require('../modules/moduleRegistry');
const { query } = require('./db');
const { replyPrivate, acknowledgeQuietly } = require('../utils/reply');
const { buildSetupPanel, buildCategoryPanel, buildModulesPanel, buildModuleDetailPanel, buildLoggingPanel, buildTeamsPanel, buildPermissionsPanel, buildCommunityPanel } = require('../modules/ui/panels');
const { OnboardingService } = require('../modules/onboarding/onboardingService');
const {
  buildHelpPayload,
  buildCategoryHelpPayload,
  buildCommandHelpPayload,
  buildModuleHelpPayload,
  buildHelpSearchModal,
  handleHelpSearch
} = require('../modules/help/helpService');
const { buildModerationPanel, buildRecentCasesPanel } = require('../modules/moderation/moderationUi');
const { buildStatusPanel, buildStatusActivityTextModal } = require('../commands/status');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { updatePanelDesign } = require('../modules/panels/panelDesignService');
const { refreshPublishedPanel, refreshPublishedPanelFromResult, formatRefreshSummary } = require('../modules/panels/panelUpdateService');
const { parsePanelDesignModalId } = require('../modules/panels/panelModals');
const { ActivityTypeNames, PresenceStatus } = require('../modules/status/statusService');
const { buildSupportPanel, buildTicketsPanel, buildReportsPanel, buildApplicationsPanel, buildAppealsPanel } = require('../modules/support/supportUi');
const { buildWelcomePanel, buildWelcomeEditModal, getWelcomeConfig, upsertWelcomeConfig } = require('../modules/community/welcomeService');
const { GiveawayService, buildGiveawayStartModal, buildGiveawayConfigModal, parseDurationToMs } = require('../modules/community/giveawayService');
const { BirthdayService, buildBirthdayDayModal, buildBirthdayTimezoneModal, buildBirthdayEditModal, isValidDate } = require('../modules/community/birthdayService');
const { ScheduledMessageService, buildScheduledMessageCreateModal, parseDelay } = require('../modules/automation/scheduledMessageService');
const { ServerStatsService, buildServerStatsConfigModal } = require('../modules/community/serverStatsService');
const { LevelingService, buildLevelingConfigModal } = require('../modules/community/levelingService');
const { CommunityGameService, GAME_KEYS } = require('../modules/community/gameService');
const { FaqService } = require('../modules/community/faqService');
const { SuggestionService } = require('../modules/community/suggestionService');
const { ReferralService, buildReferralsConfigModal } = require('../modules/community/referralService');
const { TemporaryRoleService } = require('../modules/moderation/tempRoleService');
const { LockdownService, DEFAULT_PRESET } = require('../modules/safety/lockdownService');
const { SocialFeedService, PLATFORM_META } = require('../modules/automation/socialFeedService');
const {
  AutoModService,
  buildBlacklistAddModal
} = require('../modules/moderation/autoModService');
const {
  buildAutoModWizard,
  buildAutoModManagerPanel,
  buildThresholdTuneModal,
  buildDomainWhitelistModal
} = require('../modules/moderation/autoModUi');
const { BotUpdatesService } = require('../modules/status/botUpdatesService');
const { buildRoleManagerPanel, toggleRole } = require('../modules/community/rolePanelService');
const { JoinCreateService } = require('../modules/voice/joinCreateService');
const { CustomCommandService, buildCustomCommandCreateModal, buildCustomCommandPrefixModal } = require('../modules/custom/customCommandService');
const { UtilityService, DEFAULT_UTILITY_CONFIG } = require('../modules/utility/utilityService');
const {
  buildUtilityManagerPanel,
  buildUtilitySetupModal,
  buildEmbedComposerModal,
  buildEmbedFieldModal,
  buildEmbedPreviewPayload
} = require('../modules/utility/utilityUi');
const { StarboardService } = require('../modules/community/starboardService');
const {
  buildStarboardPanel,
  buildStarboardThresholdModal,
  buildStarboardEmojiModal
} = require('../modules/community/starboardUi');
const {
  TicketService,
  ReportService,
  ApplicationService,
  AppealService,
  buildTicketModal,
  buildReportModal,
  buildReportTargetPickerPayload,
  buildReportDetailsModal,
  buildReportReviewReasonModal,
  buildAppealModal,
  buildAppealReasonModal,
  buildApplicationReviewReasonModal,
  buildReportReviewPayload
} = require('../modules/support/supportService');
const { getSupportResetModule, resetSupportModule, buildSupportResetCompletePayload } = require('../modules/support/supportResetService');

const tickets = new TicketService();
const reports = new ReportService();
const applications = new ApplicationService();
const appeals = new AppealService();
const giveaways = new GiveawayService();
const birthdays = new BirthdayService();
const scheduledMessages = new ScheduledMessageService();
const serverStats = new ServerStatsService();
const leveling = new LevelingService();
const joinCreate = new JoinCreateService();
const customCommands = new CustomCommandService();
const communityGames = new CommunityGameService();
const faq = new FaqService();
const suggestions = new SuggestionService();
const referrals = new ReferralService();
const tempRoles = new TemporaryRoleService();
const lockdown = new LockdownService();
const socialFeeds = new SocialFeedService();
const autoMod = new AutoModService();
const botUpdates = new BotUpdatesService();
const onboarding = new OnboardingService();
const utility = new UtilityService();
const starboard = new StarboardService();

async function handleComponentInteraction(interaction, ctx) {
  if (!interaction.guildId) {
    if (interaction.isButton() && interaction.customId.startsWith(CustomIds.ApplicationCancelPrefix)) {
      const sessionId = interaction.customId.slice(CustomIds.ApplicationCancelPrefix.length);
      const session = await applications.cancelSession({ sessionId, user: interaction.user, logger: ctx.logger });
      if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Cancelled', 'This application session was not found or is no longer active.')] });
      await interaction.update({ embeds: [createSuccessEmbed('Application Cancelled', 'Your application was cancelled. Nothing was sent to the server.')], components: [] });
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith(CustomIds.ApplicationSubmitPrefix)) {
      const sessionId = interaction.customId.slice(CustomIds.ApplicationSubmitPrefix.length);
      const result = await applications.submitSession({ sessionId, user: interaction.user, client: ctx.client, logger: ctx.logger });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Submitted', result.reason)] });
      const confirmation = result.applicationType?.submission_confirmation_message || `Your ${result.applicationType?.name || 'application'} application was submitted as #${result.submission.submission_number}.`;
      await interaction.update({ embeds: [createSuccessEmbed('Application Submitted', confirmation.replaceAll('{number}', String(result.submission.submission_number)).replaceAll('{type}', result.applicationType?.name || 'application'))], components: [] });
      return true;
    }
    await replyPrivate(interaction, 'This control can only be used inside a server.');
    return true;
  }

  if (interaction.isButton()) return handleButton(interaction, ctx);
  if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) return handleSelect(interaction, ctx);
  if (interaction.isModalSubmit()) return handleModal(interaction, ctx);
  return false;
}

async function handleButton(interaction, ctx) {
  const id = interaction.customId;

  if (id === CustomIds.HelpRefresh) {
    await updatePanel(interaction, buildCategoryHelpPayload('MEMBER', 'member', 1));
    return true;
  }

  if (id.startsWith(CustomIds.HelpPagePrefix)) {
    const rest = id.slice(CustomIds.HelpPagePrefix.length);
    const [categoryKey, mode, pageStr] = rest.split(':');
    const targetPage = Number.parseInt(pageStr, 10) || 1;
    await updatePanel(interaction, buildCategoryHelpPayload(categoryKey, mode || 'all', targetPage));
    return true;
  }

  if (id.startsWith(CustomIds.HelpModePrefix)) {
    const rest = id.slice(CustomIds.HelpModePrefix.length);
    const parts = rest.split(':');
    let categoryKey = 'MEMBER';
    let mode = 'member';
    if (parts.length === 2) {
      categoryKey = parts[0];
      mode = parts[1];
    } else {
      mode = parts[0];
    }
    await updatePanel(interaction, buildCategoryHelpPayload(categoryKey, mode, 1));
    return true;
  }

  if (id === CustomIds.HelpSearchBtn) {
    await interaction.showModal(buildHelpSearchModal());
    return true;
  }


  if (id === CustomIds.GamePanelTicTacToe || id === CustomIds.GamePanelConnectFour) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.GamesPlay, ModuleKeys.COMMUNITY_GAMES))) return true;
    const gameKey = id === CustomIds.GamePanelTicTacToe ? GAME_KEYS.TIC_TAC_TOE : GAME_KEYS.CONNECT_FOUR;
    const label = gameKey === GAME_KEYS.TIC_TAC_TOE ? 'Tic-Tac-Toe' : 'Connect Four';
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`${CustomIds.GamePanelOpponentSelectPrefix}${gameKey}`)
        .setPlaceholder(`Choose a ${label} opponent`)
        .setMinValues(1)
        .setMaxValues(1)
    );
    await replyPrivate(interaction, {
      embeds: [createBaseEmbed({
        title: `Start ${label}`,
        description: 'Select the member you want to challenge. SlickBot will post the game challenge and send you a link to it.',
        color: SlickBotColors.INFO,
        footer: 'SlickBot Community Games'
      })],
      components: [row]
    });
    return true;
  }


  if (id === CustomIds.SuggestionSubmitOpen) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.SuggestionsSubmit, ModuleKeys.SUGGESTIONS))) return true;
    await interaction.showModal(suggestions.buildSubmitModal(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.SuggestionVoteUpPrefix) || id.startsWith(CustomIds.SuggestionVoteDownPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.SuggestionsVote, ModuleKeys.SUGGESTIONS))) return true;
    const isUp = id.startsWith(CustomIds.SuggestionVoteUpPrefix);
    const suggestionId = id.slice((isUp ? CustomIds.SuggestionVoteUpPrefix : CustomIds.SuggestionVoteDownPrefix).length);
    const result = await suggestions.vote({ guild: interaction.guild, suggestionId, user: interaction.user, voteType: isUp ? 'UP' : 'DOWN' }).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }));
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Vote Not Counted', result.reason || 'SlickBot could not update this vote.')], deleteAfterSeconds: 10 });
    await acknowledgeQuietly(interaction);
    return true;
  }

  if (id.startsWith(CustomIds.SuggestionReviewStatusPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.SuggestionsReview, ModuleKeys.SUGGESTIONS))) return true;
    const rest = id.slice(CustomIds.SuggestionReviewStatusPrefix.length);
    const [suggestionId, status] = rest.split(':');
    await interaction.showModal(suggestions.buildDetailsModal(suggestionId, status));
    return true;
  }

  if (id.startsWith(CustomIds.SuggestionReviewAddDetailsPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.SuggestionsReview, ModuleKeys.SUGGESTIONS))) return true;
    const suggestionId = id.slice(CustomIds.SuggestionReviewAddDetailsPrefix.length);
    await interaction.showModal(suggestions.buildDetailsModal(suggestionId));
    return true;
  }

  if (id.startsWith(CustomIds.SuggestionReviewRevealPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.SuggestionsReveal, ModuleKeys.SUGGESTIONS))) return true;
    const suggestionId = id.slice(CustomIds.SuggestionReviewRevealPrefix.length);
    const result = await suggestions.buildRevealPayload(interaction.guild, suggestionId);
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Suggestion Not Found', result.reason || 'This suggestion could not be found.')] });
    await replyPrivate(interaction, result.payload);
    return true;
  }

  if (id.startsWith(CustomIds.SuggestionReviewIndexFilterPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.SuggestionsReview, ModuleKeys.SUGGESTIONS))) return true;
    const rest = id.slice(CustomIds.SuggestionReviewIndexFilterPrefix.length);
    const [indexId, statusFilter] = rest.split(':');
    await interaction.deferUpdate().catch(() => {});
    const index = await suggestions.updateReviewIndexFilter({ guildId: interaction.guildId, indexId, statusFilter });
    if (!index) {
      await interaction.followUp({ embeds: [createWarningEmbed('Review Index Not Found', 'This suggestion review index could not be found.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    await suggestions.refreshReviewIndex({ client: ctx.client, index }).catch(() => {});
    return true;
  }

  if (id.startsWith(CustomIds.GameChallengeAcceptPrefix) || id.startsWith(CustomIds.GameChallengeDeclinePrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.GamesPlay, ModuleKeys.COMMUNITY_GAMES))) return true;
    const accepting = id.startsWith(CustomIds.GameChallengeAcceptPrefix);
    const prefix = accepting ? CustomIds.GameChallengeAcceptPrefix : CustomIds.GameChallengeDeclinePrefix;
    const sessionId = id.slice(prefix.length);
    try {
      const result = await communityGames.handleChallengeDecision({ sessionId, userId: interaction.user.id, accept: accepting });
      if (result.accepted) {
        await updatePanel(interaction, communityGames.buildSessionPayload(result.session));
        await ctx.logger.log({
          guildId: interaction.guildId,
          eventKey: 'community-game-started',
          title: `${result.session.game_key === GAME_KEYS.TIC_TAC_TOE ? 'Tic-Tac-Toe' : 'Connect Four'} Started`,
          body: `Players: <@${result.session.player_one_id}> vs. <@${result.session.player_two_id}>\nChannel: <#${interaction.channelId}>`,
          actorUserId: interaction.user.id,
          metadata: { game: result.session.game_key, sessionId }
        }).catch(() => {});
      } else {
        await updatePanel(interaction, communityGames.buildClosedChallengePayload(result.session));
      }
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Game Challenge Not Updated', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
    }
    return true;
  }

  if (id.startsWith(CustomIds.GameTicTacToeMovePrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.GamesPlay, ModuleKeys.COMMUNITY_GAMES))) return true;
    const rest = id.slice(CustomIds.GameTicTacToeMovePrefix.length);
    const separator = rest.lastIndexOf(':');
    const sessionId = rest.slice(0, separator);
    const cell = Number(rest.slice(separator + 1));
    try {
      const result = await communityGames.makeTicTacToeMove({ sessionId, userId: interaction.user.id, cell });
      await updatePanel(interaction, communityGames.buildSessionPayload(result.session));
      if (result.won || result.draw) {
        const xpAwards = await communityGames.awardBoardGameCompletionXp({ guild: interaction.guild, channel: interaction.channel, session: result.session, draw: result.draw, logger: ctx.logger });
        await logCompletedCommunityGame(ctx, interaction, result.session, result.draw, xpAwards);
      }
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Tic-Tac-Toe Move Not Accepted', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
    }
    return true;
  }

  if (id.startsWith(CustomIds.GameConnectFourMovePrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.GamesPlay, ModuleKeys.COMMUNITY_GAMES))) return true;
    const rest = id.slice(CustomIds.GameConnectFourMovePrefix.length);
    const separator = rest.lastIndexOf(':');
    const sessionId = rest.slice(0, separator);
    const column = Number(rest.slice(separator + 1));
    try {
      const result = await communityGames.makeConnectFourMove({ sessionId, userId: interaction.user.id, column });
      await updatePanel(interaction, communityGames.buildSessionPayload(result.session));
      if (result.won || result.draw) {
        const xpAwards = await communityGames.awardBoardGameCompletionXp({ guild: interaction.guild, channel: interaction.channel, session: result.session, draw: result.draw, logger: ctx.logger });
        await logCompletedCommunityGame(ctx, interaction, result.session, result.draw, xpAwards);
      }
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Connect Four Move Not Accepted', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
    }
    return true;
  }

  if (id.startsWith(CustomIds.TicketReviewIndexFilterPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsReview, ModuleKeys.TICKETS))) return true;
    const rest = id.slice(CustomIds.TicketReviewIndexFilterPrefix.length);
    const [indexId, statusFilter] = rest.split(':');
    await interaction.deferUpdate();
    const index = await tickets.updateReviewIndexFilter({ guildId: interaction.guildId, indexId, statusFilter });
    if (!index) {
      await interaction.followUp({ embeds: [createWarningEmbed('Review Index Not Found', 'This ticket review index could not be found.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    await tickets.refreshReviewIndex({ client: ctx.client, index }).catch(() => {});
    return true;
  }

  if (id.startsWith(CustomIds.AppealReviewIndexFilterPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AppealsReview, ModuleKeys.APPEALS))) return true;
    const rest = id.slice(CustomIds.AppealReviewIndexFilterPrefix.length);
    const [indexId, statusFilter] = rest.split(':');
    await interaction.deferUpdate();
    const index = await appeals.updateReviewIndexFilter({ guildId: interaction.guildId, indexId, statusFilter });
    if (!index) {
      await interaction.followUp({ embeds: [createWarningEmbed('Review Index Not Found', 'This appeal review index could not be found.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    await appeals.refreshReviewIndex({ client: ctx.client, index }).catch(() => {});
    return true;
  }

  if (id.startsWith(CustomIds.ReportReviewIndexFilterPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsReview, ModuleKeys.REPORTS))) return true;
    const rest = id.slice(CustomIds.ReportReviewIndexFilterPrefix.length);
    const [indexId, statusFilter] = rest.split(':');
    await interaction.deferUpdate();
    const index = await reports.updateReviewIndexFilter({ guildId: interaction.guildId, indexId, statusFilter });
    if (!index) {
      await interaction.followUp({ embeds: [createWarningEmbed('Review Index Not Found', 'This report review index could not be found.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    await reports.refreshReviewIndex({ client: ctx.client, index }).catch(() => {});
    return true;
  }

  if (id === CustomIds.HelpRefresh || id === CustomIds.HelpEnabled) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Help, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildHelpPayload(interaction, ctx, { mode: 'enabled' }));
    return true;
  }

  if (id === CustomIds.HelpDisabled) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Help, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildHelpPayload(interaction, ctx, { mode: 'disabled' }));
    return true;
  }


  if (id === CustomIds.LockdownRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LockdownView, ModuleKeys.LOCKDOWN))) return true;
    await updatePanel(interaction, await lockdown.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.LockdownResetCancelPrefix)) {
    const requestedByUserId = id.slice(CustomIds.LockdownResetCancelPrefix.length);
    if (requestedByUserId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Not Yours', 'Only the user who opened this reset confirmation can cancel it.')] });
      return true;
    }
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Lockdown Reset Cancelled', 'No Lockdown setup was changed.')], components: [] });
    return true;
  }

  if (id.startsWith(CustomIds.LockdownResetConfirmPrefix)) {
    const requestedByUserId = id.slice(CustomIds.LockdownResetConfirmPrefix.length);
    if (requestedByUserId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Not Yours', 'Only the user who opened this reset confirmation can confirm it.')] });
      return true;
    }
    if (!(await requireAction(interaction, ctx, ActionKeys.LockdownReset, ModuleKeys.LOCKDOWN))) return true;
    const result = await lockdown.resetModule(interaction.guildId);
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Lockdown Reset Blocked', result.reason)] });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'lockdown-config', title: 'Lockdown Module Reset', body: `Lockdown setup was reset by ${interaction.user.tag}.`, actorUserId: interaction.user.id, metadata: { before: result.before } }).catch(() => {});
    await updatePanel(interaction, lockdown.buildResetCompletePayload(result));
    return true;
  }

  if (id.startsWith(CustomIds.SuggestionResetCancelPrefix)) {
    const requestedByUserId = id.slice(CustomIds.SuggestionResetCancelPrefix.length);
    if (requestedByUserId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Not Yours', 'Only the user who opened this reset confirmation can cancel it.')] });
      return true;
    }
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Suggestions Reset Cancelled', 'No Suggestions data was changed.')], components: [] });
    return true;
  }

  if (id.startsWith(CustomIds.SuggestionResetConfirmPrefix)) {
    const requestedByUserId = id.slice(CustomIds.SuggestionResetConfirmPrefix.length);
    if (requestedByUserId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Not Yours', 'Only the user who opened this reset confirmation can confirm it.')] });
      return true;
    }
    if (!(await requireAction(interaction, ctx, ActionKeys.SuggestionsReset, ModuleKeys.SUGGESTIONS))) return true;
    const result = await suggestions.resetModule(interaction.guildId);
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Suggestions Module Reset', body: `Suggestions module data was reset by ${interaction.user.tag}.`, actorUserId: interaction.user.id, metadata: { before: result.before } }).catch(() => {});
    await updatePanel(interaction, suggestions.buildResetCompletePayload(result));
    return true;
  }

  if (id.startsWith(CustomIds.FeedsResetCancelPrefix)) {
    const requestedByUserId = id.slice(CustomIds.FeedsResetCancelPrefix.length);
    if (requestedByUserId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Not Yours', 'Only the user who opened this reset confirmation can cancel it.')] });
      return true;
    }
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Social Feeds Reset Cancelled', 'No Social Feeds data was changed.')], components: [] });
    return true;
  }

  if (id.startsWith(CustomIds.FeedsResetConfirmPrefix)) {
    const requestedByUserId = id.slice(CustomIds.FeedsResetConfirmPrefix.length);
    if (requestedByUserId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Not Yours', 'Only the user who opened this reset confirmation can confirm it.')] });
      return true;
    }
    if (!(await requireAction(interaction, ctx, ActionKeys.FeedsReset, ModuleKeys.SOCIAL_FEEDS))) return true;
    const result = await socialFeeds.resetModule(interaction.guildId, ctx.client);
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Social Feeds Module Reset', body: `Social Feeds module data was reset by ${interaction.user.tag}.`, actorUserId: interaction.user.id, metadata: { before: result.before } }).catch(() => {});
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Social Feeds Reset Complete', 'All tracked social feeds and configurations have been cleared.')], components: [] });
    return true;
  }

  if (id === CustomIds.FeedsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.FeedsManage, ModuleKeys.SOCIAL_FEEDS))) return true;
    await updatePanel(interaction, await socialFeeds.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.FeedsCheckNow) {
    if (!(await requireAction(interaction, ctx, ActionKeys.FeedsCheck, ModuleKeys.SOCIAL_FEEDS))) return true;
    await interaction.deferUpdate().catch(() => {});
    await socialFeeds.checkGuildFeeds(interaction.guildId, ctx.client, ctx.logger);
    await updatePanel(interaction, await socialFeeds.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.FeedsToggleAlertsPrefix)) {
    const feedId = id.slice(CustomIds.FeedsToggleAlertsPrefix.length);
    const result = await socialFeeds.toggleSubscription(interaction.guildId, feedId, interaction.user.id, interaction.member);
    if (!result.ok) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Alerts', result.reason || 'Feed not found.')] });
      return true;
    }
    const meta = PLATFORM_META[result.feed.platform] || { icon: '🌐', label: result.feed.platform };
    const roleNotice = result.roleId ? (result.roleAssigned ? `\nRole assigned: <@&${result.roleId}>` : result.roleRemoved ? `\nRole removed: <@&${result.roleId}>` : '') : '';
    if (result.subscribed) {
      await replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Alerts Enabled', `🔔 You will now receive notifications when ${meta.icon} **${result.feed.account_name}** (${meta.label}) goes live or posts new content!${roleNotice}`)]
      });
    } else {
      await replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Alerts Muted', `🔕 You have unsubscribed from notifications for ${meta.icon} **${result.feed.account_name}** (${meta.label}).${roleNotice}`)]
      });
    }
    return true;
  }

  if (id.startsWith(CustomIds.FeedsLiveDirectoryRefreshPrefix)) {
    const payload = await socialFeeds.buildLiveDirectoryPayload(interaction.guildId, ctx.client);
    await interaction.update(payload).catch(async () => {
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Live Directory Refreshed', 'Live stream status directory refreshed!')] });
    });
    return true;
  }

  if (id === CustomIds.UtilityRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.UtilityView, ModuleKeys.UTILITY))) return true;
    await updatePanel(interaction, await buildUtilityManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.UtilitySetupModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.UtilityManage, ModuleKeys.UTILITY))) return true;
    const cfg = await utility.getConfig(interaction.guildId);
    await interaction.showModal(buildUtilitySetupModal(cfg));
    return true;
  }

  if (id.startsWith(CustomIds.UtilityToggleFeaturePrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.UtilityManage, ModuleKeys.UTILITY))) return true;
    const feature = id.slice(CustomIds.UtilityToggleFeaturePrefix.length);
    const cfg = await utility.getConfig(interaction.guildId);
    const key = `${feature}_enabled`;
    if (key in cfg) {
      await utility.upsertConfig(interaction.guildId, { [key]: !cfg[key] });
    }
    await updatePanel(interaction, await buildUtilityManagerPanel(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.UtilityResetConfirmPrefix)) {
    const guildId = id.slice(CustomIds.UtilityResetConfirmPrefix.length);
    if (!(await requireAction(interaction, ctx, ActionKeys.UtilityReset, ModuleKeys.UTILITY))) return true;
    await query(`DELETE FROM utility_reminders WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM utility_polls WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM utility_afk_users WHERE guild_id = $1`, [guildId]);
    await utility.upsertConfig(guildId, DEFAULT_UTILITY_CONFIG);
    await updatePanel(interaction, {
      embeds: [createSuccessEmbed('Utility Module Reset', 'All utility settings, polls, reminders, and AFK records have been reset.')],
      components: []
    });
    return true;
  }

  if (id.startsWith(CustomIds.UtilityResetCancelPrefix)) {
    await updatePanel(interaction, {
      embeds: [createSuccessEmbed('Reset Cancelled', 'No utility module data was modified.')],
      components: []
    });
    return true;
  }

  if (id.startsWith(CustomIds.UtilityEmojiPagePrefix)) {
    const pageNum = parseInt(id.slice(CustomIds.UtilityEmojiPagePrefix.length), 10) || 1;
    const payload = await utility.buildEmojiListPayload(interaction.guild, pageNum);
    await interaction.update(payload).catch(async () => {
      await replyPrivate(interaction, payload);
    });
    return true;
  }

  if (id.startsWith(CustomIds.UtilityStickerPagePrefix)) {
    const pageNum = parseInt(id.slice(CustomIds.UtilityStickerPagePrefix.length), 10) || 1;
    const payload = await utility.buildStickerListPayload(interaction.guild, pageNum);
    await interaction.update(payload).catch(async () => {
      await replyPrivate(interaction, payload);
    });
    return true;
  }

  if (id === CustomIds.UtilityShowStickers) {
    const payload = await utility.buildStickerListPayload(interaction.guild, 1);
    await interaction.update(payload).catch(async () => {
      await replyPrivate(interaction, payload);
    });
    return true;
  }

  if (id === CustomIds.UtilityShowEmojis) {
    const payload = await utility.buildEmojiListPayload(interaction.guild, 1);
    await interaction.update(payload).catch(async () => {
      await replyPrivate(interaction, payload);
    });
    return true;
  }

  // --- Auto-Mod & Anti-Raid Interactions ---

  if (id === CustomIds.AutoModSetupWizard) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    await updatePanel(interaction, await buildAutoModWizard(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.AutoModPresetPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    const presetKey = id.slice(CustomIds.AutoModPresetPrefix.length);
    const result = await autoMod.applyPreset(interaction.guildId, presetKey);
    if (!result.ok) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Preset Failed', result.reason || 'Could not apply preset.')] });
      return true;
    }

    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'automod-preset',
      title: 'Auto-Mod Preset Applied',
      body: `Applied preset **${result.preset}** by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id
    }).catch(() => {});

    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'FILTERS'));
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Preset Activated', `Successfully configured Auto-Mod with **${result.preset}** settings.`)] });
    return true;
  }

  if (id === CustomIds.AutoModManager || id === CustomIds.AutoModRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModView, ModuleKeys.AUTOMOD))) return true;
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'FILTERS'));
    return true;
  }

  if (id.startsWith(CustomIds.AutoModTabPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModView, ModuleKeys.AUTOMOD))) return true;
    const tab = id.slice(CustomIds.AutoModTabPrefix.length);
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, tab));
    return true;
  }

  if (id.startsWith(CustomIds.AutoModSetActionPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    const payload = id.slice(CustomIds.AutoModSetActionPrefix.length);
    const [ruleKey, action] = payload.split(':');
    const updates = {};
    if (ruleKey === 'default_blacklist') {
      updates.word_blacklist_action = action;
    } else {
      updates[`${ruleKey}_action`] = action;
    }
    await autoMod.upsertConfig(interaction.guildId, updates);
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'FILTERS', ruleKey));
    return true;
  }

  if (id.startsWith(CustomIds.AutoModThresholdEditPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    const ruleKey = id.slice(CustomIds.AutoModThresholdEditPrefix.length);
    const config = await autoMod.getConfig(interaction.guildId);
    await interaction.showModal(buildThresholdTuneModal(ruleKey, config));
    return true;
  }

  if (id === CustomIds.AutoModDomainAddModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModWhitelist, ModuleKeys.AUTOMOD))) return true;
    await interaction.showModal(buildDomainWhitelistModal());
    return true;
  }

  if (id.startsWith(CustomIds.SetupOpenManagerPrefix)) {
    const moduleKey = id.slice(CustomIds.SetupOpenManagerPrefix.length);
    return routeModuleToManager(interaction, ctx, moduleKey);
  }

  if (id.startsWith(CustomIds.AutoModToggleRulePrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    const ruleKey = id.slice(CustomIds.AutoModToggleRulePrefix.length);
    const config = await autoMod.getConfig(interaction.guildId);

    const updates = {};
    if (ruleKey === 'master') {
      updates.enabled = !config.enabled;
    } else if (ruleKey === 'default_blacklist') {
      updates.default_blacklist_enabled = !config.default_blacklist_enabled;
    } else {
      const current = config[`${ruleKey}_enabled`];
      updates[`${ruleKey}_enabled`] = !current;
    }

    await autoMod.upsertConfig(interaction.guildId, updates);
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, ruleKey === 'default_blacklist' ? 'BLACKLIST' : 'FILTERS', ruleKey === 'master' ? null : ruleKey));
    return true;
  }

  if (id === CustomIds.AutoModBlacklistAddModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModBlacklist, ModuleKeys.AUTOMOD))) return true;
    await interaction.showModal(buildBlacklistAddModal());
    return true;
  }

  if (id === CustomIds.AutoModRaidShieldToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModRaid, ModuleKeys.AUTOMOD))) return true;
    const config = await autoMod.getConfig(interaction.guildId);
    await autoMod.upsertConfig(interaction.guildId, { raid_shield_enabled: !config.raid_shield_enabled });
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'RAID'));
    return true;
  }

  if (id === CustomIds.AutoModTimeoutRoleCreate) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    await interaction.deferUpdate().catch(() => {});
    const res = await autoMod.createTimeoutRole(interaction.guild);
    if (!res.ok) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Role Creation Failed', res.reason || 'Could not create timeout role.')] });
      return true;
    }
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'TIMEOUT'));
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Timeout Role Ready', `Created and synced <@&${res.role.id}> across server channels (with Appeals & Ticket exemptions).`)] });
    return true;
  }

  if (id === CustomIds.AutoModTimeoutRoleSync) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    await interaction.deferUpdate().catch(() => {});
    const res = await autoMod.syncTimeoutRolePermissions(interaction.guild);
    if (!res.ok) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Channel Sync Failed', res.reason || 'Could not sync timeout role permissions.')] });
      return true;
    }
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'TIMEOUT'));
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Permissions Synced', `Updated permissions across **${res.syncedChannelsCount} channel(s)** (exempted **${res.exemptCount} channel(s)**).`)] });
    return true;
  }

  if (id === CustomIds.AutoModTimeoutRoleModeToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    await interaction.deferUpdate().catch(() => {});
    const config = await autoMod.getConfig(interaction.guildId);
    const nextMode = (config.timeout_role_mode || 'HIDE') === 'HIDE' ? 'MUTE_ONLY' : 'HIDE';
    await autoMod.upsertConfig(interaction.guildId, { timeout_role_mode: nextMode });
    if (config.timeout_role_id) {
      await autoMod.syncTimeoutRolePermissions(interaction.guild, { mode: nextMode });
    }
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'TIMEOUT'));
    return true;
  }

  if (id === CustomIds.AutoModTimeoutRoleLockToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    const config = await autoMod.getConfig(interaction.guildId);
    const nextVal = config.timeout_role_lock_new_channels === false;
    await autoMod.upsertConfig(interaction.guildId, { timeout_role_lock_new_channels: nextVal });
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'TIMEOUT'));
    return true;
  }

  if (id === CustomIds.AutoModTimeoutRoleClear) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    await autoMod.upsertConfig(interaction.guildId, { timeout_role_id: null });
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'TIMEOUT'));
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Timeout Role Cleared', 'Detached timeout role from Auto-Mod and Moderation.')] });
    return true;
  }

  if (id.startsWith(CustomIds.AutoModRaidDismissPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModView, ModuleKeys.AUTOMOD))) return true;
    await updatePanel(interaction, {
      embeds: [createSuccessEmbed('Raid Alert Dismissed', `Alert dismissed by <@${interaction.user.id}>. Server status normal.`)],
      components: []
    });
    return true;
  }

  if (id.startsWith(CustomIds.AutoModRaidLockdownPromptPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModEnactLockdown, ModuleKeys.AUTOMOD))) return true;
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModRaidLockdownConfirmPrefix}${interaction.guildId}`)
        .setLabel('Confirm Emergency Lockdown')
        .setEmoji('🚨')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModRaidDismissPrefix}${interaction.guildId}`)
        .setLabel('Cancel / Dismiss')
        .setStyle(ButtonStyle.Secondary)
    );

    await replyPrivate(interaction, {
      embeds: [
        createWarningEmbed(
          '🚨 Confirm Emergency Lockdown',
          `Are you sure you want to initiate an emergency lockdown for **${interaction.guild.name}**?\n\nThis will lock down all controlled channels in the \`${DEFAULT_PRESET}\` preset to stop raid activity.`
        )
      ],
      components: [confirmRow]
    });
    return true;
  }

  if (id.startsWith(CustomIds.AutoModRaidLockdownConfirmPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LockdownManage, ModuleKeys.LOCKDOWN))) return true;
    const result = await lockdown.startLockdown({
      guild: interaction.guild,
      presetName: DEFAULT_PRESET,
      actorUser: interaction.user,
      reason: '[Anti-Raid] Moderator initiated emergency lockdown due to detected join surge.',
      logger: ctx.logger
    });

    if (!result.ok) {
      await updatePanel(interaction, {
        embeds: [createErrorEmbed('Lockdown Failed', result.reason || 'Could not start lockdown.')],
        components: []
      });
      return true;
    }

    await updatePanel(interaction, {
      embeds: [
        createSuccessEmbed(
          '🚨 Emergency Lockdown Activated',
          `Successfully enacted emergency lockdown across **${result.session.channel_count} channel(s)** by <@${interaction.user.id}>.\nUse \`/lockdown end\` to restore normal permissions once safe.`
        )
      ],
      components: []
    });
    return true;
  }

  if (id.startsWith(CustomIds.AutoModResetConfirmPrefix)) {
    const requestedByUserId = id.slice(CustomIds.AutoModResetConfirmPrefix.length);
    if (requestedByUserId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Not Yours', 'Only the user who opened this reset confirmation can confirm it.')] });
      return true;
    }
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModReset, ModuleKeys.AUTOMOD))) return true;
    await autoMod.resetModule(interaction.guildId);
    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'automod-reset',
      title: 'Auto-Mod Reset',
      body: `Auto-Mod settings and custom blacklists were reset to default by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id
    }).catch(() => {});
    await updatePanel(interaction, {
      embeds: [createSuccessEmbed('Auto-Mod Reset Complete', 'Successfully reset all Auto-Mod rules, blacklists, and exemptions back to server defaults.')],
      components: []
    });
    return true;
  }

  if (id.startsWith(CustomIds.AutoModResetCancelPrefix)) {
    await updatePanel(interaction, {
      embeds: [createSuccessEmbed('Reset Cancelled', 'Auto-Mod settings were not changed.')],
      components: []
    });
    return true;
  }

  // --- Starboard Interactions ---

  if (id === CustomIds.StarboardManager || id === CustomIds.StarboardRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardView, ModuleKeys.STARBOARD))) return true;
    await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, 'OVERVIEW'));
    return true;
  }

  if (id.startsWith(CustomIds.StarboardTabPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardView, ModuleKeys.STARBOARD))) return true;
    const tab = id.slice(CustomIds.StarboardTabPrefix.length);
    await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, tab));
    return true;
  }

  if (id === CustomIds.StarboardThresholdModalOpen) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    const config = await starboard.getConfig(interaction.guildId);
    await interaction.showModal(buildStarboardThresholdModal(config));
    return true;
  }

  if (id === CustomIds.StarboardEmojiModalOpen) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    const config = await starboard.getConfig(interaction.guildId);
    await interaction.showModal(buildStarboardEmojiModal(config));
    return true;
  }

  if (id === CustomIds.StarboardToggleSelfStar) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    const config = await starboard.getConfig(interaction.guildId);
    await starboard.upsertConfig(interaction.guildId, { allow_self_star: !config.allow_self_star });
    await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, 'OVERVIEW'));
    return true;
  }

  if (id === CustomIds.StarboardToggleNsfw) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    const config = await starboard.getConfig(interaction.guildId);
    await starboard.upsertConfig(interaction.guildId, { allow_nsfw: !config.allow_nsfw });
    await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, 'OVERVIEW'));
    return true;
  }

  if (id === CustomIds.StarboardToggleEnabled) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    const config = await starboard.getConfig(interaction.guildId);
    await starboard.upsertConfig(interaction.guildId, { enabled: !config.enabled });
    await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, 'OVERVIEW'));
    return true;
  }

  if (id.startsWith(CustomIds.StarboardResetConfirmPrefix)) {
    const requestedGuildId = id.slice(CustomIds.StarboardResetConfirmPrefix.length);
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardReset, ModuleKeys.STARBOARD))) return true;
    await starboard.resetConfig(requestedGuildId);
    await ctx.logger.log({
      guildId: requestedGuildId,
      eventKey: 'starboard-reset',
      title: 'Starboard Reset',
      body: `Starboard configuration and history reset by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id
    }).catch(() => {});
    await updatePanel(interaction, {
      embeds: [createSuccessEmbed('Starboard Reset', 'Successfully reset Starboard configuration and cleared pinned entries.')],
      components: []
    });
    return true;
  }

  if (id.startsWith(CustomIds.StarboardResetCancelPrefix)) {
    await updatePanel(interaction, {
      embeds: [createSuccessEmbed('Reset Cancelled', 'Starboard settings were not changed.')],
      components: []
    });
    return true;
  }

  // --- Giveaway Interactions ---

  if (id.startsWith(CustomIds.GiveawaysEnterPrefix)) {
    const giveawayId = id.slice(CustomIds.GiveawaysEnterPrefix.length);
    const result = await giveaways.enterGiveaway({ interaction, giveawayId, logger: ctx.logger });
    if (!result.ok) {
      await replyPrivate(interaction, {
        embeds: [createWarningEmbed('Entry Denied', result.reason)],
        deleteAfterSeconds: 12
      });
      return true;
    }

    if (result.alreadyEntered) {
      await replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Already Entered', `You are already entered in Giveaway #${result.giveaway.giveaway_number} for **${result.giveaway.prize}**! 🎉`)],
        deleteAfterSeconds: 8
      });
      return true;
    }

    await giveaways.refreshGiveawayMessage(ctx.client, interaction.guildId, giveawayId).catch(() => {});
    await replyPrivate(interaction, {
      embeds: [createSuccessEmbed('Entry Confirmed! 🎉', `You have successfully entered Giveaway #${result.giveaway.giveaway_number} for **${result.giveaway.prize}**! Good luck!`)],
      deleteAfterSeconds: 8
    });
    return true;
  }

  if (id === CustomIds.GiveawaysRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysView, ModuleKeys.GIVEAWAYS))) return true;
    await updatePanel(interaction, await giveaways.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.GiveawaysQuickStart) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysCreate, ModuleKeys.GIVEAWAYS))) return true;
    await interaction.showModal(buildGiveawayStartModal());
    return true;
  }

  if (id === CustomIds.GiveawaysConfigModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysConfigure, ModuleKeys.GIVEAWAYS))) return true;
    const config = await giveaways.getConfig(interaction.guildId);
    await interaction.showModal(buildGiveawayConfigModal(config));
    return true;
  }

  if (id.startsWith(CustomIds.PollVotePrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.UtilityPollVote, ModuleKeys.UTILITY))) return true;
    const payload = id.slice(CustomIds.PollVotePrefix.length);
    const [pollId, optionId] = payload.split(':');
    try {
      const pollState = await utility.handleVote(pollId, optionId, interaction.user.id);
      const updatedPayload = utility.buildPollPayload(pollState.poll, pollState.options, pollState.totalVotes, pollState.userVotes);
      await interaction.update(updatedPayload);
    } catch (err) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Vote Failed', err.message || 'Could not record vote.')] });
    }
    return true;
  }

  if (id.startsWith(CustomIds.PollEndPrefix)) {
    const pollId = id.slice(CustomIds.PollEndPrefix.length);
    const pollState = await utility.getPollState(pollId);
    if (!pollState) return true;
    const hasManage = await ctx.permissions.canPerform(interaction.guildId, interaction.member, ActionKeys.UtilityPollManage);
    const isCreator = pollState.poll.creator_user_id === interaction.user.id;
    if (!hasManage && !isCreator) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Access Denied', 'Only the poll creator or staff can end this poll.')] });
      return true;
    }
    const closed = await utility.closePoll(pollId, ctx.client, interaction.user);
    if (closed) {
      const updatedPayload = utility.buildPollPayload(closed.poll, closed.options, closed.totalVotes, []);
      await interaction.update(updatedPayload);
    }
    return true;
  }

  if (id.startsWith(CustomIds.ReminderCancelPrefix)) {
    const remId = id.slice(CustomIds.ReminderCancelPrefix.length);
    const cancelled = await utility.cancelReminder(remId, interaction.user.id);
    if (cancelled) {
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Reminder Cancelled', `Reminder \`${remId}\` was cancelled.`)] });
    }
    return true;
  }

  if (id.startsWith(CustomIds.EmbedSendPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.UtilityEmbedCreate, ModuleKeys.UTILITY))) return true;
    const payload = id.slice(CustomIds.EmbedSendPrefix.length);
    const [channelId, rolePingId] = payload.split(':');
    const targetChannel = await ctx.client.channels.fetch(channelId).catch(() => null);
    if (!targetChannel) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Channel Not Found', 'The target channel could not be found.')] });
      return true;
    }
    const embedToPublish = interaction.message.embeds[1] || interaction.message.embeds[0];
    if (!embedToPublish) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('No Embed Found', 'No embed was found to send.')] });
      return true;
    }
    const msgPayload = { embeds: [embedToPublish] };
    if (rolePingId) msgPayload.content = `<@&${rolePingId}>`;
    await targetChannel.send(msgPayload);
    await interaction.update({
      embeds: [createSuccessEmbed('🚀 Embed Published', `Your embed was successfully sent to <#${channelId}>!`)],
      components: []
    });
    return true;
  }

  if (id.startsWith(CustomIds.EmbedCancelPrefix)) {
    await interaction.update({
      embeds: [createSuccessEmbed('Embed Discarded', 'The draft embed was discarded.')],
      components: []
    });
    return true;
  }

  if (id.startsWith(CustomIds.EmbedEditBtnPrefix)) {
    const channelId = id.slice(CustomIds.EmbedEditBtnPrefix.length);
    const currentEmbed = interaction.message.embeds[1] || interaction.message.embeds[0];
    const modal = buildEmbedComposerModal({
      channelId,
      title: currentEmbed?.title || '',
      description: currentEmbed?.description || '',
      color: currentEmbed?.hexColor || '#7869ff',
      imageUrl: currentEmbed?.image?.url || '',
      thumbnailUrl: currentEmbed?.thumbnail?.url || ''
    });
    await interaction.showModal(modal);
    return true;
  }

  if (id.startsWith(CustomIds.EmbedAddFieldBtnPrefix)) {
    const channelId = id.slice(CustomIds.EmbedAddFieldBtnPrefix.length);
    const modal = buildEmbedFieldModal(channelId);
    await interaction.showModal(modal);
    return true;
  }

  if (id.startsWith(CustomIds.SupportResetCancelPrefix)) {
    const payload = parseSupportResetId(id, CustomIds.SupportResetCancelPrefix);
    if (!payload || payload.requestedByUserId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Not Yours', 'Only the user who opened this reset confirmation can cancel it.')] });
      return true;
    }
    const mod = getSupportResetModule(payload.moduleKey);
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Support Reset Cancelled', `No ${mod?.label || 'support module'} data was changed.`)], components: [] });
    return true;
  }

  if (id.startsWith(CustomIds.SupportResetConfirmPrefix)) {
    const payload = parseSupportResetId(id, CustomIds.SupportResetConfirmPrefix);
    if (!payload || payload.requestedByUserId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Not Yours', 'Only the user who opened this reset confirmation can confirm it.')] });
      return true;
    }

    const mod = getSupportResetModule(payload.moduleKey);
    if (!mod) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Reset Not Available', 'That support module reset is not recognized.')] });
      return true;
    }

    const actionMap = {
      tickets: [ActionKeys.TicketsReset, ModuleKeys.TICKETS],
      reports: [ActionKeys.ReportsReset, ModuleKeys.REPORTS],
      applications: [ActionKeys.ApplicationsReset, ModuleKeys.APPLICATIONS],
      appeals: [ActionKeys.AppealsReset, ModuleKeys.APPEALS]
    };
    const [actionKey, moduleKey] = actionMap[mod.key] || [];
    if (!actionKey || !(await requireAction(interaction, ctx, actionKey, moduleKey))) return true;

    const result = await resetSupportModule(interaction.guildId, mod.key);
    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'setup',
      title: `${result.mod.label} Module Reset`,
      body: `${result.mod.label} support module data was reset by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id,
      metadata: { module: result.mod.key, before: result.before }
    }).catch(() => {});
    await updatePanel(interaction, buildSupportResetCompletePayload(result));
    return true;
  }

  if (id === CustomIds.ResetCancel) {
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Reset Cancelled', 'No SlickBot data was changed.')], components: [] });
    return true;
  }

  if (id === CustomIds.ResetConfirm) {
    if (!interaction.guild || interaction.guild.ownerId !== interaction.user.id) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Server Owner Required', 'Only the Discord server owner can confirm this reset.')] });
      return true;
    }
    await query(`DELETE FROM guild_configs WHERE guild_id = $1`, [interaction.guildId]);
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild.name);
    await ctx.permissions.ensureOwnerTeam(interaction.guildId, interaction.user.id);
    await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.ServerReset, targetType: 'GuildConfig', targetId: interaction.guildId, summary: 'SlickBot server data reset to fresh install.' }).catch(() => {});
    await updatePanel(interaction, { embeds: [createSuccessEmbed('SlickBot Reset Complete', 'SlickBot data and configuration for this server has been reset. Run `/setup` to configure it again.')], components: [] });
    return true;
  }

  if (id === CustomIds.SetupRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildSetupPanel(interaction.guildId, interaction.guild ? interaction.guild.name : null));
    return true;
  }

  if (id === CustomIds.SetupModules || id === CustomIds.ModulesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildModulesPanel(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.SetupOpenManagerPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    const moduleKey = id.slice(CustomIds.SetupOpenManagerPrefix.length);
    return routeModuleToManager(interaction, ctx, moduleKey);
  }

  if (id === CustomIds.SetupCategoryCore) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildCategoryPanel(interaction.guildId, 'CORE'));
    return true;
  }

  if (id === CustomIds.SetupCategorySupport) {
    if (!(await requireAnySupportAction(interaction, ctx))) return true;
    await updatePanel(interaction, await buildCategoryPanel(interaction.guildId, 'SUPPORT'));
    return true;
  }

  if (id === CustomIds.SetupCategoryCommunity) {
    if (!(await requireAnyCommunityAction(interaction, ctx))) return true;
    await updatePanel(interaction, await buildCategoryPanel(interaction.guildId, 'COMMUNITY'));
    return true;
  }

  if (id === CustomIds.SetupCategoryAutomation) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildCategoryPanel(interaction.guildId, 'AUTOMATION'));
    return true;
  }

  if (id === CustomIds.OnboardingStart || id === CustomIds.OnboardingServerStart) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    const session = onboarding.startServerOnboarding(interaction.guildId, interaction.user.id);
    const firstStep = session.steps[0];
    const currentVal = firstStep && typeof firstStep.getCurrent === 'function' ? await firstStep.getCurrent(interaction.guild).catch(() => null) : null;
    await updatePanel(interaction, onboarding.buildOnboardingPayload(session, currentVal));
    return true;
  }

  if (id.startsWith(CustomIds.OnboardingModulePrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    const target = id.slice(CustomIds.OnboardingModulePrefix.length);
    const session = onboarding.startModuleOnboarding(interaction.guildId, interaction.user.id, target);
    if (!session) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('No Onboarding Available', `Guided setup is not yet configured for ${target}. Use the module manager panel instead.`)], deleteAfterSeconds: 10 });
    }
    const firstStep = session.steps[0];
    const currentVal = firstStep && typeof firstStep.getCurrent === 'function' ? await firstStep.getCurrent(interaction.guild).catch(() => null) : null;
    await updatePanel(interaction, onboarding.buildOnboardingPayload(session, currentVal));
    return true;
  }

  if (id === CustomIds.PermissionsApplyDefaults) {
    if (!(await requireAction(interaction, ctx, ActionKeys.PermissionsSetup, ModuleKeys.PERMISSIONS))) return true;
    await ctx.permissions.applyDefaults(interaction.guildId);
    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'permissions',
      title: 'Default Permissions Applied',
      body: `Standard default permission levels and access rules applied by <@${interaction.user.id}>.`,
      actorUserId: interaction.user.id
    }).catch(() => {});
    await updatePanel(interaction, await buildPermissionsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.AppealToggleDmDecisions) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AppealsConfig, ModuleKeys.APPEALS))) return true;
    const curr = await query(`SELECT dm_decision_enabled FROM appeal_configs WHERE guild_id = $1`, [interaction.guildId]).catch(() => ({ rows: [] }));
    const nextVal = !(curr.rows[0]?.dm_decision_enabled ?? true);
    await query(`INSERT INTO appeal_configs (guild_id, dm_decision_enabled) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET dm_decision_enabled = EXCLUDED.dm_decision_enabled, updated_at = NOW()`, [interaction.guildId, nextVal]);
    await updatePanel(interaction, await buildAppealsPanel(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.ModuleTogglePrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    const moduleKey = id.slice(CustomIds.ModuleTogglePrefix.length);
    if (!isImplementedModuleSafe(moduleKey)) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Module Coming Soon', `**${moduleKey}** has not been built yet.`)] });
    }
    if (isCoreModule(moduleKey)) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Core Module Locked', `**${moduleKey}** is a core SlickBot module and cannot be disabled.`)] });
    }
    const current = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = $2 LIMIT 1`, [interaction.guildId, moduleKey]);
    const nextEnabled = !(current.rows[0]?.enabled);
    await ctx.permissions.setModuleEnabled(interaction.guildId, moduleKey, nextEnabled);
    await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.ModulesManage, targetType: 'ModuleConfig', targetId: moduleKey, summary: `${moduleKey} module ${nextEnabled ? 'enabled' : 'disabled'} via button.` });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'module-config', title: `Module ${nextEnabled ? 'Enabled' : 'Disabled'}`, body: [`Module: **${moduleKey}**`, `Updated By: <@${interaction.user.id}>`, `Status: **${nextEnabled ? '🟢 Enabled' : '⏸️ Disabled'}**`].join('\n'), metadata: { moduleKey, enabled: nextEnabled, actorUserId: interaction.user.id } });

    switch (moduleKey) {
      case ModuleKeys.MODERATION:
        await updatePanel(interaction, await buildModerationPanel(interaction.guildId));
        break;
      case ModuleKeys.AUTOMOD:
        await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'FILTERS'));
        break;
      case ModuleKeys.TEMP_ROLES:
        await updatePanel(interaction, await tempRoles.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.LOCKDOWN:
        await updatePanel(interaction, await lockdown.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.UTILITY:
        await updatePanel(interaction, await buildUtilityManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.TICKETS:
        await updatePanel(interaction, await buildTicketsPanel(interaction.guildId));
        break;
      case ModuleKeys.REPORTS:
        await updatePanel(interaction, await buildReportsPanel(interaction.guildId));
        break;
      case ModuleKeys.APPLICATIONS:
        await updatePanel(interaction, await buildApplicationsPanel(interaction.guildId));
        break;
      case ModuleKeys.APPEALS:
        await updatePanel(interaction, await buildAppealsPanel(interaction.guildId));
        break;
      case ModuleKeys.WELCOME:
        await updatePanel(interaction, await buildWelcomePanel(interaction.guildId));
        break;
      case ModuleKeys.REACTION_ROLES:
        await updatePanel(interaction, await buildRoleManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.GIVEAWAYS:
        await updatePanel(interaction, await giveaways.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.BIRTHDAYS:
        await updatePanel(interaction, await birthdays.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.LEVELING:
        await updatePanel(interaction, await leveling.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.COMMUNITY_GAMES:
        await updatePanel(interaction, await communityGames.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.FAQ:
        await updatePanel(interaction, await faq.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.SUGGESTIONS:
        await updatePanel(interaction, await suggestions.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.REFERRALS:
        await updatePanel(interaction, await referrals.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.ACHIEVEMENTS:
        await updatePanel(interaction, await achievements.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.SERVER_STATS:
        await updatePanel(interaction, await serverStats.buildManagerPanel(interaction.guild));
        break;
      case ModuleKeys.CUSTOM_COMMANDS:
        await updatePanel(interaction, await customCommands.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.JOIN_TO_CREATE:
        await updatePanel(interaction, await joinCreate.buildManagerPanel(interaction.guild));
        break;
      case ModuleKeys.SCHEDULED_MESSAGES:
        await updatePanel(interaction, await scheduledMessages.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.BOT_UPDATES:
        await updatePanel(interaction, await botUpdates.buildStatusPanel(interaction.guildId));
        break;
      case ModuleKeys.SOCIAL_FEEDS:
        await updatePanel(interaction, await socialFeeds.buildManagerPanel(interaction.guildId));
        break;
      case ModuleKeys.STARBOARD:
        await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, 'OVERVIEW'));
        break;
      default:
        await updatePanel(interaction, await buildModulesPanel(interaction.guildId));
        break;
    }
    return true;
  }

  if (id.startsWith(CustomIds.OnboardingAutoCreatePrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    const sessionId = id.slice(CustomIds.OnboardingAutoCreatePrefix.length);
    const session = onboarding.getSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Onboarding Expired', 'This onboarding session has expired or belongs to another user. Please launch onboarding again.')], deleteAfterSeconds: 10 });
    await interaction.deferUpdate().catch(() => {});
    const currentStep = session.steps[session.stepIndex];
    let createdResult = null;
    if (currentStep && typeof currentStep.autoCreate === 'function') {
      try {
        createdResult = await currentStep.autoCreate(interaction.guild, session);
      } catch (err) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Auto-Creation Failed', err instanceof Error ? err.message : String(err))] });
      }
    }
    await onboarding.advanceSession(session, interaction.guild, 'AUTO_CREATE', createdResult || {});
    const nextStep = session.steps[session.stepIndex];
    const currentVal = nextStep && typeof nextStep.getCurrent === 'function' ? await nextStep.getCurrent(interaction.guild).catch(() => null) : null;
    await updatePanel(interaction, onboarding.buildOnboardingPayload(session, currentVal));
    return true;
  }

  if (id.startsWith(CustomIds.OnboardingKeepCurrentPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    const sessionId = id.slice(CustomIds.OnboardingKeepCurrentPrefix.length);
    const session = onboarding.getSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Onboarding Expired', 'This onboarding session has expired or belongs to another user. Please launch onboarding again.')], deleteAfterSeconds: 10 });
    await onboarding.advanceSession(session, interaction.guild, 'KEEP_CURRENT');
    const nextStep = session.steps[session.stepIndex];
    const currentVal = nextStep && typeof nextStep.getCurrent === 'function' ? await nextStep.getCurrent(interaction.guild).catch(() => null) : null;
    await updatePanel(interaction, onboarding.buildOnboardingPayload(session, currentVal));
    return true;
  }

  if (id.startsWith(CustomIds.OnboardingKeepDefaultPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    const sessionId = id.slice(CustomIds.OnboardingKeepDefaultPrefix.length);
    const session = onboarding.getSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Onboarding Expired', 'This onboarding session has expired or belongs to another user. Please launch onboarding again.')], deleteAfterSeconds: 10 });
    await onboarding.advanceSession(session, interaction.guild, 'KEEP_DEFAULT');
    const nextStep = session.steps[session.stepIndex];
    const currentVal = nextStep && typeof nextStep.getCurrent === 'function' ? await nextStep.getCurrent(interaction.guild).catch(() => null) : null;
    await updatePanel(interaction, onboarding.buildOnboardingPayload(session, currentVal));
    return true;
  }

  if (id.startsWith(CustomIds.OnboardingSkipPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    const sessionId = id.slice(CustomIds.OnboardingSkipPrefix.length);
    const session = onboarding.getSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Onboarding Expired', 'This onboarding session has expired or belongs to another user. Please launch onboarding again.')], deleteAfterSeconds: 10 });
    await onboarding.advanceSession(session, interaction.guild, 'SKIP');
    const nextStep = session.steps[session.stepIndex];
    const currentVal = nextStep && typeof nextStep.getCurrent === 'function' ? await nextStep.getCurrent(interaction.guild).catch(() => null) : null;
    await updatePanel(interaction, onboarding.buildOnboardingPayload(session, currentVal));
    return true;
  }

  if (id.startsWith(CustomIds.OnboardingCancelPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildSetupPanel(interaction.guildId, interaction.guild ? interaction.guild.name : null));
    return true;
  }

  if (id === CustomIds.SetupModules || id === CustomIds.ModulesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildModulesPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupLogging || id === CustomIds.LoggingRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingView, ModuleKeys.LOGGING))) return true;
    await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.LoggingTest) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingConfigure, ModuleKeys.LOGGING))) return true;
    const res = await ctx.logger.testAllHubs(interaction.guild, interaction.user);
    const sentCount = res.filter((r) => r.sent).length;
    const embed = createSuccessEmbed(
      '🧪 Logging Test Dispatched',
      `Sent test log embeds to **${sentCount}/${res.length}** configured logging hubs.\nCheck your server log channels for delivery!`
    );
    await replyPrivate(interaction, { embeds: [embed] });
    return true;
  }

  if (id === CustomIds.LoggingReset) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingConfigure, ModuleKeys.LOGGING))) return true;
    const confirmEmbed = createWarningEmbed(
      '⚠️ Confirm Logging Reset',
      'Are you sure you want to reset all logging configuration?\n\n' +
      '• All 30 module routes across all 6 hubs will be unlinked.\n' +
      '• All event overrides will be cleared.\n' +
      '• Existing channels will NOT be deleted from Discord.\n\n' +
      'You can re-run `/logging setup` or use the Quick Setup wizard at any time.'
    );
    const row = createButtonRow([
      createPanelButton(CustomIds.LoggingResetConfirm, 'Confirm Reset', ButtonStyle.Danger, '⚠️'),
      createPanelButton(CustomIds.LoggingResetCancel, 'Cancel', ButtonStyle.Secondary, '❌')
    ]);
    await updatePanel(interaction, { embeds: [confirmEmbed], components: [row] });
    return true;
  }

  if (id === CustomIds.LoggingResetConfirm) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingConfigure, ModuleKeys.LOGGING))) return true;
    await ctx.logger.resetGuildLogging(interaction.guildId);
    await ctx.logger.writeAudit({
      guildId: interaction.guildId,
      actorUserId: interaction.user.id,
      actionKey: ActionKeys.LoggingConfigure,
      targetType: 'GuildConfig',
      targetId: interaction.guildId,
      summary: 'Reset all logging routes and configuration.'
    });
    await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.LoggingResetCancel) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingView, ModuleKeys.LOGGING))) return true;
    await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupTeams) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TeamsManage, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildTeamsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupPermissions || id === CustomIds.PermissionsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.PermissionsPanel, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildPermissionsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupModeration || id === CustomIds.ModerationRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModerationPanel, ModuleKeys.MODERATION))) return true;
    await updatePanel(interaction, await buildModerationPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.CasesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.CasesView, ModuleKeys.MODERATION))) return true;
    await updatePanel(interaction, await buildRecentCasesPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupSupport || id === CustomIds.SupportRefresh) {
    if (!(await requireAnySupportAction(interaction, ctx))) return true;
    await updatePanel(interaction, await buildSupportPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupCommunity) {
    if (!(await requireAnyCommunityAction(interaction, ctx))) return true;
    await updatePanel(interaction, await buildCommunityPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.GamesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GamesView, ModuleKeys.COMMUNITY_GAMES))) return true;
    await updatePanel(interaction, await communityGames.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.GamesCounting) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GamesView, ModuleKeys.COMMUNITY_GAMES))) return true;
    await updatePanel(interaction, await communityGames.buildCountingPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.GamesTicTacToe) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GamesView, ModuleKeys.COMMUNITY_GAMES))) return true;
    await updatePanel(interaction, await communityGames.buildBoardGamePanel(interaction.guildId, GAME_KEYS.TIC_TAC_TOE));
    return true;
  }

  if (id === CustomIds.GamesConnectFour) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GamesView, ModuleKeys.COMMUNITY_GAMES))) return true;
    await updatePanel(interaction, await communityGames.buildBoardGamePanel(interaction.guildId, GAME_KEYS.CONNECT_FOUR));
    return true;
  }

  if (id === CustomIds.FaqRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.FaqView, ModuleKeys.FAQ))) return true;
    await updatePanel(interaction, await faq.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SuggestionsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.SuggestionsView, ModuleKeys.SUGGESTIONS))) return true;
    await updatePanel(interaction, await suggestions.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ReferralsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReferralsView, ModuleKeys.REFERRALS))) return true;
    await updatePanel(interaction, await referrals.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.TempRolesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TempRolesView, ModuleKeys.TEMP_ROLES))) return true;
    await updatePanel(interaction, await tempRoles.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.AchievementsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AchievementsView, ModuleKeys.ACHIEVEMENTS))) return true;
    await updatePanel(interaction, await achievements.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.AchievementsHistoryPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AchievementsUse, ModuleKeys.ACHIEVEMENTS))) return true;
    const raw = id.slice(CustomIds.AchievementsHistoryPrefix.length);
    const [userId, pageText] = raw.split(':');
    const user = await interaction.client.users.fetch(userId).catch(() => interaction.user);
    await updatePanel(interaction, await achievements.buildHistoryPayload(interaction.guild, user, Number(pageText || 0)));
    return true;
  }

  if (id.startsWith(CustomIds.AchievementsResetConfirmPrefix) || id.startsWith(CustomIds.AchievementsResetCancelPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AchievementsReset, ModuleKeys.ACHIEVEMENTS))) return true;
    const confirmed = id.startsWith(CustomIds.AchievementsResetConfirmPrefix);
    const raw = id.slice((confirmed ? CustomIds.AchievementsResetConfirmPrefix : CustomIds.AchievementsResetCancelPrefix).length);
    const [scope, targetId, actorId] = raw.split(':');
    if (actorId && actorId !== interaction.user.id) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Reset Confirmation Locked', 'Only the staff member who opened this confirmation can use it.')], deleteAfterSeconds: 10 });
    }
    if (!confirmed) {
      await updatePanel(interaction, { embeds: [createWarningEmbed('Achievement Reset Cancelled', 'No achievement data was changed.')], components: [] });
      return true;
    }
    await achievements.reset({ guildId: interaction.guildId, scope, userId: targetId === 'server' ? null : targetId });
    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'achievement-config',
      title: 'Achievements Reset',
      body: `Reset By: <@${interaction.user.id}>\nScope: **${scope}**${targetId && targetId !== 'server' ? `\nUser: <@${targetId}>` : ''}`,
      actorUserId: interaction.user.id
    }).catch(() => {});
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Achievement Reset Complete', scope === 'server' ? 'Server achievement setup and tracked data were cleared.' : `Achievement data was cleared for <@${targetId}>.`)], components: [] });
    return true;
  }

  if (id === CustomIds.WelcomeRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.WelcomeView, ModuleKeys.WELCOME))) return true;
    await updatePanel(interaction, await buildWelcomePanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.WelcomeToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.WelcomeConfigure, ModuleKeys.WELCOME))) return true;
    const config = await getWelcomeConfig(interaction.guildId);
    const nextEnabled = !(config?.enabled ?? false);
    await upsertWelcomeConfig({ guildId: interaction.guildId, enabled: nextEnabled });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'welcome-config', title: 'Welcome Module Toggled', body: `Welcome enabled: **${nextEnabled}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await updatePanel(interaction, await buildWelcomePanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.WelcomeToggleDm) {
    if (!(await requireAction(interaction, ctx, ActionKeys.WelcomeConfigure, ModuleKeys.WELCOME))) return true;
    const config = await getWelcomeConfig(interaction.guildId);
    const nextDmEnabled = !(config?.dm_enabled ?? false);
    await upsertWelcomeConfig({ guildId: interaction.guildId, dmEnabled: nextDmEnabled });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'welcome-config', title: 'Welcome DM Toggled', body: `DM Welcome enabled: **${nextDmEnabled}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await updatePanel(interaction, await buildWelcomePanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.WelcomeEditModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.WelcomeConfigure, ModuleKeys.WELCOME))) return true;
    const config = await getWelcomeConfig(interaction.guildId);
    await interaction.showModal(buildWelcomeEditModal(config));
    return true;
  }

  if (id === CustomIds.WelcomeTest) {
    if (!(await requireAction(interaction, ctx, ActionKeys.WelcomeConfigure, ModuleKeys.WELCOME))) return true;
    const config = await getWelcomeConfig(interaction.guildId);
    const member = interaction.member || { id: interaction.user.id, user: interaction.user, guild: interaction.guild };
    const embed = createBaseEmbed({
      title: (config?.embed_title || 'Welcome to {server}').replaceAll('{server}', interaction.guild?.name || 'Server').replaceAll('{user}', `<@${interaction.user.id}>`),
      description: (config?.embed_description || 'Glad to have you here, {user}.').replaceAll('{server}', interaction.guild?.name || 'Server').replaceAll('{user}', `<@${interaction.user.id}>`),
      color: SlickBotColors.PRIMARY,
      footer: 'SlickBot Welcome Preview'
    });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Welcome Preview', 'Here is how your welcome embed looks:'), embed] });
    return true;
  }

  if (id === CustomIds.RolePanelsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.RolePanelsView, ModuleKeys.REACTION_ROLES))) return true;
    await updatePanel(interaction, await buildRoleManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.GiveawaysRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysView, ModuleKeys.GIVEAWAYS))) return true;
    await updatePanel(interaction, await giveaways.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.GiveawaysQuickStart) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysManage, ModuleKeys.GIVEAWAYS))) return true;
    await interaction.showModal(buildGiveawayStartModal());
    return true;
  }

  if (id === CustomIds.GiveawaysConfigModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysManage, ModuleKeys.GIVEAWAYS))) return true;
    const config = await giveaways.getConfig(interaction.guildId);
    await interaction.showModal(buildGiveawayConfigModal(config));
    return true;
  }

  if (id === CustomIds.BirthdaysRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BirthdaysView, ModuleKeys.BIRTHDAYS))) return true;
    await updatePanel(interaction, await birthdays.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.BirthdaysToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BirthdaysConfigure, ModuleKeys.BIRTHDAYS))) return true;
    const config = await birthdays.getConfig(interaction.guildId);
    const nextEnabled = !(config?.enabled ?? false);
    await birthdays.setup(interaction.guildId, { enabled: nextEnabled });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'birthday-config', title: 'Birthdays Toggled', body: `Birthday automation enabled: **${nextEnabled}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await updatePanel(interaction, await birthdays.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.BirthdaysEditModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BirthdaysConfigure, ModuleKeys.BIRTHDAYS))) return true;
    const config = await birthdays.getConfig(interaction.guildId);
    await interaction.showModal(buildBirthdayEditModal(config));
    return true;
  }

  if (id === CustomIds.BirthdaysTest) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BirthdaysConfigure, ModuleKeys.BIRTHDAYS))) return true;
    const config = await birthdays.getConfig(interaction.guildId);
    const text = (config?.announcement_template || 'Happy Birthday {user}! 🎂 Hope you have a wonderful day!').replaceAll('{user}', `<@${interaction.user.id}>`).replaceAll('{username}', interaction.user.username).replaceAll('{server}', interaction.guild?.name || 'Server').replaceAll('{date}', 'Today');
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Birthday Announcement Preview', text)] });
    return true;
  }

  if (id === CustomIds.BirthdaysPostPanel) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BirthdaysConfigure, ModuleKeys.BIRTHDAYS))) return true;
    const session = birthdays.createSetupSession({ guildId: interaction.guildId, userId: interaction.user.id });
    const payload = birthdays.buildSetupPayload(session);
    await interaction.channel.send(payload);
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Birthday Panel Posted', 'The public birthday self-registration panel was posted to this channel.')] });
    return true;
  }

  if (id === CustomIds.ScheduledMessagesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ScheduledMessagesView, ModuleKeys.SCHEDULED_MESSAGES))) return true;
    await updatePanel(interaction, await scheduledMessages.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ScheduledMessagesToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ScheduledMessagesConfigure, ModuleKeys.SCHEDULED_MESSAGES))) return true;
    const config = await scheduledMessages.getConfig(interaction.guildId);
    const nextEnabled = !(config?.enabled ?? false);
    await scheduledMessages.setup(interaction.guildId, { enabled: nextEnabled });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'scheduled-messages', title: 'Scheduled Messages Toggled', body: `Scheduler enabled: **${nextEnabled}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await updatePanel(interaction, await scheduledMessages.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ScheduledMessagesCreateModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ScheduledMessagesConfigure, ModuleKeys.SCHEDULED_MESSAGES))) return true;
    await interaction.showModal(buildScheduledMessageCreateModal());
    return true;
  }

  if (id === CustomIds.LevelingRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LevelingView, ModuleKeys.LEVELING))) return true;
    await updatePanel(interaction, await leveling.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.LevelingToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LevelingConfigure, ModuleKeys.LEVELING))) return true;
    const config = await leveling.getConfig(interaction.guildId);
    const nextEnabled = !(config?.enabled ?? false);
    await leveling.saveConfig(interaction.guildId, { enabled: nextEnabled });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'level-config', title: 'Leveling XP Toggled', body: `XP awards enabled: **${nextEnabled}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await updatePanel(interaction, await leveling.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.LevelingConfigModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LevelingConfigure, ModuleKeys.LEVELING))) return true;
    const config = await leveling.getConfig(interaction.guildId);
    await interaction.showModal(buildLevelingConfigModal(config));
    return true;
  }

  if (id === CustomIds.LevelingToggleMode) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LevelingConfigure, ModuleKeys.LEVELING))) return true;
    const config = await leveling.getConfig(interaction.guildId);
    const currentMode = config?.level_up_announce_mode === 'ROLE_REWARDS_ONLY' ? 'ALL' : 'ROLE_REWARDS_ONLY';
    await leveling.saveConfig(interaction.guildId, { levelUpAnnounceMode: currentMode });
    await updatePanel(interaction, await leveling.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ServerStatsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ServerStatsView, ModuleKeys.SERVER_STATS))) return true;
    await updatePanel(interaction, await serverStats.buildManagerPanel(interaction.guild));
    return true;
  }

  if (id === CustomIds.ServerStatsToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ServerStatsConfigure, ModuleKeys.SERVER_STATS))) return true;
    const config = await serverStats.getConfig(interaction.guild.id);
    const nextEnabled = !(config?.enabled ?? false);
    await serverStats.upsertConfig(interaction.guild.id, { enabled: nextEnabled });
    await ctx.logger.log({ guildId: interaction.guild.id, eventKey: 'server-stats-config', title: 'Server Stats Toggled', body: `Stats updates enabled: **${nextEnabled}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await updatePanel(interaction, await serverStats.buildManagerPanel(interaction.guild));
    return true;
  }

  if (id === CustomIds.ServerStatsConfigModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ServerStatsConfigure, ModuleKeys.SERVER_STATS))) return true;
    const config = await serverStats.getConfig(interaction.guild.id);
    await interaction.showModal(buildServerStatsConfigModal(config));
    return true;
  }

  if (id === CustomIds.ServerStatsRefreshNow) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ServerStatsConfigure, ModuleKeys.SERVER_STATS))) return true;
    await interaction.deferUpdate().catch(() => {});
    await serverStats.sync(interaction.guild, { force: true, logger: ctx.logger }).catch(() => {});
    await updatePanel(interaction, await serverStats.buildManagerPanel(interaction.guild));
    return true;
  }

  if (id === CustomIds.CustomCommandsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.CustomCommandsView, ModuleKeys.CUSTOM_COMMANDS))) return true;
    await updatePanel(interaction, await customCommands.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.CustomCommandsToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.CustomCommandsConfigure, ModuleKeys.CUSTOM_COMMANDS))) return true;
    const config = await customCommands.getConfig(interaction.guildId);
    const nextEnabled = !(config?.enabled ?? false);
    await customCommands.setEnabled(interaction.guildId, nextEnabled);
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'custom-command-config', title: 'Custom Commands Toggled', body: `Module enabled: **${nextEnabled}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await updatePanel(interaction, await customCommands.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.CustomCommandsCreateModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.CustomCommandsConfigure, ModuleKeys.CUSTOM_COMMANDS))) return true;
    const config = await customCommands.getConfig(interaction.guildId);
    await interaction.showModal(buildCustomCommandCreateModal(config?.prefix));
    return true;
  }

  if (id === CustomIds.CustomCommandsPrefixModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.CustomCommandsConfigure, ModuleKeys.CUSTOM_COMMANDS))) return true;
    const config = await customCommands.getConfig(interaction.guildId);
    await interaction.showModal(buildCustomCommandPrefixModal(config?.prefix));
    return true;
  }

  if (id === CustomIds.ReferralsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReferralsView, ModuleKeys.REFERRALS))) return true;
    await updatePanel(interaction, await referrals.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ReferralsToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReferralsConfigure, ModuleKeys.REFERRALS))) return true;
    const stats = await referrals.stats(interaction.guildId);
    const nextEnabled = stats.config?.enabled === false;
    await referrals.setup(interaction.guildId, { enabled: nextEnabled });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'referral-config', title: 'Referrals Toggled', body: `Referrals enabled: **${nextEnabled}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await updatePanel(interaction, await referrals.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ReferralsConfigModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReferralsConfigure, ModuleKeys.REFERRALS))) return true;
    const stats = await referrals.stats(interaction.guildId);
    await interaction.showModal(buildReferralsConfigModal(stats.config));
    return true;
  }

  if (id === CustomIds.BotUpdatesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BotUpdatesView, ModuleKeys.BOT_UPDATES))) return true;
    await updatePanel(interaction, await botUpdates.buildStatusPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.BotUpdatesToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BotUpdatesConfigure, ModuleKeys.BOT_UPDATES))) return true;
    const { config } = await botUpdates.getConfigWithRoles(interaction.guildId);
    const nextEnabled = !(config?.enabled ?? false);
    await botUpdates.setEnabled(interaction.guildId, nextEnabled);
    await updatePanel(interaction, await botUpdates.buildStatusPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.BotUpdatesTogglePings) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BotUpdatesConfigure, ModuleKeys.BOT_UPDATES))) return true;
    const { config } = await botUpdates.getConfigWithRoles(interaction.guildId);
    const nextPings = !(config?.ping_roles_enabled ?? false);
    await botUpdates.setup(interaction.guildId, { pingRolesEnabled: nextPings });
    await updatePanel(interaction, await botUpdates.buildStatusPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.BotUpdatesPreview) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BotUpdatesView, ModuleKeys.BOT_UPDATES))) return true;
    const { config, roleIds } = await botUpdates.getConfigWithRoles(interaction.guildId);
    const payload = botUpdates.buildPayload({ preview: true, config, roleIds });
    await replyPrivate(interaction, payload);
    return true;
  }

  if (id === CustomIds.BotUpdatesSendNow) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BotUpdatesSend, ModuleKeys.BOT_UPDATES))) return true;
    const result = await botUpdates.sendUpdate(interaction.guild, ctx.logger, { force: true });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Update Not Sent', result.reason)] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Update Announcement Sent', `SlickBot v${result.version} update announcement was posted in <#${result.channelId}>.`)] });
    return true;
  }

  if (id === CustomIds.AchievementsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AchievementsView, ModuleKeys.ACHIEVEMENTS))) return true;
    await updatePanel(interaction, await achievements.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.AchievementsToggleDm) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AchievementsConfigure, ModuleKeys.ACHIEVEMENTS))) return true;
    const config = await achievements.getConfig(interaction.guildId);
    const nextDm = !(config?.dm_enabled ?? false);
    await achievements.setup(interaction.guildId, { dmEnabled: nextDm });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'achievement-config', title: 'Achievement DMs Toggled', body: `DM unlock notifications enabled: **${nextDm}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await updatePanel(interaction, await achievements.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.TempRolesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TempRolesView, ModuleKeys.TEMP_ROLES))) return true;
    await updatePanel(interaction, await tempRoles.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.TempRolesCleanup) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TempRolesManage, ModuleKeys.TEMP_ROLES))) return true;
    await tempRoles.cleanupExpired(ctx.client, ctx.logger);
    await updatePanel(interaction, await tempRoles.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.FaqRefreshIndex) {
    if (!(await requireAction(interaction, ctx, ActionKeys.FaqConfigure, ModuleKeys.FAQ))) return true;
    await interaction.deferUpdate().catch(() => {});
    const result = await faq.refreshMasterPost(interaction.guild);
    if (!result.ok) {
      await interaction.followUp({ embeds: [createWarningEmbed('FAQ Refresh Failed', result.reason)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    await updatePanel(interaction, await faq.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.GamesCountingToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GamesConfigure, ModuleKeys.COMMUNITY_GAMES))) return true;
    const counting = await communityGames.getCountingConfig(interaction.guildId);
    const nextEnabled = !(counting?.enabled ?? false);
    await communityGames.updateCountingConfig(interaction.guildId, { enabled: nextEnabled });
    await updatePanel(interaction, await communityGames.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.GamesTttToggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GamesConfigure, ModuleKeys.COMMUNITY_GAMES))) return true;
    const ttt = await communityGames.getGameConfig(interaction.guildId, GAME_KEYS.TIC_TAC_TOE);
    const nextEnabled = !(ttt?.enabled ?? false);
    await communityGames.updateGameConfig(interaction.guildId, GAME_KEYS.TIC_TAC_TOE, { enabled: nextEnabled });
    await updatePanel(interaction, await communityGames.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.GamesC4Toggle) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GamesConfigure, ModuleKeys.COMMUNITY_GAMES))) return true;
    const c4 = await communityGames.getGameConfig(interaction.guildId, GAME_KEYS.CONNECT_FOUR);
    const nextEnabled = !(c4?.enabled ?? false);
    await communityGames.updateGameConfig(interaction.guildId, GAME_KEYS.CONNECT_FOUR, { enabled: nextEnabled });
    await updatePanel(interaction, await communityGames.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.JoinCreateRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.JoinCreateView, ModuleKeys.JOIN_TO_CREATE))) return true;
    await updatePanel(interaction, withSetupSubheader(await joinCreate.buildManagerPanel(interaction.guild), 'SlickBot Community Center', 'Join-to-Create Voice'));
    return true;
  }

  if (id === CustomIds.TicketsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsManager, ModuleKeys.TICKETS))) return true;
    await updatePanel(interaction, await buildTicketsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ReportsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsManager, ModuleKeys.REPORTS))) return true;
    await updatePanel(interaction, await buildReportsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ApplicationsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ApplicationsManager, ModuleKeys.APPLICATIONS))) return true;
    await updatePanel(interaction, await buildApplicationsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.AppealsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AppealsManager, ModuleKeys.APPEALS))) return true;
    await updatePanel(interaction, await buildAppealsPanel(interaction.guildId));
    return true;
  }


  if (id === CustomIds.BirthdaySetOpen) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.BirthdaysUse, ModuleKeys.BIRTHDAYS))) return true;
    const config = await birthdays.getConfig(interaction.guildId).catch(() => ({ timezone: 'America/New_York' }));
    const session = birthdays.createSetupSession({ guildId: interaction.guildId, userId: interaction.user.id, defaultTimezone: config?.timezone || 'America/New_York' });
    await replyPrivate(interaction, birthdays.buildSetupSessionPayload(session));
    return true;
  }


  if (id.startsWith(CustomIds.BirthdayDayPrefix)) {
    const sessionId = id.slice(CustomIds.BirthdayDayPrefix.length).split(':')[0];
    const session = birthdays.getSetupSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Setup Not Found', 'This birthday setup session expired or belongs to another user.')], deleteAfterSeconds: 10 });
    await interaction.showModal(buildBirthdayDayModal(session));
    return true;
  }

  if (id.startsWith(CustomIds.BirthdayTimezoneCustomPrefix)) {
    const sessionId = id.slice(CustomIds.BirthdayTimezoneCustomPrefix.length);
    const session = birthdays.getSetupSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Setup Not Found', 'This birthday setup session expired or belongs to another user.')], deleteAfterSeconds: 10 });
    await interaction.showModal(buildBirthdayTimezoneModal(session));
    return true;
  }

  if (id.startsWith(CustomIds.BirthdayCancelPrefix)) {
    const sessionId = id.slice(CustomIds.BirthdayCancelPrefix.length);
    const session = birthdays.getSetupSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Setup Not Found', 'This birthday setup session expired or belongs to another user.')], deleteAfterSeconds: 10 });
    birthdays.cancelSetupSession(sessionId);
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Birthday Setup Cancelled', 'Your birthday was not changed.')], components: [] });
    return true;
  }

  if (id.startsWith(CustomIds.BirthdaySavePrefix)) {
    const sessionId = id.slice(CustomIds.BirthdaySavePrefix.length);
    const session = birthdays.getSetupSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Setup Not Found', 'This birthday setup session expired or belongs to another user.')], deleteAfterSeconds: 10 });
    const result = await birthdays.setBirthday({ guildId: interaction.guildId, user: interaction.user, month: session.month, day: session.day, timezone: session.timezone });
    birthdays.cancelSetupSession(sessionId);
    if (!result.ok) return updatePanel(interaction, { embeds: [createWarningEmbed('Birthday Not Saved', result.reason)], components: [] });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'birthday-profile', title: 'Birthday Saved', body: `User: <@${interaction.user.id}>\nBirthday: **${require('../modules/community/birthdayService').formatBirthday(result.profile.birth_month, result.profile.birth_day)}**`, actorUserId: interaction.user.id }).catch(() => {});
    await achievements.recordOneTimeAchievement({ guild: interaction.guild, user: interaction.user, achievementKey: ACHIEVEMENT_KEYS.HAPPY_BIRTHDAY, logger: ctx.logger }).catch(() => {});
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Birthday Saved', `Your birthday was saved for **${require('../modules/community/birthdayService').formatBirthday(result.profile.birth_month, result.profile.birth_day)}** with timezone **${result.profile.timezone || 'server default'}**.`)], components: [] });
    return true;
  }

  if (id.startsWith('slickbot:rolepanel:')) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.RolePanelsUse, ModuleKeys.REACTION_ROLES))) return true;
    const [, , panelId, optionId] = id.split(':');
    const result = await toggleRole({ interaction, panelId, optionId, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Role Not Updated', result.reason)], deleteAfterSeconds: 10 });
    await acknowledgeQuietly(interaction);
    return true;
  }


  if (id.startsWith('slickbot:giveaway:enter:')) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.GiveawaysEnter, ModuleKeys.GIVEAWAYS))) return true;
    const giveawayId = id.slice('slickbot:giveaway:enter:'.length);
    const result = await giveaways.enterGiveaway({ interaction, giveawayId, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Entry Failed', result.reason)], deleteAfterSeconds: 10 });
    if (!result.alreadyEntered) await giveaways.refreshGiveawayMessage(ctx.client, interaction.guildId, giveawayId).catch(() => {});
    return replyPrivate(interaction, { embeds: [createSuccessEmbed(result.alreadyEntered ? 'Already Entered' : 'Giveaway Entered', result.alreadyEntered ? 'You are already entered in this giveaway.' : 'You have been entered in the giveaway.')], deleteAfterSeconds: 10 });
  }

  if (id === CustomIds.TicketOpen || id.startsWith(CustomIds.TicketOpenTypePrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TicketsOpen, ModuleKeys.TICKETS))) return true;
    const typeId = id.startsWith(CustomIds.TicketOpenTypePrefix) ? id.slice(CustomIds.TicketOpenTypePrefix.length) : null;
    const type = typeId ? await tickets.getTypeById(interaction.guildId, typeId) : await tickets.ensureDefaultType(interaction.guildId);
    await interaction.showModal(buildTicketModal(type));
    return true;
  }

  if (id === CustomIds.TicketClaim) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsClaim, ModuleKeys.TICKETS))) return true;
    const access = await tickets.canManageTicket({ interaction });
    if (!access.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Control Restricted', access.reason)] });
    const result = await tickets.claimTicket({ interaction, client: ctx.client, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Claimed', `Ticket #${result.ticket.ticket_number} is now assigned to <@${interaction.user.id}>.`)], deleteAfterSeconds: 10 });
    return true;
  }

  if (id === CustomIds.TicketEscalate) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsManage, ModuleKeys.TICKETS))) return true;
    const access = await tickets.canManageTicket({ interaction });
    if (!access.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Control Restricted', access.reason)] });
    const result = await tickets.escalateTicket({ interaction, client: ctx.client, logger: ctx.logger, reason: 'Escalated from ticket control button.' });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Escalated', result.reason)] });
    const mentions = result.roleIds.map((roleId) => `<@&${roleId}>`).join(' ');
    await interaction.channel.send({ content: `${mentions} Ticket #${result.ticket.ticket_number} has been escalated.`.trim() }).catch(() => {});
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Escalated', `Ticket #${result.ticket.ticket_number} has been escalated.`)], deleteAfterSeconds: 10 });
    return true;
  }

  if (id === CustomIds.TicketCloseReason || id === CustomIds.TicketClose) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsClose, ModuleKeys.TICKETS))) return true;
    const access = await tickets.canManageTicket({ interaction });
    if (!access.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Control Restricted', access.reason)] });
    await interaction.showModal(buildTicketCloseReasonModal());
    return true;
  }

  if (id === CustomIds.ReportOpen) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.ReportsSubmit, ModuleKeys.REPORTS))) return true;
    await replyPrivate(interaction, buildReportTargetPickerPayload());
    return true;
  }

  if (id === CustomIds.ReportNoUser) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.ReportsSubmit, ModuleKeys.REPORTS))) return true;
    await interaction.showModal(buildReportModal());
    return true;
  }

  if (id.startsWith(CustomIds.ReportClaimPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsClaim, ModuleKeys.REPORTS))) return true;
    const reportId = id.slice(CustomIds.ReportClaimPrefix.length);
    const report = await reports.claimReport({ guildId: interaction.guildId, reportId, reviewer: interaction.user, logger: ctx.logger });
    if (!report) return replyPrivate(interaction, { embeds: [createWarningEmbed('Report Not Found', 'The report could not be found or is already closed.')] });
    await updatePanel(interaction, buildReportReviewPayload(report));
    await reports.refreshReviewIndexes({ client: ctx.client, guildId: interaction.guildId }).catch(() => {});
    return true;
  }

  if (id.startsWith(CustomIds.ReportResolvePrefix) || id.startsWith(CustomIds.ReportDismissPrefix)) {
    const status = id.startsWith(CustomIds.ReportResolvePrefix) ? 'RESOLVED' : 'DISMISSED';
    const action = status === 'RESOLVED' ? ActionKeys.ReportsResolve : ActionKeys.ReportsDismiss;
    if (!(await requireAction(interaction, ctx, action, ModuleKeys.REPORTS))) return true;
    const reportId = id.replace(CustomIds.ReportResolvePrefix, '').replace(CustomIds.ReportDismissPrefix, '');
    await interaction.showModal(buildReportReviewReasonModal(reportId, status));
    return true;
  }

  if (id.startsWith(CustomIds.ReportDetailsPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsReview, ModuleKeys.REPORTS))) return true;
    await interaction.showModal(buildReportDetailsModal(id.slice(CustomIds.ReportDetailsPrefix.length)));
    return true;
  }

  if (id.startsWith(CustomIds.ReportOpenTicketPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsOpenTicket, ModuleKeys.REPORTS))) return true;
    const reportId = id.slice(CustomIds.ReportOpenTicketPrefix.length);
    const report = await reports.getReport(interaction.guildId, reportId);
    if (!report) return replyPrivate(interaction, { embeds: [createWarningEmbed('Report Not Found', 'The report could not be found.')] });
    const openerUser = await ctx.client.users.fetch(report.reporter_user_id).catch(() => null);
    if (!openerUser) return replyPrivate(interaction, { embeds: [createWarningEmbed('User Not Found', 'Could not fetch the report submitter.')] });
    const reviewerRoleIds = await reports.getReviewerRoleIds(interaction.guildId);
    const result = await tickets.createTicket({ interaction, client: ctx.client, logger: ctx.logger, openerUser, actorUser: interaction.user, type: 'Report Follow-Up', subject: `Report #${report.report_number} Follow-Up`, details: report.details, reviewerRoleIdsOverride: reviewerRoleIds, skipTicketLimit: true });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Created', result.reason)] });
    const updatedReport = await reports.linkTicket({ guildId: interaction.guildId, reportId, ticketId: result.ticket.id, reviewer: interaction.user });
    if (updatedReport) {
      await reports.refreshReviewMessage({ client: ctx.client, report: updatedReport }).catch(() => {});
      await interaction.message?.edit?.(buildReportReviewPayload(updatedReport)).catch(() => {});
    }
    await interaction.reply({ embeds: [createSuccessEmbed('Follow-Up Ticket Opened', `Created <#${result.channel.id}> for report #${report.report_number}.`)] });
    return true;
  }

  if (id.startsWith(CustomIds.ApplicationApplyPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.ApplicationsApply, ModuleKeys.APPLICATIONS))) return true;
    const typeId = id.slice(CustomIds.ApplicationApplyPrefix.length);
    const type = await applications.getTypeById(interaction.guildId, typeId);
    if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Type Not Found', 'That application type could not be found.')] });
    if (type.enabled === false) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Accepting Submissions', `The **${type.name}** application is not currently accepting submissions at this time.`)] });
    const result = await applications.startApplicationDm({ interaction, client: ctx.client, logger: ctx.logger, applicationType: type });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Started', result.reason)] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Started', `I sent you a DM with the first question. Question count: **${result.questionCount}**.`)] });
    return true;
  }

  if (id.startsWith(CustomIds.ApplicationApprovePrefix) || id.startsWith(CustomIds.ApplicationDenyPrefix)) {
    const isApprove = id.startsWith(CustomIds.ApplicationApprovePrefix);
    const action = isApprove ? ActionKeys.ApplicationsApprove : ActionKeys.ApplicationsDeny;
    if (!(await requireAction(interaction, ctx, action, ModuleKeys.APPLICATIONS))) return true;
    const submissionId = id.slice(isApprove ? CustomIds.ApplicationApprovePrefix.length : CustomIds.ApplicationDenyPrefix.length);
    await query(
      `UPDATE application_submissions SET review_channel_id = COALESCE(review_channel_id, $1), review_message_id = COALESCE(review_message_id, $2), updated_at = NOW() WHERE guild_id = $3 AND id = $4`,
      [interaction.channelId, interaction.message?.id || null, interaction.guildId, submissionId]
    ).catch(() => {});
    await interaction.showModal(buildApplicationReviewReasonModal(submissionId, isApprove ? 'APPROVED' : 'DENIED'));
    return true;
  }

  if (id.startsWith(CustomIds.ApplicationReviewThreadPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ApplicationsReview, ModuleKeys.APPLICATIONS))) return true;
    const submissionId = id.slice(CustomIds.ApplicationReviewThreadPrefix.length);
    const result = await applications.openReviewThread({ interaction, client: ctx.client, logger: ctx.logger, submissionId });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Review Thread Not Opened', result.reason)] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed(result.existing ? 'Review Thread Opened' : 'Review Thread Created', `Application #${result.submission.submission_number} review thread: <#${result.thread.id}>.`)] });
    return true;
  }


  if (id.startsWith(CustomIds.ApplicationReviewIndexFilterPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ApplicationsReview, ModuleKeys.APPLICATIONS))) return true;
    const rest = id.slice(CustomIds.ApplicationReviewIndexFilterPrefix.length);
    const [indexId, statusFilter] = rest.split(':');
    await interaction.deferUpdate();
    const index = await applications.updateReviewIndexFilter({ guildId: interaction.guildId, indexId, statusFilter });
    if (!index) {
      await interaction.followUp({ embeds: [createWarningEmbed('Review Index Not Found', 'This application review index could not be found.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    await applications.refreshReviewIndex({ client: ctx.client, index }).catch(() => {});
    return true;
  }

  if (id === CustomIds.AppealOpen) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.AppealsSubmit, ModuleKeys.APPEALS))) return true;
    await interaction.showModal(buildAppealModal());
    return true;
  }

  if (id.startsWith(CustomIds.AppealApproveReasonPrefix) || id.startsWith(CustomIds.AppealDenyReasonPrefix)) {
    const isApprove = id.startsWith(CustomIds.AppealApproveReasonPrefix);
    const action = isApprove ? ActionKeys.AppealsApprove : ActionKeys.AppealsDeny;
    if (!(await requireAction(interaction, ctx, action, ModuleKeys.APPEALS))) return true;
    const appealId = id.slice(isApprove ? CustomIds.AppealApproveReasonPrefix.length : CustomIds.AppealDenyReasonPrefix.length);
    await query(
      `UPDATE appeals SET review_channel_id = COALESCE(review_channel_id, $1), review_message_id = COALESCE(review_message_id, $2), updated_at = NOW() WHERE guild_id = $3 AND id = $4`,
      [interaction.channelId, interaction.message?.id || null, interaction.guildId, appealId]
    ).catch(() => {});
    await interaction.showModal(buildAppealReasonModal(appealId, isApprove ? 'APPROVED' : 'DENIED'));
    return true;
  }

  if (id.startsWith(CustomIds.AppealApprovePrefix) || id.startsWith(CustomIds.AppealDenyPrefix)) {
    const isApprove = id.startsWith(CustomIds.AppealApprovePrefix);
    const action = isApprove ? ActionKeys.AppealsApprove : ActionKeys.AppealsDeny;
    if (!(await requireAction(interaction, ctx, action, ModuleKeys.APPEALS))) return true;
    const appealId = id.slice(isApprove ? CustomIds.AppealApprovePrefix.length : CustomIds.AppealDenyPrefix.length);
    await query(
      `UPDATE appeals SET review_channel_id = COALESCE(review_channel_id, $1), review_message_id = COALESCE(review_message_id, $2), updated_at = NOW() WHERE guild_id = $3 AND id = $4`,
      [interaction.channelId, interaction.message?.id || null, interaction.guildId, appealId]
    ).catch(() => {});
    const appeal = await appeals.reviewAppeal({ interaction, client: ctx.client, logger: ctx.logger, appealId, status: isApprove ? 'APPROVED' : 'DENIED' });
    if (!appeal) return replyPrivate(interaction, { embeds: [createWarningEmbed('Appeal Not Found', 'The appeal could not be found.')] });
    await updatePanel(interaction, require('../modules/support/supportService').buildAppealReviewPayload(appeal));
    return true;
  }

  if (id === CustomIds.SetupStatus || id === CustomIds.StatusRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StatusView, ModuleKeys.STATUS))) return true;
    await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx));
    return true;
  }

  if (id === CustomIds.LoggingTest) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingConfigure, ModuleKeys.LOGGING))) return true;
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'system', title: 'SlickBot Test Log', body: `Test log created by ${interaction.user.tag}.`, actorUserId: interaction.user.id });
    await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.StatusActivityText) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StatusManage, ModuleKeys.STATUS))) return true;
    const saved = await ctx.status.getSavedPresence(interaction.guildId);
    await interaction.showModal(buildStatusActivityTextModal(saved?.activityText || null));
    return true;
  }

  if ([
    CustomIds.StatusQuickOnline,
    CustomIds.StatusQuickIdle,
    CustomIds.StatusQuickDnd,
    CustomIds.StatusClear,
    CustomIds.StatusActivityPlaying,
    CustomIds.StatusActivityWatching,
    CustomIds.StatusActivityListening,
    CustomIds.StatusActivityCompeting,
    CustomIds.StatusActivityStreaming,
    CustomIds.StatusActivityNone
  ].includes(id)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StatusManage, ModuleKeys.STATUS))) return true;
    if (id === CustomIds.StatusClear) {
      await ctx.status.clearPresence(interaction.guildId, true);
      await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx, 'Status cleared.'));
      return true;
    }

    const saved = await ctx.status.getSavedPresence(interaction.guildId);
    const current = saved || { status: PresenceStatus.ONLINE, activityType: ActivityTypeNames.WATCHING, activityText: 'the server', activityUrl: null, streamUrl: null };

    if ([CustomIds.StatusQuickOnline, CustomIds.StatusQuickIdle, CustomIds.StatusQuickDnd].includes(id)) {
      const status = id === CustomIds.StatusQuickOnline ? PresenceStatus.ONLINE : id === CustomIds.StatusQuickIdle ? PresenceStatus.IDLE : PresenceStatus.DND;
      const next = { ...current, status };
      await ctx.status.applyPresence(next);
      await ctx.status.savePresence(interaction.guildId, next);
      await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx, `Status set to ${status}.`));
      return true;
    }

    const activityMap = {
      [CustomIds.StatusActivityPlaying]: ActivityTypeNames.PLAYING,
      [CustomIds.StatusActivityWatching]: ActivityTypeNames.WATCHING,
      [CustomIds.StatusActivityListening]: ActivityTypeNames.LISTENING,
      [CustomIds.StatusActivityCompeting]: ActivityTypeNames.COMPETING,
      [CustomIds.StatusActivityStreaming]: ActivityTypeNames.STREAMING,
      [CustomIds.StatusActivityNone]: ActivityTypeNames.NONE
    };
    const activityType = activityMap[id] || ActivityTypeNames.NONE;
    if (activityType === ActivityTypeNames.STREAMING && !current.streamUrl && !current.activityUrl) {
      await replyPrivate(interaction, {
        embeds: [createWarningEmbed(
          'Streaming Activity Not Set',
          'Failed to set activity to Streaming because no stream URL is saved for SlickBot. Set a stream URL with `/status stream-url url:<stream-url>`.'
        )],
        deleteAfterSeconds: 15
      });
      return true;
    }

    const next = {
      ...current,
      activityType,
      activityText: activityType === ActivityTypeNames.NONE ? null : (current.activityText || 'the server'),
      activityUrl: activityType === ActivityTypeNames.STREAMING ? (current.streamUrl || current.activityUrl) : null,
      streamUrl: current.streamUrl || current.activityUrl || null
    };
    await ctx.status.applyPresence(next);
    await ctx.status.savePresence(interaction.guildId, next);
    await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx, activityType === ActivityTypeNames.NONE ? 'Activity cleared.' : `Activity type set to ${activityType}.`));
    return true;
  }


  if ([
    CustomIds.JoinCreateLockPrefix,
    CustomIds.JoinCreateUnlockPrefix,
    CustomIds.JoinCreateHidePrefix,
    CustomIds.JoinCreateUnhidePrefix,
    CustomIds.JoinCreateClaimPrefix,
    CustomIds.JoinCreateDeletePrefix,
    CustomIds.JoinCreateRenamePrefix,
    CustomIds.JoinCreateLimitPrefix,
    CustomIds.JoinCreateBitratePrefix,
    CustomIds.JoinCreatePermitPrefix,
    CustomIds.JoinCreateKickPrefix,
    CustomIds.JoinCreateBanPrefix,
    CustomIds.JoinCreateRemovePrefix,
    CustomIds.JoinCreateTransferPrefix,
    CustomIds.JoinCreateOwnerPanelPrefix
  ].some((prefix) => id.startsWith(prefix))) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    try {
      if (id.startsWith(CustomIds.JoinCreateLockPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateLockPrefix.length);
        const result = await joinCreate.setLockedFromControl(member, channelId, true);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Locked', body: `Channel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, locked: true } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Locked', `🔒 <#${result.channel.id}> is now locked.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateUnlockPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateUnlockPrefix.length);
        const result = await joinCreate.setLockedFromControl(member, channelId, false);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Unlocked', body: `Channel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, locked: false } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Unlocked', `🔓 <#${result.channel.id}> is now unlocked.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateHidePrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateHidePrefix.length);
        const result = await joinCreate.setHiddenFromControl(member, channelId, true);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Hidden', body: `Channel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, hidden: true } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Hidden', `👻 <#${result.channel.id}> is now hidden from the server channel list.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateUnhidePrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateUnhidePrefix.length);
        const result = await joinCreate.setHiddenFromControl(member, channelId, false);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Unhidden', body: `Channel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, hidden: false } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Visible', `👁️ <#${result.channel.id}> is now visible to everyone.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateClaimPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateClaimPrefix.length);
        const result = await joinCreate.claimFromControl(member, channelId);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Claimed', body: `Channel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Claimed', `👑 You now own <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateDeletePrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateDeletePrefix.length);
        await interaction.showModal(joinCreate.buildDeleteConfirmModal(channelId));
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateRenamePrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateRenamePrefix.length);
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        await interaction.showModal(joinCreate.buildRenameModal(channelId, channel?.name || null));
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateLimitPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateLimitPrefix.length);
        const temp = await joinCreate.findActiveTempByChannel(interaction.guildId, channelId);
        await interaction.showModal(joinCreate.buildLimitModal(channelId, temp?.user_limit || 0));
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateBitratePrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateBitratePrefix.length);
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        const currentKbps = channel?.bitrate ? Math.round(channel.bitrate / 1000) : 64;
        await interaction.showModal(joinCreate.buildBitrateModal(channelId, currentKbps));
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreatePermitPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreatePermitPrefix.length);
        await replyPrivate(interaction, joinCreate.buildUserSelectPayload(channelId, 'permit'));
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateKickPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateKickPrefix.length);
        await replyPrivate(interaction, joinCreate.buildUserSelectPayload(channelId, 'kick'));
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateBanPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateBanPrefix.length);
        await replyPrivate(interaction, joinCreate.buildUserSelectPayload(channelId, 'ban'));
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateRemovePrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateRemovePrefix.length);
        await replyPrivate(interaction, joinCreate.buildUserSelectPayload(channelId, 'remove'));
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateTransferPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateTransferPrefix.length);
        await replyPrivate(interaction, joinCreate.buildUserSelectPayload(channelId, 'transfer'));
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateOwnerPanelPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateOwnerPanelPrefix.length);
        await replyPrivate(interaction, await joinCreate.buildOwnerPanel(member, channelId));
        return true;
      }
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Temporary Voice Control Blocked', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
      return true;
    }
  }

  return false;
}

async function routeModuleToManager(interaction, ctx, moduleKey) {
  if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
  if (!moduleKey) return true;

  switch (moduleKey) {
    case ModuleKeys.PERMISSIONS:
      await updatePanel(interaction, await buildPermissionsPanel(interaction.guildId));
      break;
    case ModuleKeys.LOGGING:
      await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
      break;
    case ModuleKeys.STATUS:
      await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx));
      break;
    case ModuleKeys.MODERATION:
      await updatePanel(interaction, await buildModerationPanel(interaction.guildId));
      break;
    case ModuleKeys.AUTOMOD:
      await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'FILTERS'));
      break;
    case ModuleKeys.TEMP_ROLES:
      await updatePanel(interaction, await tempRoles.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.LOCKDOWN:
      await updatePanel(interaction, await lockdown.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.TICKETS:
      await updatePanel(interaction, await buildTicketsPanel(interaction.guildId));
      break;
    case ModuleKeys.REPORTS:
      await updatePanel(interaction, await buildReportsPanel(interaction.guildId));
      break;
    case ModuleKeys.APPLICATIONS:
      await updatePanel(interaction, await buildApplicationsPanel(interaction.guildId));
      break;
    case ModuleKeys.APPEALS:
      await updatePanel(interaction, await buildAppealsPanel(interaction.guildId));
      break;
    case ModuleKeys.WELCOME:
      await updatePanel(interaction, await buildWelcomePanel(interaction.guildId));
      break;
    case ModuleKeys.REACTION_ROLES:
      await updatePanel(interaction, await buildRoleManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.GIVEAWAYS:
      await updatePanel(interaction, await giveaways.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.BIRTHDAYS:
      await updatePanel(interaction, await birthdays.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.LEVELING:
      await updatePanel(interaction, await leveling.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.ACHIEVEMENTS:
      await updatePanel(interaction, await achievements.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.COMMUNITY_GAMES:
      await updatePanel(interaction, await communityGames.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.SUGGESTIONS:
      await updatePanel(interaction, await suggestions.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.FAQ:
      await updatePanel(interaction, await faq.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.REFERRALS:
      await updatePanel(interaction, await referrals.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.SERVER_STATS:
      await updatePanel(interaction, await serverStats.buildManagerPanel(interaction.guild));
      break;
    case ModuleKeys.CUSTOM_COMMANDS:
      await updatePanel(interaction, await customCommands.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.JOIN_TO_CREATE:
      await updatePanel(interaction, await joinCreate.buildManagerPanel(interaction.guild));
      break;
    case ModuleKeys.SCHEDULED_MESSAGES:
      await updatePanel(interaction, await scheduledMessages.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.BOT_UPDATES:
      await updatePanel(interaction, await botUpdates.buildStatusPanel(interaction.guildId));
      break;
    case ModuleKeys.SOCIAL_FEEDS:
      await updatePanel(interaction, await socialFeeds.buildManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.UTILITY:
      await updatePanel(interaction, await buildUtilityManagerPanel(interaction.guildId));
      break;
    case ModuleKeys.STARBOARD:
      await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, 'OVERVIEW'));
      break;
    default:
      await updatePanel(interaction, await buildModuleDetailPanel(interaction.guildId, moduleKey));
      break;
  }
  return true;
}

async function handleSelect(interaction, ctx) {
  const id = interaction.customId;

  if (id === CustomIds.HelpCategorySelect) {
    const selectedCategory = interaction.values?.[0] || 'MEMBER';
    await updatePanel(interaction, buildCategoryHelpPayload(selectedCategory, selectedCategory === 'MEMBER' ? 'member' : 'all', 1));
    return true;
  }

  if (id === CustomIds.HelpModuleSelect) {
    const selectedModule = interaction.values?.[0];
    await updatePanel(interaction, buildModuleHelpPayload(selectedModule));
    return true;
  }

  if (id === CustomIds.SetupModuleSelect || id === CustomIds.ModulesDetailSelect) {
    const moduleKey = interaction.values?.[0];
    return routeModuleToManager(interaction, ctx, moduleKey);
  }

  if (id.startsWith(CustomIds.CategoryToggleSelectPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    const categoryKey = id.slice(CustomIds.CategoryToggleSelectPrefix.length);
    const moduleKey = interaction.values?.[0];
    if (moduleKey && !isCoreModule(moduleKey)) {
      const current = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = $2 LIMIT 1`, [interaction.guildId, moduleKey]);
      const nextEnabled = !(current.rows[0]?.enabled);
      await ctx.permissions.setModuleEnabled(interaction.guildId, moduleKey, nextEnabled);
      await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.ModulesManage, targetType: 'ModuleConfig', targetId: moduleKey, summary: `${moduleKey} module ${nextEnabled ? 'enabled' : 'disabled'} via category quick toggle.` });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'module-config', title: `Module ${nextEnabled ? 'Enabled' : 'Disabled'}`, body: [`Module: **${moduleKey}**`, `Updated By: <@${interaction.user.id}>`, `Status: **${nextEnabled ? '🟢 Enabled' : '⏸️ Disabled'}**`].join('\n'), metadata: { moduleKey, enabled: nextEnabled, actorUserId: interaction.user.id } });
    }
    await updatePanel(interaction, await buildCategoryPanel(interaction.guildId, categoryKey));
    return true;
  }

  if (id === CustomIds.ModulesSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    const moduleKey = interaction.values?.[0];
    if (moduleKey && !isCoreModule(moduleKey)) {
      const current = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = $2 LIMIT 1`, [interaction.guildId, moduleKey]);
      const nextEnabled = !(current.rows[0]?.enabled);
      await ctx.permissions.setModuleEnabled(interaction.guildId, moduleKey, nextEnabled);
      await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.ModulesManage, targetType: 'ModuleConfig', targetId: moduleKey, summary: `${moduleKey} module ${nextEnabled ? 'enabled' : 'disabled'} via module select.` });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'module-config', title: `Module ${nextEnabled ? 'Enabled' : 'Disabled'}`, body: [`Module: **${moduleKey}**`, `Updated By: <@${interaction.user.id}>`, `Status: **${nextEnabled ? '🟢 Enabled' : '⏸️ Disabled'}**`].join('\n'), metadata: { moduleKey, enabled: nextEnabled, actorUserId: interaction.user.id } });
    }
    await updatePanel(interaction, await buildModulesPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.PermissionsSetAdminRole) {
    if (!(await requireAction(interaction, ctx, ActionKeys.PermissionsSetup, ModuleKeys.PERMISSIONS))) return true;
    const roleId = interaction.values?.[0];
    if (roleId) {
      await ctx.permissions.setupRoles(interaction.guildId, { adminRoleId: roleId });
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'permissions',
        title: 'Admin Role Updated',
        body: `Administrator role set to <@&${roleId}> by <@${interaction.user.id}>.`,
        actorUserId: interaction.user.id
      }).catch(() => {});
    }
    await updatePanel(interaction, await buildPermissionsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.PermissionsSetModRole) {
    if (!(await requireAction(interaction, ctx, ActionKeys.PermissionsSetup, ModuleKeys.PERMISSIONS))) return true;
    const roleId = interaction.values?.[0];
    if (roleId) {
      await ctx.permissions.setupRoles(interaction.guildId, { modRoleId: roleId });
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'permissions',
        title: 'Moderator Role Updated',
        body: `Moderator role set to <@&${roleId}> by <@${interaction.user.id}>.`,
        actorUserId: interaction.user.id
      }).catch(() => {});
    }
    await updatePanel(interaction, await buildPermissionsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ModerationSetLogChannel) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingSetup, ModuleKeys.LOGGING))) return true;
    const channelId = interaction.values?.[0];
    if (channelId) {
      const { LoggingService } = require('../modules/logging/loggingService');
      const logging = new LoggingService();
      await logging.setupLogGroup(interaction.guildId, 'MODERATION_SAFETY', channelId);
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'setup',
        title: 'Moderation Log Channel Configured',
        body: `Moderation logs mapped to <#${channelId}> by <@${interaction.user.id}>.`,
        actorUserId: interaction.user.id
      }).catch(() => {});
    }
    await updatePanel(interaction, await buildModerationPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ReportSetReviewChannel) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsSetup, ModuleKeys.REPORTS))) return true;
    const channelId = interaction.values?.[0];
    if (channelId) {
      await query(`INSERT INTO report_configs (guild_id, review_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [interaction.guildId, channelId]);
    }
    await updatePanel(interaction, await buildReportsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ReportSetPingRole) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsSetup, ModuleKeys.REPORTS))) return true;
    const roleId = interaction.values?.[0];
    if (roleId) {
      await query(`INSERT INTO report_configs (guild_id, ping_role_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET ping_role_id = EXCLUDED.ping_role_id, updated_at = NOW()`, [interaction.guildId, roleId]);
    }
    await updatePanel(interaction, await buildReportsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ApplicationSetReviewChannel) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ApplicationsSetup, ModuleKeys.APPLICATIONS))) return true;
    const channelId = interaction.values?.[0];
    if (channelId) {
      const types = await query(`SELECT id FROM application_types WHERE guild_id = $1 ORDER BY id ASC LIMIT 1`, [interaction.guildId]).catch(() => ({ rows: [] }));
      if (types.rows.length) {
        await query(`UPDATE application_types SET review_channel_id = $1 WHERE guild_id = $2`, [channelId, interaction.guildId]);
      } else {
        await query(`INSERT INTO application_types (guild_id, name, review_channel_id, enabled) VALUES ($1, 'Staff Application', $2, true)`, [interaction.guildId, channelId]);
      }
    }
    await updatePanel(interaction, await buildApplicationsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.AppealSetReviewChannel) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AppealsConfig, ModuleKeys.APPEALS))) return true;
    const channelId = interaction.values?.[0];
    if (channelId) {
      await query(`INSERT INTO appeal_configs (guild_id, review_channel_id, dm_decision_enabled) VALUES ($1, $2, true) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [interaction.guildId, channelId]);
    }
    await updatePanel(interaction, await buildAppealsPanel(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.PollSelectVotePrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.UtilityPollVote, ModuleKeys.UTILITY))) return true;
    const pollId = id.slice(CustomIds.PollSelectVotePrefix.length);
    try {
      const pollState = await utility.handleVote(pollId, interaction.values, interaction.user.id);
      const updatedPayload = utility.buildPollPayload(pollState.poll, pollState.options, pollState.totalVotes, pollState.userVotes);
      await interaction.update(updatedPayload);
    } catch (err) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Vote Failed', err.message || 'Could not record vote.')] });
    }
    return true;
  }

  if (id.startsWith(CustomIds.OnboardingChannelSelectPrefix) || id.startsWith(CustomIds.OnboardingRoleSelectPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    const isChannel = id.startsWith(CustomIds.OnboardingChannelSelectPrefix);
    const prefix = isChannel ? CustomIds.OnboardingChannelSelectPrefix : CustomIds.OnboardingRoleSelectPrefix;
    const sessionId = id.slice(prefix.length);
    const session = onboarding.getSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Session Expired', 'This onboarding session has expired. Please launch onboarding again.')], deleteAfterSeconds: 10 });
    await interaction.deferUpdate().catch(() => {});

    const selectedValue = interaction.values?.[0];
    const currentStep = session.steps[session.stepIndex];
    if (currentStep && typeof currentStep.applySelection === 'function' && selectedValue) {
      try {
        await currentStep.applySelection(interaction.guild, selectedValue, session);
      } catch (err) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Selection Failed', err instanceof Error ? err.message : String(err))] });
      }
    }
    await onboarding.advanceSession(session, interaction.guild, 'SELECT', { selected: selectedValue });
    const nextStep = session.steps[session.stepIndex];
    const currentVal = nextStep && typeof nextStep.getCurrent === 'function' ? await nextStep.getCurrent(interaction.guild).catch(() => null) : null;
    await updatePanel(interaction, onboarding.buildOnboardingPayload(session, currentVal));
    return true;
  }

  if (id.startsWith(CustomIds.GamePanelOpponentSelectPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.GamesPlay, ModuleKeys.COMMUNITY_GAMES))) return true;
    const gameKey = id.slice(CustomIds.GamePanelOpponentSelectPrefix.length);
    const label = gameKey === GAME_KEYS.TIC_TAC_TOE ? 'Tic-Tac-Toe' : 'Connect Four';
    const opponentId = interaction.values?.[0];
    const opponent = opponentId ? await interaction.client.users.fetch(opponentId).catch(() => null) : null;
    if (!opponent) return replyPrivate(interaction, { embeds: [createWarningEmbed(`${label} Challenge Not Started`, 'That member could not be found.')], deleteAfterSeconds: 10 });

    try {
      const result = await communityGames.createPanelChallenge({ interaction, gameKey, opponent });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed(`${label} Challenge Not Started`, result.reason)], deleteAfterSeconds: 15 });
      const message = await result.channel.send(communityGames.buildChallengePayload(result.session));
      const session = await communityGames.attachSessionMessage(result.session.id, message.id);
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'community-game-started',
        title: `${label} Challenge Created From Games Panel`,
        body: `Challenger: <@${interaction.user.id}>\nOpponent: <@${opponent.id}>\nChannel: <#${result.channel.id}>\nMessage: ${message.url}`,
        actorUserId: interaction.user.id,
        metadata: { game: gameKey, sessionId: session?.id || result.session.id, source: 'public_panel' }
      }).catch(() => {});
      await updatePanel(interaction, {
        embeds: [createSuccessEmbed(`${label} Challenge Started`, `Your ${label} challenge was posted in <#${result.channel.id}>.\n[Open game challenge](${message.url})`)],
        components: []
      });
    } catch (error) {
      await updatePanel(interaction, { embeds: [createWarningEmbed(`${label} Challenge Not Started`, error instanceof Error ? error.message : String(error))], components: [] });
    }
    return true;
  }

  if (id === CustomIds.HelpEnabledSelect || id === CustomIds.HelpDisabledSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Help, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildHelpPayload(interaction, ctx, {
      mode: id === CustomIds.HelpDisabledSelect ? 'disabled' : 'enabled',
      moduleKey: interaction.values[0]
    }));
    return true;
  }

  if (id === CustomIds.ModulesDetailSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildModuleDetailPanel(interaction.guildId, interaction.values[0]));
    return true;
  }

  if (id.startsWith(CustomIds.CategoryToggleSelectPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    const categoryKey = id.slice(CustomIds.CategoryToggleSelectPrefix.length);
    const moduleKey = interaction.values[0];
    if (!isImplementedModuleSafe(moduleKey)) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Module Coming Soon', `**${moduleKey}** has not been built yet.`)] });
    }
    if (isCoreModule(moduleKey)) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Core Module Locked', `**${moduleKey}** is a core SlickBot module and cannot be disabled.`)] });
    }
    const current = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = $2 LIMIT 1`, [interaction.guildId, moduleKey]);
    const nextEnabled = !(current.rows[0]?.enabled);
    await ctx.permissions.setModuleEnabled(interaction.guildId, moduleKey, nextEnabled);
    await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.ModulesManage, targetType: 'ModuleConfig', targetId: moduleKey, summary: `${moduleKey} module ${nextEnabled ? 'enabled' : 'disabled'} from category panel.` });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'module-config', title: `Module ${nextEnabled ? 'Enabled' : 'Disabled'}`, body: [`Module: **${moduleKey}**`, `Category: **${categoryKey}**`, `Updated By: <@${interaction.user.id}>`, `Status: **${nextEnabled ? '🟢 Enabled' : '⏸️ Disabled'}**`].join('\n'), metadata: { moduleKey, enabled: nextEnabled, actorUserId: interaction.user.id } });
    await updatePanel(interaction, await buildCategoryPanel(interaction.guildId, categoryKey));
    return true;
  }

  if (id === CustomIds.ModulesSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    const moduleKey = interaction.values[0];
    if (!isImplementedModuleSafe(moduleKey)) {
      await updatePanel(interaction, { embeds: [createBaseEmbed({ title: 'Module Coming Soon', description: `**${moduleKey}** has not been built yet, so it cannot be enabled or disabled.`, color: SlickBotColors.WARNING })], components: (await buildModulesPanel(interaction.guildId)).components });
      return true;
    }
    if (isCoreModule(moduleKey)) {
      await updatePanel(interaction, { embeds: [createBaseEmbed({ title: 'Core Module Locked', description: `**${moduleKey}** is a core SlickBot module and cannot be disabled.`, color: SlickBotColors.WARNING })], components: (await buildModulesPanel(interaction.guildId)).components });
      return true;
    }
    const current = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = $2 LIMIT 1`, [interaction.guildId, moduleKey]);
    const nextEnabled = !(current.rows[0]?.enabled);
    await ctx.permissions.setModuleEnabled(interaction.guildId, moduleKey, nextEnabled);
    await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.ModulesManage, targetType: 'ModuleConfig', targetId: moduleKey, summary: `${moduleKey} module ${nextEnabled ? 'enabled' : 'disabled'} from interactive panel.` });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'module-config', title: `Module ${nextEnabled ? 'Enabled' : 'Disabled'}`, body: [`Module: **${moduleKey}**`, `Updated By: <@${interaction.user.id}>`, 'Source: Interactive panel'].join('\n'), metadata: { moduleKey, enabled: nextEnabled, actorUserId: interaction.user.id } });
    await updatePanel(interaction, await buildModulesPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.PermissionsTeamSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.PermissionsPanel, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildPermissionsPanel(interaction.guildId, interaction.values[0]));
    return true;
  }

  if (id === CustomIds.TicketTypeSelect) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TicketsOpen, ModuleKeys.TICKETS))) return true;
    const typeId = interaction.values[0];
    const type = await tickets.getTypeById(interaction.guildId, typeId);
    if (!type || type.enabled === false) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Type Unavailable', 'This ticket type is not currently available.')] });
    await interaction.showModal(buildTicketModal(type));
    return true;
  }

  if (id === CustomIds.ReportSelect) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.ReportsSubmit, ModuleKeys.REPORTS))) return true;
    await replyPrivate(interaction, buildReportTargetPickerPayload());
    return true;
  }

  if (id === CustomIds.ReportUserSelect) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.ReportsSubmit, ModuleKeys.REPORTS))) return true;
    const targetUserId = interaction.values?.[0] || null;
    await interaction.showModal(buildReportModal(targetUserId));
    return true;
  }

  if (id === CustomIds.AppealSelect) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.AppealsSubmit, ModuleKeys.APPEALS))) return true;
    await interaction.showModal(buildAppealModal());
    return true;
  }

  if (id.startsWith(CustomIds.ApplicationSelectPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.ApplicationsApply, ModuleKeys.APPLICATIONS))) return true;
    const typeId = interaction.values[0] || id.slice(CustomIds.ApplicationSelectPrefix.length);
    const type = await applications.getTypeById(interaction.guildId, typeId);
    if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Type Not Found', 'That application type could not be found.')] });
    if (type.enabled === false) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Accepting Submissions', `The **${type.name}** application is not currently accepting submissions at this time.`)] });
    const result = await applications.startApplicationDm({ interaction, client: ctx.client, logger: ctx.logger, applicationType: type });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Started', result.reason)] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Started', `I sent you a DM with the first question. Question count: **${result.questionCount}**.`)] });
    return true;
  }


  if (id.startsWith(CustomIds.BirthdayMonthPrefix)) {
    const sessionId = id.slice(CustomIds.BirthdayMonthPrefix.length);
    const session = birthdays.getSetupSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Setup Not Found', 'This birthday setup session expired or belongs to another user.')], deleteAfterSeconds: 10 });
    birthdays.updateSetupSession(session, { month: Number(interaction.values[0]) });
    await updatePanel(interaction, birthdays.buildSetupSessionPayload(session));
    return true;
  }

  if (id.startsWith(CustomIds.BirthdayDayPrefix)) {
    const rest = id.slice(CustomIds.BirthdayDayPrefix.length);
    const sessionId = rest.split(':')[0];
    const session = birthdays.getSetupSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Setup Not Found', 'This birthday setup session expired or belongs to another user.')], deleteAfterSeconds: 10 });
    birthdays.updateSetupSession(session, { day: Number(interaction.values[0]) });
    await updatePanel(interaction, birthdays.buildSetupSessionPayload(session));
    return true;
  }

  if (id.startsWith(CustomIds.BirthdayTimezonePrefix)) {
    const sessionId = id.slice(CustomIds.BirthdayTimezonePrefix.length);
    const session = birthdays.getSetupSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Setup Not Found', 'This birthday setup session expired or belongs to another user.')], deleteAfterSeconds: 10 });
    birthdays.updateSetupSession(session, { timezone: interaction.values[0] });
    await updatePanel(interaction, birthdays.buildSetupSessionPayload(session));
    return true;
  }

  if (id === CustomIds.BirthdayListSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BirthdaysView, ModuleKeys.BIRTHDAYS))) return true;
    await updatePanel(interaction, await birthdays.buildListPanel(interaction.guildId, interaction.values[0] || 'ALL'));
    return true;
  }

  if ([
    CustomIds.JoinCreatePermitUserSelectPrefix,
    CustomIds.JoinCreateRemoveUserSelectPrefix,
    CustomIds.JoinCreateTransferUserSelectPrefix
  ].some((prefix) => id.startsWith(prefix))) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    const targetId = interaction.values?.[0];
    const target = targetId ? await interaction.guild.members.fetch(targetId).catch(() => null) : null;
    if (!target) return replyPrivate(interaction, { embeds: [createWarningEmbed('User Not Found', 'That user could not be found in this server.')], deleteAfterSeconds: 10 });

    try {
      if (id.startsWith(CustomIds.JoinCreatePermitUserSelectPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreatePermitUserSelectPrefix.length);
        const result = await joinCreate.permitUserFromControl(member, channelId, target);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice User Permitted From Control Panel', body: `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: target.id, inputType: 'user_select' } }).catch(() => {});
        await updatePanel(interaction, { embeds: [createSuccessEmbed('User Permitted', `<@${target.id}> can now join <#${result.channel.id}>.`)], components: [] });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateRemoveUserSelectPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateRemoveUserSelectPrefix.length);
        const result = await joinCreate.removeUserFromControl(member, channelId, target);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice User Removed From Control Panel', body: `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: target.id, inputType: 'user_select' } }).catch(() => {});
        await updatePanel(interaction, { embeds: [createSuccessEmbed('User Removed', `<@${target.id}> was removed or blocked from <#${result.channel.id}>.`)], components: [] });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateTransferUserSelectPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateTransferUserSelectPrefix.length);
        const result = await joinCreate.transferFromControl(member, channelId, target);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Ownership Transferred From Control Panel', body: `Channel: <#${result.channel.id}>\nNew Owner: <@${target.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: target.id, inputType: 'user_select' } }).catch(() => {});
        await updatePanel(interaction, { embeds: [createSuccessEmbed('Ownership Transferred', `<#${result.channel.id}> is now owned by <@${target.id}>.`)], components: [] });
        return true;
      }
    } catch (error) {
      await updatePanel(interaction, { embeds: [createWarningEmbed('Temporary Voice Control Blocked', error instanceof Error ? error.message : String(error))], components: [] });
      return true;
    }
  }

  if (id.startsWith(CustomIds.RolePanelSelectPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.RolePanelsUse, ModuleKeys.REACTION_ROLES))) return true;
    const panelId = id.slice(CustomIds.RolePanelSelectPrefix.length);
    const optionId = interaction.values[0];
    const result = await toggleRole({ interaction, panelId, optionId, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Role Not Updated', result.reason)], deleteAfterSeconds: 10 });
    await acknowledgeQuietly(interaction);
    return true;
  }

  // --- Auto-Mod Select Menus ---

  if (id === CustomIds.AutoModRuleSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModView, ModuleKeys.AUTOMOD))) return true;
    const ruleKey = interaction.values[0];
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'FILTERS', ruleKey));
    return true;
  }

  if (id === CustomIds.AutoModRoleExemptSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModWhitelist, ModuleKeys.AUTOMOD))) return true;
    await autoMod.upsertConfig(interaction.guildId, { exempt_roles: interaction.values });
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'WHITELIST'));
    return true;
  }

  if (id === CustomIds.AutoModChannelExemptSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModWhitelist, ModuleKeys.AUTOMOD))) return true;
    await autoMod.upsertConfig(interaction.guildId, { exempt_channels: interaction.values });
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'WHITELIST'));
    return true;
  }

  if (id === CustomIds.AutoModRaidChannelSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModRaid, ModuleKeys.AUTOMOD))) return true;
    const channelId = interaction.values[0];
    await autoMod.upsertConfig(interaction.guildId, { raid_alert_channel_id: channelId });
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'RAID'));
    return true;
  }

  if (id === CustomIds.AutoModRaidSensitivitySelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModRaid, ModuleKeys.AUTOMOD))) return true;
    const [threshold, seconds] = interaction.values[0].split(':').map(Number);
    await autoMod.upsertConfig(interaction.guildId, { raid_join_threshold: threshold, raid_join_seconds: seconds });
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'RAID'));
    return true;
  }

  if (id === CustomIds.AutoModRaidAgeSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModRaid, ModuleKeys.AUTOMOD))) return true;
    const hours = Number(interaction.values[0]);
    await autoMod.upsertConfig(interaction.guildId, { raid_min_account_age_hours: hours });
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'RAID'));
    return true;
  }

  if (id === CustomIds.AutoModTimeoutRoleSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    await interaction.deferUpdate().catch(() => {});
    const roleId = interaction.values?.[0] || null;
    await autoMod.upsertConfig(interaction.guildId, { timeout_role_id: roleId });
    if (roleId) {
      await autoMod.syncTimeoutRolePermissions(interaction.guild, { timeoutRoleId: roleId });
    }
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'TIMEOUT'));
    return true;
  }

  if (id === CustomIds.AutoModTimeoutRoleExemptSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModWhitelist, ModuleKeys.AUTOMOD))) return true;
    await interaction.deferUpdate().catch(() => {});
    await autoMod.upsertConfig(interaction.guildId, { timeout_role_exempt_channel_ids: interaction.values || [] });
    await autoMod.syncTimeoutRolePermissions(interaction.guild);
    await updatePanel(interaction, await buildAutoModManagerPanel(interaction.guildId, 'TIMEOUT'));
    return true;
  }

  // --- Starboard Select Menus ---

  if (id === CustomIds.StarboardChannelSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    await interaction.deferUpdate().catch(() => {});
    const channelId = interaction.values[0];
    await starboard.upsertConfig(interaction.guildId, { channel_id: channelId, enabled: true });
    await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, 'OVERVIEW'));
    return true;
  }

  if (id === CustomIds.StarboardChannelExemptSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    await interaction.deferUpdate().catch(() => {});
    await starboard.upsertConfig(interaction.guildId, { ignored_channels: interaction.values || [] });
    await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, 'EXCLUSIONS'));
    return true;
  }

  if (id === CustomIds.StarboardRoleExemptSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    await interaction.deferUpdate().catch(() => {});
    await starboard.upsertConfig(interaction.guildId, { ignored_roles: interaction.values || [] });
    await updatePanel(interaction, await buildStarboardPanel(interaction.guildId, 'EXCLUSIONS'));
    return true;
  }

  // --- Join-to-Create Temporary Voice Select Menus ---
  if ([
    CustomIds.JoinCreatePermitUserSelectPrefix,
    CustomIds.JoinCreateKickUserSelectPrefix,
    CustomIds.JoinCreateBanUserSelectPrefix,
    CustomIds.JoinCreateRemoveUserSelectPrefix,
    CustomIds.JoinCreateTransferUserSelectPrefix
  ].some((prefix) => id.startsWith(prefix))) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    const targetUserId = interaction.values?.[0] || (interaction.users?.first()?.id);
    if (!targetUserId) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Selection Required', 'No user was selected.')], deleteAfterSeconds: 8 });
      return true;
    }
    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
    if (!targetMember) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Member Not Found', 'The selected member is no longer in this server.')], deleteAfterSeconds: 8 });
      return true;
    }

    try {
      if (id.startsWith(CustomIds.JoinCreatePermitUserSelectPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreatePermitUserSelectPrefix.length);
        const result = await joinCreate.permitUserFromControl(member, channelId, targetMember);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'User Permitted into Voice', body: `Member: <@${targetMember.id}>\nChannel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: targetMember.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Permitted', `✅ <@${targetMember.id}> can now view and join <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateKickUserSelectPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateKickUserSelectPrefix.length);
        const result = await joinCreate.kickUserFromControl(member, channelId, targetMember);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'User Kicked from Voice', body: `Member: <@${targetMember.id}>\nChannel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: targetMember.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Kicked', `🚪 <@${targetMember.id}> was kicked from <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateBanUserSelectPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateBanUserSelectPrefix.length);
        const result = await joinCreate.banUserFromControl(member, channelId, targetMember);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'User Blocked from Voice', body: `Member: <@${targetMember.id}>\nChannel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: targetMember.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Blocked', `⛔ <@${targetMember.id}> was blocked and banned from joining <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateRemoveUserSelectPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateRemoveUserSelectPrefix.length);
        const result = await joinCreate.removeUserFromControl(member, channelId, targetMember);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'User Access Removed from Voice', body: `Member: <@${targetMember.id}>\nChannel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: targetMember.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Removed', `Removed join access for <@${targetMember.id}> in <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateTransferUserSelectPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateTransferUserSelectPrefix.length);
        const result = await joinCreate.transferFromControl(member, channelId, targetMember);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Ownership Transferred', body: `New Owner: <@${targetMember.id}>\nChannel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, newOwnerUserId: targetMember.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ownership Transferred', `👑 <@${targetMember.id}> is now the owner of <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Voice Action Failed', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
      return true;
    }
  }

  return false;
}

async function handleModal(interaction, ctx) {
  const id = interaction.customId;

  if (id === CustomIds.HelpSearchModalSubmit) {
    const query = interaction.fields.getTextInputValue('query');
    await replyPrivate(interaction, handleHelpSearch(query));
    return true;
  }

  if (id === CustomIds.UtilitySetupModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.UtilityManage, ModuleKeys.UTILITY))) return true;
    const pollChan = interaction.fields.getTextInputValue('default_poll_channel_id')?.trim() || null;
    const maxRem = parseInt(interaction.fields.getTextInputValue('max_reminders_per_user')?.trim(), 10) || 10;
    await utility.upsertConfig(interaction.guildId, {
      default_poll_channel_id: pollChan,
      max_reminders_per_user: Math.max(1, Math.min(50, maxRem))
    });
    await updatePanel(interaction, await buildUtilityManagerPanel(interaction.guildId));
    return true;
  }

  if (id.startsWith(CustomIds.EmbedEditModalPrefix)) {
    const raw = id.slice(CustomIds.EmbedEditModalPrefix.length);
    const [channelId, rolePingOrMessageId] = raw.split(':');
    const title = interaction.fields.getTextInputValue('embed_title')?.trim() || null;
    const description = interaction.fields.getTextInputValue('embed_desc')?.trim() || '';
    const color = interaction.fields.getTextInputValue('embed_color')?.trim() || '#7869ff';
    const imageUrl = interaction.fields.getTextInputValue('embed_image')?.trim() || null;
    const thumbnailUrl = interaction.fields.getTextInputValue('embed_thumb')?.trim() || null;

    const preview = buildEmbedPreviewPayload({
      title,
      description,
      color,
      imageUrl,
      thumbnailUrl
    }, channelId, rolePingOrMessageId);

    await replyPrivate(interaction, preview);
    return true;
  }

  if (id.startsWith(CustomIds.EmbedAddFieldModalPrefix)) {
    const channelId = id.slice(CustomIds.EmbedAddFieldModalPrefix.length);
    const name = interaction.fields.getTextInputValue('field_name')?.trim();
    const value = interaction.fields.getTextInputValue('field_value')?.trim();
    const inline = /^(yes|y|true|1)$/i.test(interaction.fields.getTextInputValue('field_inline')?.trim());

    const currentEmbed = interaction.message.embeds[1] || interaction.message.embeds[0];
    const fields = currentEmbed?.fields ? [...currentEmbed.fields] : [];
    fields.push({ name, value, inline });

    const preview = buildEmbedPreviewPayload({
      title: currentEmbed?.title,
      description: currentEmbed?.description,
      color: currentEmbed?.hexColor,
      imageUrl: currentEmbed?.image?.url,
      thumbnailUrl: currentEmbed?.thumbnail?.url,
      fields
    }, channelId);

    await interaction.update(preview);
    return true;
  }

  if (id === CustomIds.StatusActivityTextModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StatusManage, ModuleKeys.STATUS))) return true;
    const activityText = String(interaction.fields.getTextInputValue('activity_text') || '').trim();
    if (!activityText) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Activity Text Required', 'Enter the activity text SlickBot should display, or use Clear Activity to remove the activity.')], deleteAfterSeconds: 10 });
      return true;
    }

    const saved = await ctx.status.getSavedPresence(interaction.guildId);
    const current = saved || { status: PresenceStatus.ONLINE, activityType: ActivityTypeNames.WATCHING, activityText: null, activityUrl: null, streamUrl: null };
    const activityType = current.activityType && current.activityType !== ActivityTypeNames.NONE ? current.activityType : ActivityTypeNames.WATCHING;

    if (activityType === ActivityTypeNames.STREAMING && !current.streamUrl && !current.activityUrl) {
      await replyPrivate(interaction, {
        embeds: [createWarningEmbed('Streaming Activity Not Set', 'Failed to save activity text for Streaming because no stream URL is saved for SlickBot. Set a stream URL with `/status stream-url url:<stream-url>`.')],
        deleteAfterSeconds: 15
      });
      return true;
    }

    const next = {
      ...current,
      activityType,
      activityText,
      activityUrl: activityType === ActivityTypeNames.STREAMING ? (current.streamUrl || current.activityUrl) : current.activityUrl,
      streamUrl: current.streamUrl || current.activityUrl || null
    };

    await ctx.status.applyPresence(next);
    await ctx.status.savePresence(interaction.guildId, next);
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'status', title: 'Bot Activity Text Updated', body: [`Updated By: <@${interaction.user.id}>`, `Activity: **${activityType}**`, `Text: ${activityText}`].join('\n'), metadata: { activityType, activityText, actorUserId: interaction.user.id } }).catch(() => {});
    await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx, 'Activity text updated.'));
    return true;
  }

  if (id.startsWith(CustomIds.BirthdayDayModalPrefix)) {
    const sessionId = id.slice(CustomIds.BirthdayDayModalPrefix.length);
    const session = birthdays.getSetupSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Setup Not Found', 'This birthday setup session expired or belongs to another user.')], deleteAfterSeconds: 10 });
    const day = Number(interaction.fields.getTextInputValue('day'));
    birthdays.updateSetupSession(session, { day: Number.isInteger(day) ? day : null });
    await updatePanel(interaction, birthdays.buildSetupSessionPayload(session));
    return true;
  }

  if (id.startsWith(CustomIds.BirthdayTimezoneModalPrefix)) {
    const sessionId = id.slice(CustomIds.BirthdayTimezoneModalPrefix.length);
    const session = birthdays.getSetupSession(sessionId, interaction.user.id);
    if (!session) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Setup Not Found', 'This birthday setup session expired or belongs to another user.')], deleteAfterSeconds: 10 });
    const timezone = interaction.fields.getTextInputValue('timezone');
    birthdays.updateSetupSession(session, { timezone });
    await updatePanel(interaction, birthdays.buildSetupSessionPayload(session));
    return true;
  }

  if (id.startsWith(CustomIds.TicketModalPrefix) || id === CustomIds.TicketModal) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TicketsOpen, ModuleKeys.TICKETS))) return true;
    const typeId = id.startsWith(CustomIds.TicketModalPrefix) ? id.slice(CustomIds.TicketModalPrefix.length) : null;
    const ticketType = typeId && typeId !== 'default' ? await tickets.getTypeById(interaction.guildId, typeId) : await tickets.ensureDefaultType(interaction.guildId);
    const questions = parseQuestions(ticketType?.questions);
    const answers = {};
    questions.slice(0, 4).forEach((question, index) => {
      const value = interaction.fields.getTextInputValue(`q${index}`);
      answers[question.label || `Question ${index + 1}`] = value;
    });
    const result = await tickets.createTicket({ interaction, client: ctx.client, logger: ctx.logger, ticketType, subject: interaction.fields.getTextInputValue('subject'), answers });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Created', result.reason)] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Created', `Your ticket was created: <#${result.channel.id}>.`)] });
    return true;
  }

  if (id === CustomIds.TicketCloseReasonModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsClose, ModuleKeys.TICKETS))) return true;
    const access = await tickets.canManageTicket({ interaction });
    if (!access.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Control Restricted', access.reason)] });
    const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided.';
    const result = await tickets.closeTicket({ interaction, client: ctx.client, logger: ctx.logger, reason });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
    await interaction.reply({ embeds: [createSuccessEmbed('Ticket Closed', `Ticket #${result.ticket.ticket_number} closed. Transcript sent: **${result.transcriptSent ? 'Yes' : 'No'}**.`)] });
    if (result.shouldDelete) scheduleTicketDeletion(interaction.channel, result.deleteSeconds || 10).catch((error) => console.error('Failed to schedule ticket deletion:', error));
    return true;
  }

  if (id === CustomIds.ReportModal || id.startsWith(CustomIds.ReportUserModalPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.ReportsSubmit, ModuleKeys.REPORTS))) return true;
    const targetUserId = id.startsWith(CustomIds.ReportUserModalPrefix) ? id.slice(CustomIds.ReportUserModalPrefix.length) : null;
    const details = interaction.fields.getTextInputValue('details');
    let targetUser = null;
    if (targetUserId) targetUser = await ctx.client.users.fetch(targetUserId).catch(() => null);
    const report = await reports.createReport({ interaction, client: ctx.client, logger: ctx.logger, type: targetUser ? 'User Report' : 'Panel Report', targetUser, details });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Report Submitted', `Report #${report.report_number} was sent to staff.`)] });
    return true;
  }

  if (id.startsWith(CustomIds.ReportDetailsModalPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsReview, ModuleKeys.REPORTS))) return true;
    const reportId = id.slice(CustomIds.ReportDetailsModalPrefix.length);
    const report = await reports.addDetails({ guildId: interaction.guildId, reportId, reviewer: interaction.user, details: interaction.fields.getTextInputValue('details'), logger: ctx.logger });
    if (!report) return replyPrivate(interaction, { embeds: [createWarningEmbed('Report Not Found', 'The report could not be found.')] });
    await reports.refreshReviewMessage({ client: ctx.client, report }).catch(() => {});
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Report Details Added', `Details were added to report #${report.report_number}.`)] });
    return true;
  }

  if (id.startsWith(CustomIds.ReportReviewReasonModalPrefix)) {
    const rest = id.slice(CustomIds.ReportReviewReasonModalPrefix.length);
    const [status, reportId] = rest.split(':');
    const action = status === 'RESOLVED' ? ActionKeys.ReportsResolve : ActionKeys.ReportsDismiss;
    if (!(await requireAction(interaction, ctx, action, ModuleKeys.REPORTS))) return true;
    const reason = interaction.fields.getTextInputValue('reason') || null;
    const report = await reports.reviewReport({ guildId: interaction.guildId, reportId, reviewer: interaction.user, status, reason, logger: ctx.logger });
    if (!report) return replyPrivate(interaction, { embeds: [createWarningEmbed('Report Not Found', 'The report could not be found.')] });
    await reports.refreshReviewMessage({ client: ctx.client, report }).catch(() => {});
    await reports.refreshReviewIndexes({ client: ctx.client, guildId: interaction.guildId }).catch(() => {});
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Report Reviewed', `Report #${report.report_number} marked **${report.status}**.`)] });
    return true;
  }

  if (id === CustomIds.AppealModal) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.AppealsSubmit, ModuleKeys.APPEALS))) return true;
    const rawCase = interaction.fields.getTextInputValue('case_number') || '';
    const caseNumber = rawCase.trim() ? Number(rawCase.replace(/[^0-9]/g, '')) : null;
    const appeal = await appeals.submitAppeal({ interaction, client: ctx.client, logger: ctx.logger, caseNumber: Number.isFinite(caseNumber) ? caseNumber : null, reason: interaction.fields.getTextInputValue('reason'), details: interaction.fields.getTextInputValue('details') || null });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal Submitted', `Appeal #${appeal.appeal_number} was sent to staff.`)] });
    return true;
  }

  if (id.startsWith(CustomIds.AppealReasonModalPrefix)) {
    const rest = id.slice(CustomIds.AppealReasonModalPrefix.length);
    const [status, appealId] = rest.split(':');
    const action = status === 'APPROVED' ? ActionKeys.AppealsApprove : ActionKeys.AppealsDeny;
    if (!(await requireAction(interaction, ctx, action, ModuleKeys.APPEALS))) return true;
    const reason = interaction.fields.getTextInputValue('reason') || null;
    const appeal = await appeals.reviewAppeal({ interaction, client: ctx.client, logger: ctx.logger, appealId, status, reason });
    if (!appeal) return replyPrivate(interaction, { embeds: [createWarningEmbed('Appeal Not Found', 'The appeal could not be found.')] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal Reviewed', `Appeal #${appeal.appeal_number} marked **${appeal.status}**.`)] });
    return true;
  }

  if (id.startsWith(CustomIds.ApplicationReviewReasonModalPrefix)) {
    const rest = id.slice(CustomIds.ApplicationReviewReasonModalPrefix.length);
    const [status, submissionId] = rest.split(':');
    const action = status === 'APPROVED' ? ActionKeys.ApplicationsApprove : ActionKeys.ApplicationsDeny;
    if (!(await requireAction(interaction, ctx, action, ModuleKeys.APPLICATIONS))) return true;
    const reason = interaction.fields.getTextInputValue('reason') || null;
    const submission = await applications.reviewApplication({ interaction, client: ctx.client, logger: ctx.logger, submissionId, status, reason });
    if (!submission) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Found', 'The application could not be found.')] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Reviewed', `Application #${submission.submission_number} marked **${submission.status}**. The review message was updated and a transcript was attached.`)] });
    return true;
  }

  if ([
    CustomIds.JoinCreateRenameModalPrefix,
    CustomIds.JoinCreateLimitModalPrefix,
    CustomIds.JoinCreatePermitModalPrefix,
    CustomIds.JoinCreateRemoveModalPrefix,
    CustomIds.JoinCreateTransferModalPrefix,
    CustomIds.JoinCreateDeleteConfirmPrefix
  ].some((prefix) => id.startsWith(prefix))) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    try {
      if (id.startsWith(CustomIds.JoinCreateRenameModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateRenameModalPrefix.length);
        const result = await joinCreate.renameTempFromControl(member, channelId, interaction.fields.getTextInputValue('name'));
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Renamed From Control Panel', body: `Channel: <#${result.channel.id}>\nName: **${result.channel.name}**`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Renamed', `<#${result.channel.id}> is now **${result.channel.name}**.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateLimitModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateLimitModalPrefix.length);
        const limit = Number(interaction.fields.getTextInputValue('limit'));
        if (!Number.isInteger(limit) || limit < 0 || limit > 99) throw new Error('User limit must be a whole number from 0 to 99. Use 0 for no limit.');
        const result = await joinCreate.setLimitFromControl(member, channelId, limit);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Limit Updated From Control Panel', body: `Channel: <#${result.channel.id}>\nLimit: **${result.temp.user_limit || 0}**`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, userLimit: result.temp.user_limit || 0 } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Limit Updated', `<#${result.channel.id}> now has a user limit of **${result.temp.user_limit || 0}**.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreatePermitModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreatePermitModalPrefix.length);
        const target = await resolveGuildMemberFromInput(interaction.guild, interaction.fields.getTextInputValue('user'));
        const result = await joinCreate.permitUserFromControl(member, channelId, target);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice User Permitted From Control Panel', body: `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: target.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Permitted', `<@${target.id}> can now join <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateRemoveModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateRemoveModalPrefix.length);
        const target = await resolveGuildMemberFromInput(interaction.guild, interaction.fields.getTextInputValue('user'));
        const result = await joinCreate.removeUserFromControl(member, channelId, target);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice User Removed From Control Panel', body: `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: target.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Removed', `<@${target.id}> was removed or blocked from <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateTransferModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateTransferModalPrefix.length);
        const target = await resolveGuildMemberFromInput(interaction.guild, interaction.fields.getTextInputValue('user'));
        const result = await joinCreate.transferFromControl(member, channelId, target);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Ownership Transferred From Control Panel', body: `Channel: <#${result.channel.id}>\nNew Owner: <@${target.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, targetUserId: target.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ownership Transferred', `<#${result.channel.id}> is now owned by <@${target.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateDeleteConfirmPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateDeleteConfirmPrefix.length);
        const confirm = String(interaction.fields.getTextInputValue('confirm') || '').trim().toUpperCase();
        if (confirm !== 'DELETE') throw new Error('Deletion cancelled. Type DELETE exactly to delete the temporary channel.');
        const temp = await joinCreate.deleteTempFromControl(member, channelId, ctx.logger);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Deleted From Control Panel', body: `Channel ID: ${temp.channel_id}`, actorUserId: interaction.user.id, metadata: { channelId: temp.channel_id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Deleted', 'Your temporary voice channel was deleted.')], deleteAfterSeconds: 8 });
        return true;
      }
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Temporary Voice Control Blocked', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
      return true;
    }
  }


  if (id.startsWith(CustomIds.SuggestionSubmitModalPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.SuggestionsSubmit, ModuleKeys.SUGGESTIONS))) return true;
    const config = await suggestions.getConfig(interaction.guildId).catch(() => null);
    const anonymous = suggestions.parseAnonymousInput(interaction.fields.getTextInputValue('anonymous'), config?.default_anonymous !== false);
    const result = await suggestions.submitSuggestion({
      guild: interaction.guild,
      user: interaction.user,
      title: interaction.fields.getTextInputValue('title'),
      description: interaction.fields.getTextInputValue('description'),
      categoryName: interaction.fields.getTextInputValue('category') || 'Other',
      anonymous,
      client: ctx.client,
      logger: ctx.logger
    }).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }));
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Suggestion Not Submitted', result.reason || 'SlickBot could not submit your suggestion.')] });
    return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestion Submitted', `Suggestion **#${result.suggestion.suggestion_number}** was posted.\n${result.message?.url || ''}`)], deleteAfterSeconds: 12 });
  }

  if (id.startsWith(CustomIds.SuggestionReviewDetailsModalPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.SuggestionsReview, ModuleKeys.SUGGESTIONS))) return true;
    const rest = id.slice(CustomIds.SuggestionReviewDetailsModalPrefix.length);
    const [suggestionId, status] = rest.split(':');
    const details = interaction.fields.getTextInputValue('details')?.trim();
    if (status) {
      const result = await suggestions.updateStatus({ guild: interaction.guild, suggestionNumber: suggestionId, status, response: details || undefined, actorUser: interaction.user, logger: ctx.logger }).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }));
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Suggestion Not Updated', result.reason || 'SlickBot could not update this suggestion.')] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestion Updated', `Suggestion **#${result.suggestion.suggestion_number}** is now **${status.replace(/_/g, ' ')}**.`)], deleteAfterSeconds: 8 });
    }
    const result = await suggestions.addDetails({ guild: interaction.guild, suggestionNumber: suggestionId, details, actorUser: interaction.user, logger: ctx.logger }).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }));
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Details Not Added', result.reason || 'SlickBot could not add these details.')] });
    return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestion Details Added', `Added details to suggestion **#${result.suggestion.suggestion_number}**.`)], deleteAfterSeconds: 8 });
  }

  if (id.startsWith(CustomIds.FaqAnswerModalPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.FaqAnswer, ModuleKeys.FAQ))) return true;
    const rest = id.slice(CustomIds.FaqAnswerModalPrefix.length);
    const [channelId, messageId] = rest.split(':');
    const question = interaction.fields.getTextInputValue('question');
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    const targetMessage = channel?.messages?.fetch ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (!targetMessage) return replyPrivate(interaction, { embeds: [createWarningEmbed('Message Not Found', 'SlickBot could not fetch the selected message.')] });
    const result = await faq.sendFaqAnswer({ guild: interaction.guild, channel: interaction.channel, actorUser: interaction.user, question, targetMessage, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Reply Not Sent', result.reason)] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Reply Sent', `Linked FAQ: **${result.thread.name}**.`)], deleteAfterSeconds: 10 });
    return true;
  }

  if (id.startsWith(CustomIds.PanelDesignModalPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.PanelsConfigure, ModuleKeys.PERMISSIONS))) return true;
    const { target, name } = parsePanelDesignModalId(id);
    const result = await updatePanelDesign({
      guildId: interaction.guildId,
      target,
      name,
      title: interaction.fields.getTextInputValue('title') || null,
      description: interaction.fields.getTextInputValue('description') || null,
      color: interaction.fields.getTextInputValue('color') || null,
      headerImageUrl: interaction.fields.getTextInputValue('header_image') || null
    });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Not Updated', result.reason)] });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Panel Design Updated', body: `${result.target} was updated by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
    const refresh = await refreshPublishedPanelFromResult(ctx.client, interaction.guildId, result).catch(() => null);
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Panel Design Updated', `${result.target} design settings were updated.${formatRefreshSummary(refresh) || '\nFuture posted panels will use the new design.'}`)] });
    return true;
  }

  if (id === CustomIds.WelcomeEditModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.WelcomeConfigure, ModuleKeys.WELCOME))) return true;
    const embedTitle = interaction.fields.getTextInputValue('embed_title')?.trim() || null;
    const embedDescription = interaction.fields.getTextInputValue('embed_description')?.trim() || null;
    const embedColor = interaction.fields.getTextInputValue('embed_color')?.trim() || null;
    const dmMessage = interaction.fields.getTextInputValue('dm_message')?.trim() || null;
    await upsertWelcomeConfig({
      guildId: interaction.guildId,
      embedTitle,
      embedDescription,
      embedColor,
      dmMessage
    });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'welcome-config', title: 'Welcome Messages Updated', body: `Welcome configuration updated via interactive modal by <@${interaction.user.id}>.`, actorUserId: interaction.user.id }).catch(() => {});
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Welcome Config Saved', 'Your welcome messages and styling settings were updated successfully!')] });
    return true;
  }

  if (id === CustomIds.GiveawaysQuickStartModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysManage, ModuleKeys.GIVEAWAYS))) return true;
    const prize = interaction.fields.getTextInputValue('prize')?.trim();
    const duration = interaction.fields.getTextInputValue('duration')?.trim();
    const winners = Number(interaction.fields.getTextInputValue('winners') || 1);
    const description = interaction.fields.getTextInputValue('description')?.trim() || null;
    const result = await giveaways.startGiveaway({
      interaction,
      client: ctx.client,
      logger: ctx.logger,
      prize,
      duration,
      winnerCount: Math.max(1, Math.min(winners || 1, 50)),
      description
    });
    if (!result.ok) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Not Started', result.reason || 'Could not start giveaway.')] });
    }
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Started', `Your giveaway for **${prize}** has begun in <#${result.channel.id}>!`)] });
    return true;
  }

  if (id === CustomIds.GiveawaysConfigModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysManage, ModuleKeys.GIVEAWAYS))) return true;
    const panelColor = interaction.fields.getTextInputValue('panel_color')?.trim() || null;
    const headerImageUrl = interaction.fields.getTextInputValue('header_image')?.trim() || null;
    await giveaways.updateConfig(interaction.guildId, { panelColor, panelHeaderImageUrl: headerImageUrl });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Styling Saved', 'Default giveaway embed styling updated!')] });
    return true;
  }

  if (id === CustomIds.BirthdaysEditModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BirthdaysConfigure, ModuleKeys.BIRTHDAYS))) return true;
    const template = interaction.fields.getTextInputValue('template')?.trim() || null;
    const timezone = interaction.fields.getTextInputValue('timezone')?.trim() || null;
    await birthdays.setup(interaction.guildId, {
      announcementTemplate: template,
      timezone: timezone || 'America/New_York'
    });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'birthday-config', title: 'Birthday Settings Updated', body: `Birthday template & timezone updated by <@${interaction.user.id}>.`, actorUserId: interaction.user.id }).catch(() => {});
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Birthday Settings Saved', 'Birthday announcement template and default timezone updated!')] });
    return true;
  }

  if (id === CustomIds.LevelingConfigModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LevelingConfigure, ModuleKeys.LEVELING))) return true;
    const xpMin = Number(interaction.fields.getTextInputValue('xp_min') || 15);
    const xpMax = Number(interaction.fields.getTextInputValue('xp_max') || 25);
    const cooldown = Number(interaction.fields.getTextInputValue('cooldown') || 60);
    const minLength = Number(interaction.fields.getTextInputValue('min_length') || 3);
    if (xpMin <= 0 || xpMax < xpMin) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Invalid XP Range', 'Max XP must be greater than or equal to Min XP, and both must be positive numbers.')] });
    }
    await leveling.saveConfig(interaction.guildId, {
      xpMin,
      xpMax,
      cooldownSeconds: cooldown,
      minimumMessageLength: minLength
    });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'level-config', title: 'Leveling Rates Updated', body: `XP Range: ${xpMin}-${xpMax} · Cooldown: ${cooldown}s · Min Length: ${minLength} chars\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Leveling Rates Saved', `XP rate set to **${xpMin}–${xpMax} XP** per message with a **${cooldown}s** cooldown.`)] });
    return true;
  }

  if (id === CustomIds.ServerStatsConfigModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ServerStatsConfigure, ModuleKeys.SERVER_STATS))) return true;
    const memberTemplate = interaction.fields.getTextInputValue('member_template')?.trim() || '👥 Total Members: {count}';
    const humanTemplate = interaction.fields.getTextInputValue('human_template')?.trim() || '👤 Members: {count}';
    const botTemplate = interaction.fields.getTextInputValue('bot_template')?.trim() || '🤖 Bots: {count}';
    const voiceTemplate = interaction.fields.getTextInputValue('voice_template')?.trim() || '🎙️ In Voice: {count}';
    await serverStats.upsertConfig(interaction.guild.id, {
      memberTemplate,
      humanTemplate,
      botTemplate,
      voiceTemplate
    });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Stats Templates Saved', 'Server counter templates have been updated!')] });
    return true;
  }

  if (id === CustomIds.CustomCommandsCreateModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.CustomCommandsConfigure, ModuleKeys.CUSTOM_COMMANDS))) return true;
    const trigger = interaction.fields.getTextInputValue('trigger')?.trim();
    const response = interaction.fields.getTextInputValue('response')?.trim();
    const title = interaction.fields.getTextInputValue('title')?.trim() || null;
    const color = interaction.fields.getTextInputValue('color')?.trim() || null;
    try {
      const created = await customCommands.createCommand(interaction.guildId, {
        name: trigger,
        response,
        embedEnabled: Boolean(title || color),
        embedTitle: title,
        embedColor: color,
        actorUserId: interaction.user.id
      });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Custom Command Created', `Created command \`${created.prefix || '!'}${created.name}\` successfully!`)] });
    } catch (err) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Command Not Created', err.message || 'Could not create command.')] });
    }
    return true;
  }

  if (id === CustomIds.CustomCommandsPrefixModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.CustomCommandsConfigure, ModuleKeys.CUSTOM_COMMANDS))) return true;
    const prefix = interaction.fields.getTextInputValue('prefix')?.trim() || '!';
    await customCommands.setPrefix(interaction.guildId, prefix);
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Prefix Updated', `Custom command trigger prefix is now \`${prefix}\`.`)] });
    return true;
  }

  if (id === CustomIds.ReferralsConfigModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReferralsConfigure, ModuleKeys.REFERRALS))) return true;
    const bonusXp = Number(interaction.fields.getTextInputValue('bonus_xp') || 100);
    if (!Number.isFinite(bonusXp) || bonusXp < 0) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Invalid XP', 'Bonus XP must be a positive number.')] });
    }
    await referrals.setup(interaction.guildId, { referralXp: bonusXp });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'referral-config', title: 'Referral Bonus XP Updated', body: `Bonus XP set to **${bonusXp}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Referral Settings Saved', `Referrers will now receive **${bonusXp.toLocaleString()} XP** per valid referral.`)] });
    return true;
  }

  if (id === CustomIds.ScheduledMessagesCreateModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ScheduledMessagesConfigure, ModuleKeys.SCHEDULED_MESSAGES))) return true;
    const content = interaction.fields.getTextInputValue('content')?.trim();
    const delay = interaction.fields.getTextInputValue('delay')?.trim();
    const repeat = (interaction.fields.getTextInputValue('repeat')?.trim() || 'NONE').toUpperCase();
    const result = await scheduledMessages.createScheduledMessage({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      actorUserId: interaction.user.id,
      content,
      delay,
      repeat
    });
    if (!result.ok) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Schedule Failed', result.reason || 'Could not schedule message.')] });
    }
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Message Scheduled', `Schedule **#${result.schedule.schedule_number}** set for <t:${Math.floor(new Date(result.schedule.send_at).getTime() / 1000)}:f> in <#${interaction.channelId}>.`)] });
    return true;
  }

  if (id === CustomIds.AutoModBlacklistAddModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModBlacklist, ModuleKeys.AUTOMOD))) return true;
    const pattern = interaction.fields.getTextInputValue('pattern');
    const matchType = interaction.fields.getTextInputValue('match_type') || 'WORD';
    const severity = interaction.fields.getTextInputValue('severity') || 'DELETE';

    const result = await autoMod.addBlacklistEntry(
      interaction.guildId,
      pattern,
      matchType,
      severity,
      interaction.user.id
    );

    if (!result.ok) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Add Failed', result.reason || 'Could not add blacklist pattern.')] });
    }

    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'automod-blacklist-add',
      title: 'Blacklist Pattern Added',
      body: `Added \`${pattern}\` [${matchType}] ➔ \`${severity}\` by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id,
      metadata: { pattern, matchType, severity }
    }).catch(() => {});

    await replyPrivate(interaction, {
      embeds: [createSuccessEmbed('Blacklist Entry Added', `Added \`${pattern}\` [${matchType}] to the Auto-Mod blacklist.`)]
    });
    return true;
  }

  if (id.startsWith(CustomIds.AutoModThresholdModalPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModManage, ModuleKeys.AUTOMOD))) return true;
    const ruleKey = id.slice(CustomIds.AutoModThresholdModalPrefix.length);
    const updates = {};

    // 1. Universal timeout duration parsing across all rules
    let durationInput = null;
    try { durationInput = interaction.fields.getTextInputValue('timeout_duration')?.trim(); } catch {}
    if (!durationInput) {
      try { durationInput = interaction.fields.getTextInputValue('timeout_seconds')?.trim(); } catch {}
    }
    if (durationInput) {
      const { parseDurationToMs: parseTimeMs } = require('../utils/time');
      const ms = parseTimeMs(durationInput, { maxDurationMs: 28 * 24 * 60 * 60 * 1000, fallback: 0 });
      const sec = Math.floor(ms / 1000);
      const timeoutField = ruleKey === 'default_blacklist' ? 'word_blacklist_timeout_seconds' : `${ruleKey}_timeout_seconds`;
      if (sec > 0) updates[timeoutField] = sec;
    }

    if (ruleKey === 'anti_spam') {
      const maxMsgs = parseInt(interaction.fields.getTextInputValue('max_messages'), 10);
      const secs = parseInt(interaction.fields.getTextInputValue('seconds'), 10);
      if (!isNaN(maxMsgs) && maxMsgs > 0) updates.anti_spam_max_messages = maxMsgs;
      if (!isNaN(secs) && secs > 0) updates.anti_spam_seconds = secs;
    } else if (ruleKey === 'anti_duplicates') {
      const maxCount = parseInt(interaction.fields.getTextInputValue('max_count'), 10);
      const secs = parseInt(interaction.fields.getTextInputValue('seconds'), 10);
      if (!isNaN(maxCount) && maxCount > 0) updates.anti_duplicates_max_count = maxCount;
      if (!isNaN(secs) && secs > 0) updates.anti_duplicates_seconds = secs;
    } else if (ruleKey === 'anti_mentions') {
      const maxCount = parseInt(interaction.fields.getTextInputValue('max_count'), 10);
      if (!isNaN(maxCount) && maxCount > 0) updates.anti_mentions_max_count = maxCount;
    } else if (ruleKey === 'anti_caps') {
      const minChars = parseInt(interaction.fields.getTextInputValue('min_chars'), 10);
      const percent = parseInt(interaction.fields.getTextInputValue('percent'), 10);
      if (!isNaN(minChars) && minChars > 0) updates.anti_caps_min_chars = minChars;
      if (!isNaN(percent) && percent > 0 && percent <= 100) updates.anti_caps_percent = percent;
    } else if (ruleKey === 'anti_emojis') {
      const maxCount = parseInt(interaction.fields.getTextInputValue('max_count'), 10);
      if (!isNaN(maxCount) && maxCount > 0) updates.anti_emojis_max_count = maxCount;
    }

    await autoMod.upsertConfig(interaction.guildId, updates);
    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'automod-tune',
      title: 'Auto-Mod Limits Updated',
      body: `Thresholds and timeout duration tuned for rule **${ruleKey}** by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id
    }).catch(() => {});

    await replyPrivate(interaction, {
      embeds: [createSuccessEmbed('Limits & Timeout Updated', `Successfully updated configuration limits and timeout duration for **${ruleKey}**.`)]
    });
    return true;
  }

  if (id === CustomIds.AutoModDomainAddModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AutoModWhitelist, ModuleKeys.AUTOMOD))) return true;
    const domain = interaction.fields.getTextInputValue('domain')?.trim().toLowerCase();
    if (!domain) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Invalid Domain', 'Please enter a valid domain name.')] });
    }

    const result = await autoMod.addWhitelistItem(interaction.guildId, 'DOMAIN', domain);
    if (!result.ok) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Add Failed', result.reason || 'Could not add domain.')] });
    }

    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'automod-whitelist-domain',
      title: 'Domain Whitelisted',
      body: `Whitelisted domain \`${domain}\` by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id
    }).catch(() => {});

    await replyPrivate(interaction, {
      embeds: [createSuccessEmbed('Domain Whitelisted', `Approved external domain: \`${domain}\`.`)]
    });
    return true;
  }

  // --- Starboard Modals ---

  if (id === CustomIds.StarboardThresholdModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    const thresholdInput = interaction.fields.getTextInputValue('star_threshold')?.trim();
    const threshold = parseInt(thresholdInput, 10);
    if (isNaN(threshold) || threshold < 1 || threshold > 50) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Invalid Threshold', 'Please enter a number between 1 and 50.')] });
    }
    const updated = await starboard.upsertConfig(interaction.guildId, { star_threshold: threshold });
    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'starboard-threshold-tuned',
      title: 'Starboard Threshold Updated',
      body: `Threshold set to **${threshold}** ${updated.star_emoji} by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id
    }).catch(() => {});
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Threshold Updated', `Star threshold set to **${threshold}** ${updated.star_emoji}.`)] });
    return true;
  }

  if (id === CustomIds.StarboardEmojiModal) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StarboardManage, ModuleKeys.STARBOARD))) return true;
    const emoji = interaction.fields.getTextInputValue('star_emoji')?.trim();
    if (!emoji) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Invalid Emoji', 'Please enter a valid emoji.')] });
    }
    await starboard.upsertConfig(interaction.guildId, { star_emoji: emoji });
    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'starboard-emoji-tuned',
      title: 'Starboard Emoji Updated',
      body: `Reaction emoji set to ${emoji} by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id
    }).catch(() => {});
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Emoji Updated', `Starboard trigger emoji updated to ${emoji}.`)] });
    return true;
  }

  // --- Giveaway Modals ---

  if (id === CustomIds.GiveawaysQuickStartModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysCreate, ModuleKeys.GIVEAWAYS))) return true;
    const prize = interaction.fields.getTextInputValue('prize')?.trim();
    const duration = interaction.fields.getTextInputValue('duration')?.trim();
    const winnersStr = interaction.fields.getTextInputValue('winners')?.trim();
    const minLevelStr = interaction.fields.getTextInputValue('min_level')?.trim();
    const description = interaction.fields.getTextInputValue('description')?.trim() || null;

    const winnerCount = Math.max(1, Math.min(parseInt(winnersStr, 10) || 1, 20));
    const minLevel = minLevelStr ? Math.max(0, parseInt(minLevelStr, 10) || 0) : null;

    const result = await giveaways.startGiveaway({
      interaction,
      client: ctx.client,
      logger: ctx.logger,
      prize,
      duration,
      winnerCount,
      minLevel,
      description
    });

    if (!result.ok) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Not Started', result.reason)] });
    }

    await replyPrivate(interaction, {
      embeds: [createSuccessEmbed('Giveaway Launched! 🎉', `Giveaway #${result.giveaway.giveaway_number} for **${result.giveaway.prize}** was posted in <#${result.channel.id}>.`)]
    });
    return true;
  }

  if (id === CustomIds.GiveawaysConfigModalSubmit) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysConfigure, ModuleKeys.GIVEAWAYS))) return true;
    const panelColor = interaction.fields.getTextInputValue('panel_color')?.trim() || null;
    const defaultMinLevelStr = interaction.fields.getTextInputValue('default_min_level')?.trim();
    const defaultMinAgeStr = interaction.fields.getTextInputValue('default_min_account_age')?.trim();
    const headerImageUrl = interaction.fields.getTextInputValue('header_image_url')?.trim() || null;

    const defaultMinLevel = defaultMinLevelStr ? parseInt(defaultMinLevelStr, 10) || 0 : 0;
    const defaultMinAccountAgeDays = defaultMinAgeStr ? parseInt(defaultMinAgeStr, 10) || 0 : 0;

    await giveaways.updateConfig(interaction.guildId, {
      panelColor,
      defaultMinLevel,
      defaultMinAccountAgeDays,
      panelHeaderImageUrl: headerImageUrl
    });

    await updatePanel(interaction, await giveaways.buildManagerPanel(interaction.guildId));
    return true;
  }

  // --- Join-to-Create Temporary Voice Modals ---

  if (id.startsWith(CustomIds.JoinCreateRenameModalPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const channelId = id.slice(CustomIds.JoinCreateRenameModalPrefix.length);
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    const newName = interaction.fields.getTextInputValue('name')?.trim();
    try {
      const result = await joinCreate.renameTempFromControl(member, channelId, newName);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Renamed', body: `New Name: **${result.temp.name}**\nChannel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, name: result.temp.name } }).catch(() => {});
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Voice Channel Renamed', `✏️ Renamed channel to **${result.temp.name}**.`)], deleteAfterSeconds: 8 });
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Rename Failed', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
    }
    return true;
  }

  if (id.startsWith(CustomIds.JoinCreateLimitModalPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const channelId = id.slice(CustomIds.JoinCreateLimitModalPrefix.length);
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    const limit = Number(interaction.fields.getTextInputValue('limit') || 0);
    try {
      const result = await joinCreate.setLimitFromControl(member, channelId, limit);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Limit Updated', body: `User Limit: **${result.temp.user_limit}**\nChannel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, userLimit: result.temp.user_limit } }).catch(() => {});
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Limit Updated', `👥 Set user limit to **${result.temp.user_limit || 'No Limit'}** for <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Limit Update Failed', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
    }
    return true;
  }

  if (id.startsWith(CustomIds.JoinCreateBitrateModalPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const channelId = id.slice(CustomIds.JoinCreateBitrateModalPrefix.length);
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    const kbps = Number(interaction.fields.getTextInputValue('bitrate') || 64);
    try {
      const result = await joinCreate.setBitrateFromControl(member, channelId, kbps);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Bitrate Updated', body: `Bitrate: **${result.kbps} kbps**\nChannel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, kbps: result.kbps } }).catch(() => {});
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Bitrate Updated', `🎚️ Set voice bitrate to **${result.kbps} kbps** for <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Bitrate Update Failed', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
    }
    return true;
  }

  if (id.startsWith(CustomIds.JoinCreateDeleteConfirmPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const channelId = id.slice(CustomIds.JoinCreateDeleteConfirmPrefix.length);
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    const confirm = interaction.fields.getTextInputValue('confirm')?.trim().toUpperCase();
    if (confirm !== 'DELETE') {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Deletion Cancelled', 'You must type DELETE in all caps to delete your temporary voice channel.')], deleteAfterSeconds: 8 });
      return true;
    }
    try {
      await joinCreate.deleteTempFromControl(member, channelId, ctx.logger);
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Deleted', '🗑️ Your temporary voice channel has been deleted.')], deleteAfterSeconds: 8 });
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Delete Failed', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
    }
    return true;
  }

  if (id.startsWith(CustomIds.JoinCreatePermitModalPrefix) ||
      id.startsWith(CustomIds.JoinCreateKickModalPrefix) ||
      id.startsWith(CustomIds.JoinCreateBanModalPrefix) ||
      id.startsWith(CustomIds.JoinCreateRemoveModalPrefix) ||
      id.startsWith(CustomIds.JoinCreateTransferModalPrefix)) {
    if (!(await requirePublicAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    const userInput = interaction.fields.getTextInputValue('user')?.trim();
    try {
      const targetMember = await resolveGuildMemberFromInput(interaction.guild, userInput);
      if (id.startsWith(CustomIds.JoinCreatePermitModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreatePermitModalPrefix.length);
        const result = await joinCreate.permitUserFromControl(member, channelId, targetMember);
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Permitted', `✅ <@${targetMember.id}> can now join <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateKickModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateKickModalPrefix.length);
        const result = await joinCreate.kickUserFromControl(member, channelId, targetMember);
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Kicked', `🚪 <@${targetMember.id}> was kicked from <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateBanModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateBanModalPrefix.length);
        const result = await joinCreate.banUserFromControl(member, channelId, targetMember);
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Blocked', `⛔ <@${targetMember.id}> was blocked and banned from joining <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateRemoveModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateRemoveModalPrefix.length);
        const result = await joinCreate.removeUserFromControl(member, channelId, targetMember);
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('User Removed', `Removed access for <@${targetMember.id}> in <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateTransferModalPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateTransferModalPrefix.length);
        const result = await joinCreate.transferFromControl(member, channelId, targetMember);
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ownership Transferred', `👑 <@${targetMember.id}> is now the owner of <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
    } catch (error) {
      await replyPrivate(interaction, { embeds: [createWarningEmbed('Action Failed', error instanceof Error ? error.message : String(error))], deleteAfterSeconds: 10 });
      return true;
    }
  }

  return false;
}

async function logCompletedCommunityGame(ctx, interaction, session, draw, xpAwards = []) {
  const label = session.game_key === GAME_KEYS.TIC_TAC_TOE ? 'Tic-Tac-Toe' : 'Connect Four';
  const xpLines = (xpAwards || [])
    .filter((award) => award?.amount > 0)
    .map((award) => `<@${award.userId}>: **${award.amount} XP**${award.awarded ? '' : ' (not awarded)'}`);
  const baseBody = draw
    ? `Players: <@${session.player_one_id}> vs. <@${session.player_two_id}>\nResult: **Draw**`
    : `Players: <@${session.player_one_id}> vs. <@${session.player_two_id}>\nWinner: <@${session.winner_user_id}>`;
  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'community-game-completed',
    title: `${label} Completed`,
    body: xpLines.length ? `${baseBody}\nXP Awards:\n${xpLines.join('\n')}` : baseBody,
    actorUserId: interaction.user.id,
    metadata: { game: session.game_key, sessionId: session.id, draw: Boolean(draw), winnerUserId: session.winner_user_id || null, xpAwards }
  }).catch(() => {});
}

function parseSupportResetId(customId, prefix) {
  const rest = String(customId || '').slice(prefix.length);
  const [moduleKey, requestedByUserId] = rest.split(':');
  if (!moduleKey || !requestedByUserId) return null;
  return { moduleKey, requestedByUserId };
}

function parseQuestions(value) {
  if (!value) return [];
  if (typeof value === 'object') return Array.isArray(value) ? value : [];
  try { return JSON.parse(value); } catch { return []; }
}

function extractUserId(value) {
  const text = String(value || '').trim();
  const mention = text.match(/^<@!?(\d{15,25})>$/);
  if (mention) return mention[1];
  const raw = text.match(/\d{15,25}/);
  return raw ? raw[0] : null;
}

async function resolveGuildMemberFromInput(guild, value) {
  const userId = extractUserId(value);
  if (!userId) throw new Error('Provide a valid user mention or Discord user ID.');
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) throw new Error('That user could not be found in this server.');
  return member;
}

function buildTicketCloseReasonModal() {
  const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  return new ModalBuilder()
    .setCustomId(CustomIds.TicketCloseReasonModal)
    .setTitle('Close Ticket With Reason')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Close reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
}

async function requireAnySupportAction(interaction, ctx) {
  const checks = [[ActionKeys.TicketsManager, ModuleKeys.TICKETS], [ActionKeys.ReportsManager, ModuleKeys.REPORTS], [ActionKeys.ApplicationsManager, ModuleKeys.APPLICATIONS], [ActionKeys.AppealsManager, ModuleKeys.APPEALS]];
  for (const [action, moduleKey] of checks) {
    const result = await ctx.permissions.checkInteraction(interaction, action, moduleKey);
    if (result.allowed) return true;
  }
  await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Permission Required', description: 'You need access to at least one support workflow module.', color: SlickBotColors.ERROR })] });
  return false;
}


async function requireAnyCommunityAction(interaction, ctx) {
  const checks = [[ActionKeys.WelcomeView, ModuleKeys.WELCOME], [ActionKeys.RolePanelsView, ModuleKeys.REACTION_ROLES], [ActionKeys.GiveawaysView, ModuleKeys.GIVEAWAYS], [ActionKeys.BirthdaysView, ModuleKeys.BIRTHDAYS], [ActionKeys.LevelingView, ModuleKeys.LEVELING], [ActionKeys.GamesView, ModuleKeys.COMMUNITY_GAMES], [ActionKeys.FaqView, ModuleKeys.FAQ], [ActionKeys.SuggestionsView, ModuleKeys.SUGGESTIONS], [ActionKeys.ReferralsView, ModuleKeys.REFERRALS], [ActionKeys.AchievementsView, ModuleKeys.ACHIEVEMENTS], [ActionKeys.ScheduledMessagesView, ModuleKeys.SCHEDULED_MESSAGES], [ActionKeys.ServerStatsView, ModuleKeys.SERVER_STATS], [ActionKeys.CustomCommandsView, ModuleKeys.CUSTOM_COMMANDS], [ActionKeys.JoinCreateView, ModuleKeys.JOIN_TO_CREATE]];
  for (const [action, moduleKey] of checks) {
    const result = await ctx.permissions.checkInteraction(interaction, action, moduleKey);
    if (result.allowed) return true;
  }
  await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Permission Required', description: 'You need access to at least one community module.', color: SlickBotColors.ERROR })] });
  return false;
}

async function requireModuleOnly(interaction, ctx, moduleKey) {
  await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
  if (await ctx.permissions.isIgnored(interaction.guildId, interaction.user.id)) {
    await sendAccessDenied(interaction, 'You are currently blocked from interacting with SlickBot.');
    return false;
  }
  const enabled = await ctx.permissions.isModuleEnabled(interaction.guildId, moduleKey);
  if (enabled) return true;
  await sendAccessDenied(interaction, `The ${moduleKey} module is disabled.`, 'Module Disabled');
  return false;
}

async function requirePublicAction(interaction, ctx, actionKey, moduleKey) {
  const result = await ctx.permissions.checkPublicInteraction(interaction, actionKey, moduleKey);
  if (result.allowed) return true;
  await sendAccessDenied(interaction, result.reason || 'This public action is not currently available to you.');
  return false;
}

async function requireAction(interaction, ctx, actionKey, moduleKey) {
  const result = await ctx.permissions.checkInteraction(interaction, actionKey, moduleKey);
  if (result.allowed) return true;
  await sendAccessDenied(interaction, result.reason || 'You do not have permission to use this control.');
  return false;
}

async function sendAccessDenied(interaction, description, title = 'Access Restricted') {
  await replyPrivate(interaction, {
    embeds: [createBaseEmbed({
      title: `⛔ ${title}`,
      description,
      color: SlickBotColors.ERROR
    })],
    deleteAfterSeconds: 12
  });
}

function withSetupSubheader(payload, masterTitle, subcategory) {
  const embed = payload?.embeds?.[0];
  if (!embed || typeof embed.setTitle !== 'function' || typeof embed.setDescription !== 'function') return payload;

  const originalTitle = embed.data?.title || subcategory;
  const originalDescription = embed.data?.description || '';
  const alreadyViewing = String(originalDescription).startsWith('**Viewing:**');
  const description = alreadyViewing
    ? originalDescription
    : [`**Viewing:** ${subcategory || originalTitle}`, '', originalDescription].filter(Boolean).join('\n');

  embed.setTitle(masterTitle);
  embed.setDescription(description.length > 4000 ? `${description.slice(0, 3997)}...` : description);
  return payload;
}

async function updatePanel(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  if (typeof interaction.update === 'function') {
    await interaction.update(payload);
    return;
  }
  await replyPrivate(interaction, payload);
}


async function scheduleTicketDeletion(channel, seconds = 10) {
  if (!channel || typeof channel.send !== 'function') return;
  const total = Math.max(3, Math.min(Number(seconds) || 10, 60));
  const message = await channel.send({ embeds: [createWarningEmbed('Ticket Closing', `Ticket will close in **${total}** second(s).`)] }).catch(() => null);
  if (!message) return;
  for (let remaining = total - 1; remaining >= 1; remaining -= 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await message.edit({ embeds: [createWarningEmbed('Ticket Closing', `Ticket will close in **${remaining}** second(s).`)] }).catch(() => {});
  }
  await channel.delete('SlickBot ticket closed and transcript completed.').catch(() => {});
}

function isImplementedModuleSafe(moduleKey) {
  return require('../modules/moduleRegistry').isImplementedModule(moduleKey);
}

module.exports = { handleComponentInteraction };
