const { CustomIds } = require('../modules/ui/customIds');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { ModuleKeys, isCoreModule } = require('../modules/moduleRegistry');
const { query } = require('./db');
const { replyPrivate, acknowledgeQuietly } = require('../utils/reply');
const { buildSetupPanel, buildModulesPanel, buildLoggingPanel, buildTeamsPanel, buildPermissionsPanel, buildCommunityPanel } = require('../modules/ui/panels');
const { buildModerationPanel, buildRecentCasesPanel } = require('../modules/moderation/moderationUi');
const { buildStatusPanel } = require('../commands/status');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { updatePanelDesign } = require('../modules/panels/panelDesignService');
const { refreshPublishedPanel, refreshPublishedPanelFromResult, formatRefreshSummary } = require('../modules/panels/panelUpdateService');
const { parsePanelDesignModalId } = require('../modules/panels/panelModals');
const { ActivityTypeNames, PresenceStatus } = require('../modules/status/statusService');
const { buildSupportPanel, buildTicketsPanel, buildReportsPanel, buildApplicationsPanel, buildAppealsPanel } = require('../modules/support/supportUi');
const { buildWelcomePanel } = require('../modules/community/welcomeService');
const { GiveawayService } = require('../modules/community/giveawayService');
const { BirthdayService, buildBirthdayDayModal, buildBirthdayTimezoneModal, isValidDate } = require('../modules/community/birthdayService');
const { ScheduledMessageService } = require('../modules/automation/scheduledMessageService');
const { ServerStatsService } = require('../modules/community/serverStatsService');
const { LevelingService } = require('../modules/community/levelingService');
const { buildRoleManagerPanel, toggleRole } = require('../modules/community/rolePanelService');
const { JoinCreateService } = require('../modules/voice/joinCreateService');
const {
  TicketService,
  ReportService,
  ApplicationService,
  AppealService,
  buildTicketModal,
  buildReportModal,
  buildReportDetailsModal,
  buildAppealModal,
  buildAppealReasonModal,
  buildApplicationReviewReasonModal,
  buildReportReviewPayload
} = require('../modules/support/supportService');

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
  if (interaction.isStringSelectMenu()) return handleSelect(interaction, ctx);
  if (interaction.isModalSubmit()) return handleModal(interaction, ctx);
  return false;
}

