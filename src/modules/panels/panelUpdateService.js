const { updatePublishedPanels } = require('./publishedPanelService');
const { buildPublicTicketPanel, buildPublicReportPanel, buildPublicApplicationPanel, buildPublicAppealPanel } = require('../support/supportUi');
const { TicketService, ReportService, ApplicationService, AppealService } = require('../support/supportService');
const rolePanels = require('../community/rolePanelService');

const tickets = new TicketService();
const reports = new ReportService();
const applications = new ApplicationService();
const appeals = new AppealService();

async function buildPayload(guildId, panelType, panelRef = '*') {
  if (panelType === 'ticket') return buildPublicTicketPanel(await tickets.listTypes(guildId), await tickets.getConfig(guildId));
  if (panelType === 'report') return buildPublicReportPanel(await reports.getConfig(guildId));
  if (panelType === 'appeal') return buildPublicAppealPanel(await appeals.getConfig(guildId));
  if (panelType === 'application') {
    const type = await applications.getTypeById(guildId, panelRef);
    if (!type) return null;
    return buildPublicApplicationPanel(type);
  }
  if (panelType === 'role') {
    const panel = await rolePanels.getPanelById(guildId, panelRef);
    if (!panel) return null;
    return rolePanels.buildRolePanelMessage(panel);
  }
  return null;
}

async function refreshPublishedPanel(client, guildId, panelType, panelRef = '*') {
  const payload = await buildPayload(guildId, panelType, panelRef);
  if (!payload) return { updated: 0, removed: 0, total: 0 };
  return updatePublishedPanels(client, { guildId, panelType, panelRef, payload });
}

function formatRefreshSummary(result) {
  if (!result || !result.total) return '';
  return `\nLive panels updated: **${result.updated}/${result.total}**.`;
}

module.exports = {
  buildPayload,
  refreshPublishedPanel,
  formatRefreshSummary
};
