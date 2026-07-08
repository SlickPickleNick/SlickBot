const { CustomIds } = require('../modules/ui/customIds');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { ModuleKeys, isCoreModule } = require('../modules/moduleRegistry');
const { query } = require('./db');
const { replyPrivate } = require('../utils/reply');
const { buildSetupPanel, buildModulesPanel, buildLoggingPanel, buildTeamsPanel } = require('../modules/ui/panels');
const { buildModerationPanel, buildRecentCasesPanel } = require('../modules/moderation/moderationUi');
const { buildStatusPanel } = require('../commands/status');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { ActivityTypeNames, PresenceStatus } = require('../modules/status/statusService');
const { buildSupportPanel, buildTicketsPanel, buildReportsPanel, buildApplicationsPanel, buildAppealsPanel } = require('../modules/support/supportUi');
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
  buildReportReviewPayload
} = require('../modules/support/supportService');

const tickets = new TicketService();
const reports = new ReportService();
const applications = new ApplicationService();
const appeals = new AppealService();

async function handleComponentInteraction(interaction, ctx) {
  if (!interaction.guildId) {
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

  if (id === CustomIds.TicketsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsPanel, ModuleKeys.TICKETS))) return true;
    await updatePanel(interaction, await buildTicketsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ReportsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsPanel, ModuleKeys.REPORTS))) return true;
    await updatePanel(interaction, await buildReportsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.ApplicationsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ApplicationsPanel, ModuleKeys.APPLICATIONS))) return true;
    await applications.ensureDefaultType(interaction.guildId);
    await updatePanel(interaction, await buildApplicationsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.AppealsRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.AppealsPanel, ModuleKeys.APPEALS))) return true;
    await updatePanel(interaction, await buildAppealsPanel(interaction.guildId));
    return true;
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
    const result = await tickets.claimTicket({ interaction, logger: ctx.logger });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
    await interaction.reply({ embeds: [createSuccessEmbed('Ticket Claimed', `Ticket #${result.ticket.ticket_number} is now assigned to <@${interaction.user.id}>.`)] });
    return true;
  }

  if (id === CustomIds.TicketEscalate) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsManage, ModuleKeys.TICKETS))) return true;
    const result = await tickets.escalateTicket({ interaction, logger: ctx.logger, reason: 'Escalated from ticket control button.' });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Escalated', result.reason)] });
    await interaction.reply({ content: result.roleIds.map((roleId) => `<@&${roleId}>`).join(' '), embeds: [createSuccessEmbed('Ticket Escalated', `Ticket #${result.ticket.ticket_number} has been escalated.`)] });
    return true;
  }

  if (id === CustomIds.TicketCloseReason || id === CustomIds.TicketClose) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TicketsClose, ModuleKeys.TICKETS))) return true;
    await interaction.showModal(buildTicketCloseReasonModal());
    return true;
  }

  if (id === CustomIds.ReportOpen) {
    if (!(await requireModuleOnly(interaction, ctx, ModuleKeys.REPORTS))) return true;
    await interaction.showModal(buildReportModal());
    return true;
  }

  if (id.startsWith(CustomIds.ReportClaimPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsReview, ModuleKeys.REPORTS))) return true;
    const reportId = id.slice(CustomIds.ReportClaimPrefix.length);
    const report = await reports.claimReport({ guildId: interaction.guildId, reportId, reviewer: interaction.user, logger: ctx.logger });
    if (!report) return replyPrivate(interaction, { embeds: [createWarningEmbed('Report Not Found', 'The report could not be found or is already closed.')] });
    await updatePanel(interaction, buildReportReviewPayload(report));
    return true;
  }

  if (id.startsWith(CustomIds.ReportResolvePrefix) || id.startsWith(CustomIds.ReportDismissPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsReview, ModuleKeys.REPORTS))) return true;
    const reportId = id.replace(CustomIds.ReportResolvePrefix, '').replace(CustomIds.ReportDismissPrefix, '');
    const status = id.startsWith(CustomIds.ReportResolvePrefix) ? 'RESOLVED' : 'DISMISSED';
    const report = await reports.reviewReport({ guildId: interaction.guildId, reportId, reviewer: interaction.user, status, logger: ctx.logger });
    if (!report) return replyPrivate(interaction, { embeds: [createWarningEmbed('Report Not Found', 'The report could not be found.')] });
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Report Updated', `Report #${report.report_number} marked **${report.status}**.`)], components: [] });
    return true;
  }

  if (id.startsWith(CustomIds.ReportDetailsPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsReview, ModuleKeys.REPORTS))) return true;
    await interaction.showModal(buildReportDetailsModal(id.slice(CustomIds.ReportDetailsPrefix.length)));
    return true;
  }

  if (id.startsWith(CustomIds.ReportOpenTicketPrefix)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ReportsReview, ModuleKeys.REPORTS))) return true;
    const reportId = id.slice(CustomIds.ReportOpenTicketPrefix.length);
    const report = await reports.getReport(interaction.guildId, reportId);
    if (!report) return replyPrivate(interaction, { embeds: [createWarningEmbed('Report Not Found', 'The report could not be found.')] });
    const openerUser = await ctx.client.users.fetch(report.reporter_user_id).catch(() => null);
    if (!openerUser) return replyPrivate(interaction, { embeds: [createWarningEmbed('User Not Found', 'Could not fetch the report submitter.')] });
    const result = await tickets.createTicket({ interaction, client: ctx.client, logger: ctx.logger, openerUser, actorUser: interaction.user, type: 'Report Follow-Up', subject: `Report #${report.report_number} Follow-Up`, details: report.details });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Created', result.reason)] });
    await reports.linkTicket({ guildId: interaction.guildId, reportId, ticketId: result.ticket.id });
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
    const submission = await applications.reviewApplication({ interaction, client: ctx.client, logger: ctx.logger, submissionId, status: isApprove ? 'APPROVED' : 'DENIED' });
    if (!submission) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Found', 'The application could not be found.')] });
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Application Reviewed', `Application #${submission.submission_number} marked **${submission.status}**.`)], components: [] });
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
    await interaction.showModal(buildAppealReasonModal(appealId, isApprove ? 'APPROVED' : 'DENIED'));
    return true;
  }

  if (id.startsWith(CustomIds.AppealApprovePrefix) || id.startsWith(CustomIds.AppealDenyPrefix)) {
    const isApprove = id.startsWith(CustomIds.AppealApprovePrefix);
    const action = isApprove ? ActionKeys.AppealsApprove : ActionKeys.AppealsDeny;
    if (!(await requireAction(interaction, ctx, action, ModuleKeys.APPEALS))) return true;
    const appealId = id.slice(isApprove ? CustomIds.AppealApprovePrefix.length : CustomIds.AppealDenyPrefix.length);
    const appeal = await appeals.reviewAppeal({ interaction, client: ctx.client, logger: ctx.logger, appealId, status: isApprove ? 'APPROVED' : 'DENIED' });
    if (!appeal) return replyPrivate(interaction, { embeds: [createWarningEmbed('Appeal Not Found', 'The appeal could not be found.')] });
    await updatePanel(interaction, { embeds: [createSuccessEmbed('Appeal Reviewed', `Appeal #${appeal.appeal_number} marked **${appeal.status}**.`)], components: [] });
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

  return false;
}