async function handleButton(interaction, ctx) {
  const id = interaction.customId;



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
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildModulesPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupLogging || id === CustomIds.LoggingRefresh) {
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

  if (id === CustomIds.WelcomeRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.WelcomeView, ModuleKeys.WELCOME))) return true;
    await updatePanel(interaction, await buildWelcomePanel(interaction.guildId));
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

  if (id === CustomIds.BirthdaysRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.BirthdaysView, ModuleKeys.BIRTHDAYS))) return true;
    await updatePanel(interaction, await birthdays.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ScheduledMessagesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ScheduledMessagesView, ModuleKeys.SCHEDULED_MESSAGES))) return true;
    await updatePanel(interaction, await scheduledMessages.buildManagerPanel(interaction.guildId));
    return true;
  }


  if (id === CustomIds.LevelingRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LevelingView, ModuleKeys.LEVELING))) return true;
    await updatePanel(interaction, await leveling.buildManagerPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ServerStatsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ServerStatsView, ModuleKeys.SERVER_STATS))) return true;
    await updatePanel(interaction, await serverStats.buildManagerPanel(interaction.guild));
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
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.BIRTHDAYS))) return true;
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
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Birthday Saved', `Your birthday was saved for **${require('../modules/community/birthdayService').formatBirthday(result.profile.birth_month, result.profile.birth_day)}** with timezone **${result.profile.timezone || 'server default'}**.`)], components: [] });
    return true;
  }

  if (id.startsWith('slickbot:rolepanel:')) {
    if (!(await requireAction(interaction, ctx, ActionKeys.RolePanelsUse, ModuleKeys.REACTION_ROLES))) return true;
    const [, , panelId, optionId] = id.split(':');
    const result = await toggleRole({ interaction, panelId, optionId, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Role Not Updated', result.reason)], deleteAfterSeconds: 10 });
    await acknowledgeQuietly(interaction);
    return true;
  }


  if (id.startsWith('slickbot:giveaway:enter:')) {
    if (!(await requireAction(interaction, ctx, ActionKeys.GiveawaysEnter, ModuleKeys.GIVEAWAYS))) return true;
    const giveawayId = id.slice('slickbot:giveaway:enter:'.length);
    const result = await giveaways.enterGiveaway({ interaction, giveawayId, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Entry Failed', result.reason)], deleteAfterSeconds: 10 });
    if (!result.alreadyEntered) await giveaways.refreshGiveawayMessage(ctx.client, interaction.guildId, giveawayId).catch(() => {});
    return replyPrivate(interaction, { embeds: [createSuccessEmbed(result.alreadyEntered ? 'Already Entered' : 'Giveaway Entered', result.alreadyEntered ? 'You are already entered in this giveaway.' : 'You have been entered in the giveaway.')], deleteAfterSeconds: 10 });
  }

  if (id === CustomIds.TicketOpen || id.startsWith(CustomIds.TicketOpenTypePrefix)) {
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.TICKETS))) return true;
    const typeId = id.startsWith(CustomIds.TicketOpenTypePrefix) ? id.slice(CustomIds.TicketOpenTypePrefix.length) : null;
    const type = typeId ? await tickets.getTypeById(interaction.guildId, typeId) : await tickets.ensureDefaultType(interaction.guildId);
    await interaction.showModal(buildTicketModal(type));
    return true;
  }

  if (id === CustomIds.TicketClaim) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsClaim, ModuleKeys.TICKETS))) return true;
    const access = await tickets.canManageTicket({ interaction });
    if (!access.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Control Restricted', access.reason)] });
    const result = await tickets.claimTicket({ interaction, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
    await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Claimed', `Ticket #${result.ticket.ticket_number} is now assigned to <@${interaction.user.id}>.`)], deleteAfterSeconds: 10 });
    return true;
  }

  if (id === CustomIds.TicketEscalate) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsManage, ModuleKeys.TICKETS))) return true;
    const access = await tickets.canManageTicket({ interaction });
    if (!access.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Control Restricted', access.reason)] });
    const result = await tickets.escalateTicket({ interaction, logger: ctx.logger, reason: 'Escalated from ticket control button.' });
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
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.REPORTS))) return true;
    await interaction.showModal(buildReportModal());
    return true;
  }

  if (id.startsWith(CustomIds.ReportClaimPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsClaim, ModuleKeys.REPORTS))) return true;
    const reportId = id.slice(CustomIds.ReportClaimPrefix.length);
    const report = await reports.claimReport({ guildId: interaction.guildId, reportId, reviewer: interaction.user, logger: ctx.logger });
    if (!report) return replyPrivate(interaction, { embeds: [createWarningEmbed('Report Not Found', 'The report could not be found or is already closed.')] });
    await updatePanel(interaction, buildReportReviewPayload(report));
    return true;
  }

  if (id.startsWith(CustomIds.ReportResolvePrefix) || id.startsWith(CustomIds.ReportDismissPrefix)) {
    const status = id.startsWith(CustomIds.ReportResolvePrefix) ? 'RESOLVED' : 'DISMISSED';
    const action = status === 'RESOLVED' ? ActionKeys.ReportsResolve : ActionKeys.ReportsDismiss;
    if (!(await requireAction(interaction, ctx, action, ModuleKeys.REPORTS))) return true;
    const reportId = id.replace(CustomIds.ReportResolvePrefix, '').replace(CustomIds.ReportDismissPrefix, '');
    const report = await reports.reviewReport({ guildId: interaction.guildId, reportId, reviewer: interaction.user, status, logger: ctx.logger });
    if (!report) return replyPrivate(interaction, { embeds: [createWarningEmbed('Report Not Found', 'The report could not be found.')] });
    await updatePanel(interaction, buildReportReviewPayload(report));
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
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.APPLICATIONS))) return true;
    const typeId = id.slice(CustomIds.ApplicationApplyPrefix.length);
    const type = await applications.getTypeById(interaction.guildId, typeId);
    if (!type || !type.enabled) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Unavailable', 'This application type is not currently available.')] });
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

  if (id === CustomIds.AppealOpen) {
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.APPEALS))) return true;
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

  if (id === CustomIds.LoggingFlush) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingConfigure, ModuleKeys.LOGGING))) return true;
    await ctx.logger.flushGuildBatches(interaction.guildId);
    await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.LoggingTest) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingConfigure, ModuleKeys.LOGGING))) return true;
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'system', title: 'SlickBot Test Log', body: `Test log created by ${interaction.user.tag}.`, actorUserId: interaction.user.id });
    await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
    return true;
  }

  if ([CustomIds.StatusQuickOnline, CustomIds.StatusQuickIdle, CustomIds.StatusQuickDnd, CustomIds.StatusClear].includes(id)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StatusManage, ModuleKeys.STATUS))) return true;
    if (id === CustomIds.StatusClear) {
      await ctx.status.clearPresence(interaction.guildId, true);
      await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx, 'Status cleared.'));
      return true;
    }
    const status = id === CustomIds.StatusQuickOnline ? PresenceStatus.ONLINE : id === CustomIds.StatusQuickIdle ? PresenceStatus.IDLE : PresenceStatus.DND;
    const saved = await ctx.status.getSavedPresence(interaction.guildId);
    const next = saved || { activityType: ActivityTypeNames.WATCHING, activityText: 'the server', activityUrl: null };
    await ctx.status.applyPresence({ ...next, status });
    await ctx.status.savePresence(interaction.guildId, { ...next, status });
    await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx, `Status set to ${status}.`));
    return true;
  }


  if (id.startsWith(CustomIds.JoinCreateLockPrefix) || id.startsWith(CustomIds.JoinCreateUnlockPrefix) || id.startsWith(CustomIds.JoinCreateClaimPrefix) || id.startsWith(CustomIds.JoinCreateDeletePrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TempVoiceManage, ModuleKeys.JOIN_TO_CREATE))) return true;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    try {
      if (id.startsWith(CustomIds.JoinCreateLockPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateLockPrefix.length);
        const result = await joinCreate.setLockedFromControl(member, channelId, true);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Locked', body: `Channel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, locked: true } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Locked', `<#${result.channel.id}> is now locked.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateUnlockPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateUnlockPrefix.length);
        const result = await joinCreate.setLockedFromControl(member, channelId, false);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Unlocked', body: `Channel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id, locked: false } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Unlocked', `<#${result.channel.id}> is now unlocked.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateClaimPrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateClaimPrefix.length);
        const result = await joinCreate.claimFromControl(member, channelId);
        await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'join-create-control', title: 'Temporary Voice Claimed', body: `Channel: <#${result.channel.id}>`, actorUserId: interaction.user.id, metadata: { channelId: result.channel.id } }).catch(() => {});
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Channel Claimed', `You now own <#${result.channel.id}>.`)], deleteAfterSeconds: 8 });
        return true;
      }
      if (id.startsWith(CustomIds.JoinCreateDeletePrefix)) {
        const channelId = id.slice(CustomIds.JoinCreateDeletePrefix.length);
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

  return false;
}

