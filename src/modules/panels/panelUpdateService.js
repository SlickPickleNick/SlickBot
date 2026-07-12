const { updatePublishedPanelsForRefs } = require('./publishedPanelService');
const { buildPublicTicketPanel, buildPublicReportPanel, buildPublicApplicationPanel, buildPublicAppealPanel } = require('../support/supportUi');
const { TicketService, ReportService, ApplicationService, AppealService } = require('../support/supportService');
const rolePanels = require('../community/rolePanelService');
const { BirthdayService } = require('../community/birthdayService');

const tickets = new TicketService();
const reports = new ReportService();
const applications = new ApplicationService();
const appeals = new AppealService();
const birthdays = new BirthdayService();

async function buildPayload(guildId, panelType, panelRef = '*') {
  if (panelType === 'ticket') return buildPublicTicketPanel(await tickets.listTypes(guildId), await tickets.getConfig(guildId));
  if (panelType === 'report') return buildPublicReportPanel(await reports.getConfig(guildId));
  if (panelType === 'appeal') return buildPublicAppealPanel(await appeals.getConfig(guildId));
  if (panelType === 'application') {
    if (String(panelRef || '*') === '*') {
      const types = await applications.listTypes(guildId);
      return buildPublicApplicationPanel(types);
    }
    const type = await applications.getTypeById(guildId, panelRef) || await applications.getTypeByName?.(guildId, panelRef);
    if (!type) return null;
    return buildPublicApplicationPanel(type);
  }
  if (panelType === 'birthday') return birthdays.buildPublicPanel(guildId);
  if (panelType === 'role') {
    const panel = await rolePanels.getPanelById(guildId, panelRef) || await rolePanels.getPanelByName(guildId, panelRef);
    if (!panel) return null;
    return rolePanels.buildRolePanelMessage(panel);
  }
  return null;
}

function refsForPanel(panelRef = '*', extraRefs = []) {
  return [...new Set([panelRef, ...extraRefs].filter((item) => item != null && String(item).trim() !== '').map(String))];
}

async function refreshPublishedPanel(client, guildId, panelType, panelRef = '*', extraRefs = []) {
  if (panelType === 'role') {
    const panel = await rolePanels.getPanelById(guildId, panelRef) || await rolePanels.getPanelByName(guildId, panelRef);
    if (!panel) return { updated: 0, removed: 0, total: 0 };
    return rolePanels.updatePublishedRolePanelMessages(client, guildId, panel);
  }
  const payload = await buildPayload(guildId, panelType, panelRef);
  if (!payload) return { updated: 0, removed: 0, total: 0 };
  return updatePublishedPanelsForRefs(client, { guildId, panelType, panelRefs: refsForPanel(panelRef, extraRefs), payload });
}

async function refreshPublishedPanelFromResult(client, guildId, result) {
  if (!result?.panelType) return { updated: 0, removed: 0, total: 0 };
  return refreshPublishedPanel(client, guildId, result.panelType, result.panelRef || '*', result.altPanelRefs || []);
}

function formatRefreshSummary(result) {
  if (!result || !result.total) return '';
  return `\nLive panels updated: **${result.updated}/${result.total}**.`;
}

module.exports = {
  buildPayload,
  refreshPublishedPanel,
  refreshPublishedPanelFromResult,
  formatRefreshSummary
};