async function handleSelect(interaction, ctx) {
  const id = interaction.customId;
  if (id === CustomIds.ModulesSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    const moduleKey = interaction.values[0];
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
  return false;
}

async function handleModal(interaction, ctx) {
  const id = interaction.customId;

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
    const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided.';
    const result = await tickets.closeTicket({ interaction, client: ctx.client, logger: ctx.logger, reason });
    if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
    await interaction.reply({ embeds: [createSuccessEmbed('Ticket Closed', `Ticket #${result.ticket.ticket_number} closed. Transcript sent: **${result.transcriptSent ? 'Yes' : 'No'}**.`)] });
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
  const checks = [[ActionKeys.TicketsPanel, ModuleKeys.TICKETS], [ActionKeys.ReportsPanel, ModuleKeys.REPORTS], [ActionKeys.ApplicationsPanel, ModuleKeys.APPLICATIONS], [ActionKeys.AppealsPanel, ModuleKeys.APPEALS]];
  for (const [action, moduleKey] of checks) {
    const result = await ctx.permissions.checkInteraction(interaction, action, moduleKey);
    if (result.allowed) return true;
  }
  await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Permission Required', description: 'You need access to at least one support workflow module.', color: SlickBotColors.ERROR })] });
  return false;
}

async function requireModuleOnly(interaction, ctx, moduleKey) {
  await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
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

module.exports = { handleComponentInteraction };
