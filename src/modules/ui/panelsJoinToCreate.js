const panelsPath = require.resolve('./panels');
const original = require('./panels');
const { query } = require('../../services/db');
const {
  createButtonRow,
  createPanelButton,
  ButtonStyle
} = require('./uiService');
const { CustomIds } = require('./customIds');
const { JoinToCreateService, JoinToCreateIds } = require('../community/joinToCreateService');

const voiceRooms = new JoinToCreateService();
const originalBuildModulesPanel = original.buildModulesPanel;
const originalBuildCommunityPanel = original.buildCommunityPanel;

const stateForEmoji = Object.freeze({
  '🟢': 'READY',
  '🟠': 'PARTIAL',
  '🟣': 'NEEDS_CONFIG',
  '🔴': 'DISABLED',
  '🕒': 'COMING_SOON'
});

const emojiForState = Object.freeze(Object.fromEntries(Object.entries(stateForEmoji).map(([emoji, state]) => [state, emoji])));

function adjustModuleSummary(description, oldEmoji, newEmoji) {
  if (!oldEmoji || !newEmoji || oldEmoji === newEmoji) return description;
  const summaryPattern = /🟢 (\d+) · 🟠 (\d+) · 🟣 (\d+) · 🔴 (\d+) · 🕒 (\d+)/;
  const match = description.match(summaryPattern);
  if (!match) return description;

  const order = ['READY', 'PARTIAL', 'NEEDS_CONFIG', 'DISABLED', 'COMING_SOON'];
  const counts = Object.fromEntries(order.map((state, index) => [state, Number(match[index + 1])]));
  const oldState = stateForEmoji[oldEmoji];
  const newState = stateForEmoji[newEmoji];
  if (oldState) counts[oldState] = Math.max(0, counts[oldState] - 1);
  if (newState) counts[newState] += 1;

  return description.replace(
    summaryPattern,
    `🟢 ${counts.READY} · 🟠 ${counts.PARTIAL} · 🟣 ${counts.NEEDS_CONFIG} · 🔴 ${counts.DISABLED} · 🕒 ${counts.COMING_SOON}`
  );
}

async function buildModulesPanel(guildId) {
  const payload = await originalBuildModulesPanel(guildId);
  const embed = payload.embeds?.[0];
  const description = String(embed?.data?.description || '');
  const moduleLinePattern = /^(🟢|🟠|🟣|🔴|🕒) \*\*JOIN_TO_CREATE\*\*.*$/mu;
  const currentLine = description.match(moduleLinePattern);
  if (!embed || !currentLine) return payload;

  const moduleConfig = await query(
    `SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = 'JOIN_TO_CREATE' LIMIT 1`,
    [guildId]
  ).catch(() => ({ rows: [] }));
  const enabled = Boolean(moduleConfig.rows[0]?.enabled);
  const config = await voiceRooms.getConfig(guildId).catch(() => null);
  const active = await voiceRooms.listActiveChannels(guildId).catch(() => []);

  let state = 'DISABLED';
  let line = '🔴 **JOIN_TO_CREATE** · Disabled · Off';
  if (enabled && config?.trigger_channel_id && config.enabled !== false) {
    state = 'READY';
    line = `🟢 **JOIN_TO_CREATE** · Fully enabled · ${active.length} active room(s)`;
  } else if (enabled) {
    state = 'NEEDS_CONFIG';
    line = '🟣 **JOIN_TO_CREATE** · Needs configuration · Run /voice setup';
  }

  let nextDescription = description.replace(moduleLinePattern, line);
  nextDescription = adjustModuleSummary(nextDescription, currentLine[1], emojiForState[state]);
  embed.setDescription(nextDescription);
  return payload;
}

async function buildCommunityPanel(guildId) {
  const payload = await originalBuildCommunityPanel(guildId);
  const embed = payload.embeds?.[0];
  if (!embed) return payload;

  const [config, active] = await Promise.all([
    voiceRooms.getConfig(guildId).catch(() => null),
    voiceRooms.listActiveChannels(guildId).catch(() => [])
  ]);
  const status = config
    ? `Status: **${config.enabled ? 'Enabled' : 'Disabled'}** · Join Channel: ${config.trigger_channel_id ? `<#${config.trigger_channel_id}>` : 'Not set'} · Active Rooms: **${active.length}**`
    : 'Not configured. Run `/voice setup` after enabling the module.';

  let description = String(embed.data.description || '');
  const instructionPattern = /Use `\/welcome manager`[^\n]*$/m;
  const section = ['**Join-to-Create Voice**', status, ''].join('\n');
  if (instructionPattern.test(description)) {
    description = description.replace(
      instructionPattern,
      `${section}Use \`/welcome manager\`, \`/roles manager\`, \`/giveaway manager\`, \`/birthday manager\`, \`/level manager\`, \`/stats manager\`, or \`/voice manager\` for focused setup controls.`
    );
  } else {
    description = `${description}\n\n${section}`.trim();
  }
  embed.setDescription(description);

  payload.components[1] = createButtonRow([
    createPanelButton(CustomIds.ServerStatsRefresh, 'Stats', ButtonStyle.Secondary, '📊'),
    createPanelButton(JoinToCreateIds.Refresh, 'Voice Rooms', ButtonStyle.Secondary, '🔊'),
    createPanelButton(CustomIds.SetupRefresh, 'Back', ButtonStyle.Primary, '↩️')
  ]);
  return payload;
}

const extended = {
  ...original,
  buildModulesPanel,
  buildCommunityPanel
};

require.cache[panelsPath].exports = extended;

module.exports = extended;