async function handleSelect(interaction, ctx) {
  const id = interaction.customId;
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
    await query(`INSERT INTO module_configs (guild_id, module_key, enabled) VALUES ($1, $2, $3) ON CONFLICT (guild_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`, [interaction.guildId, moduleKey, nextEnabled]);
    await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.ModulesManage, targetType: 'ModuleConfig', targetId: moduleKey, summary: `${moduleKey} module ${nextEnabled ? 'enabled' : 'disabled'} from interactive panel.` });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'module-config', title: `Module ${nextEnabled ? 'Enabled' : 'Disabled'}`, body: [`Module: **${moduleKey}**`, `Updated By: <@${interaction.user.id}>`, 'Source: Interactive panel'].join('\n'), metadata: { moduleKey, enabled: nextEnabled, actorUserId: interaction.user.id } });
    await updatePanel(interaction, await buildModulesPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.TicketTypeSelect) {
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.TICKETS))) return true;
    const typeId = interaction.values[0];
    const type = await tickets.getTypeById(interaction.guildId, typeId);
    if (!type || type.enabled === false) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Type Unavailable', 'This ticket type is not currently available.')] });
    await interaction.showModal(buildTicketModal(type));
    return true;
  }

  if (id === CustomIds.ReportSelect) {
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.REPORTS))) return true;
    await interaction.showModal(buildReportModal());
    return true;
  }

  if (id === CustomIds.AppealSelect) {
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.APPEALS))) return true;
    await interaction.showModal(buildAppealModal());
    return true;
  }

  if (id.startsWith(CustomIds.ApplicationSelectPrefix)) {
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.APPLICATIONS))) return true;
    const typeId = interaction.values[0] || id.slice(CustomIds.ApplicationSelectPrefix.length);
    const type = await applications.getTypeById(interaction.guildId, typeId);
    if (!type || !type.enabled) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Unavailable', 'This application type is not currently available.')] });
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

  if (id.startsWith(CustomIds.RolePanelSelectPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.RolePanelsUse, ModuleKeys.REACTION_ROLES))) return true;
    const panelId = id.slice(CustomIds.RolePanelSelectPrefix.length);
    const optionId = interaction.values[0];
    const result = await toggleRole({ interaction, panelId, optionId, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Role Not Updated', result.reason)], deleteAfterSeconds: 10 });
    await acknowledgeQuietly(interaction);
    return true;
  }

  return false;
}

async function handleModal(interaction, ctx) {
  const id = interaction.customId;

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
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.TICKETS))) return true;
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

  if (id === CustomIds.ReportModal) {
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.REPORTS))) return true;
    const target = interaction.fields.getTextInputValue('target') || '';
    const details = interaction.fields.getTextInputValue('details');
    const report = await reports.createReport({ interaction, client: ctx.client, logger: ctx.logger, type: 'Panel Report', details: target ? `Target/Context: ${target}\n\n${details}` : details });
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

  if (id === CustomIds.AppealModal) {
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.APPEALS))) return true;
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

  return false;
}

function parseQuestions(value) {
  if (!value) return [];
  if (typeof value === 'object') return Array.isArray(value) ? value : [];
  try { return JSON.parse(value); } catch { return []; }
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
  const checks = [[ActionKeys.WelcomeView, ModuleKeys.WELCOME], [ActionKeys.RolePanelsView, ModuleKeys.REACTION_ROLES], [ActionKeys.GiveawaysView, ModuleKeys.GIVEAWAYS], [ActionKeys.BirthdaysView, ModuleKeys.BIRTHDAYS], [ActionKeys.LevelingView, ModuleKeys.LEVELING], [ActionKeys.ScheduledMessagesView, ModuleKeys.SCHEDULED_MESSAGES], [ActionKeys.ServerStatsView, ModuleKeys.SERVER_STATS]];
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
    await replyPrivate(interaction, { embeds: [createWarningEmbed('Access Blocked', 'You are currently blocked from interacting with SlickBot.')] });
    return false;
  }
  const enabled = await ctx.permissions.isModuleEnabled(interaction.guildId, moduleKey);
  if (enabled) return true;
  await replyPrivate(interaction, { embeds: [createWarningEmbed('Module Disabled', `The ${moduleKey} module is disabled.`)] });
  return false;
}

async function requireAction(interaction, ctx, actionKey, moduleKey) {
  const result = await ctx.permissions.checkInteraction(interaction, actionKey, moduleKey);
  if (result.allowed) return true;
  await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Permission Required', description: result.reason || 'You do not have permission to use this control.', color: SlickBotColors.ERROR })] });
  return false;
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
