const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');
const { updatePublishedPanelsForRefs } = require('../panels/publishedPanelService');

const MAX_NATIVE_REACTION_OPTIONS = 20;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHexColor(color, fallback = '#7869ff') {
  if (!color) return fallback;
  const value = String(color).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return fallback;
}

function parseColor(color) {
  const value = normalizeHexColor(color);
  return Number.parseInt(value.slice(1), 16);
}

function normalizeRoleIds(roleIds) {
  const values = Array.isArray(roleIds) ? roleIds : [roleIds];
  const seen = new Set();
  return values
    .flatMap((value) => String(value || '').match(/\d{15,25}/g) || [])
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function optionRoleIds(option) {
  if (!option) return [];
  if (Array.isArray(option.role_ids)) return normalizeRoleIds(option.role_ids);
  if (typeof option.role_ids === 'string') {
    try {
      const parsed = JSON.parse(option.role_ids);
      return normalizeRoleIds(parsed);
    } catch {
      return normalizeRoleIds(option.role_ids);
    }
  }
  return normalizeRoleIds(option.role_id);
}

function formatRoleMentions(roleIds) {
  const ids = normalizeRoleIds(roleIds);
  return ids.length ? ids.map((roleId) => `<@&${roleId}>`).join(', ') : 'No roles';
}

function buttonStyleFromHex(color) {
  // Discord buttons do not support arbitrary hex colors. SlickBot stores the
  // requested hex value, then maps it to the closest native Discord button style.
  const value = normalizeHexColor(color, '#5865f2').toLowerCase();
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  if (green > 150 && red < 150) return ButtonStyle.Success;
  if (red > 180 && green < 150 && blue < 150) return ButtonStyle.Danger;
  if (Math.max(red, green, blue) - Math.min(red, green, blue) < 30) return ButtonStyle.Secondary;
  return ButtonStyle.Primary;
}

function normalizeDisplayMode(displayMode) {
  const value = String(displayMode || 'BUTTONS').trim().toUpperCase();
  if (value === 'REACTIONS' || value === 'REACTION' || value === 'EMOJI' || value === 'EMOJIS') return 'REACTIONS';
  if (value === 'DROPDOWN' || value === 'SELECT' || value === 'MENU' || value === 'SELECT_MENU') return 'DROPDOWN';
  return 'BUTTONS';
}

function emojiFromHex(color) {
  const value = normalizeHexColor(color, '#5865f2').toLowerCase();
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);

  if (red > 210 && green > 210 && blue > 210) return '⬜';
  if (red < 70 && green < 70 && blue < 70) return '⬛';
  if (red > 190 && green < 120 && blue < 120) return '🟥';
  if (red > 200 && green > 120 && green < 200 && blue < 100) return '🟧';
  if (red > 190 && green > 170 && blue < 110) return '🟨';
  if (green > 150 && red < 160 && blue < 160) return '🟩';
  if (blue > 150 && red < 160) return '🟦';
  if (red > 120 && blue > 120) return '🟪';
  return '⬛';
}


async function createPanel({ guildId, name, title, description, color, mode = 'MULTI', displayMode = 'BUTTONS' }) {
  const normalizedDisplayMode = normalizeDisplayMode(displayMode);
  const result = await query(
    `INSERT INTO role_panels (guild_id, name, title, description, accent_color, mode, panel_display_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (guild_id, name)
     DO UPDATE SET title = EXCLUDED.title,
                   description = EXCLUDED.description,
                   accent_color = EXCLUDED.accent_color,
                   mode = EXCLUDED.mode,
                   panel_display_mode = EXCLUDED.panel_display_mode,
                   active = true,
                   updated_at = NOW()
     RETURNING *`,
    [guildId, name, title || name, description || 'Select an option below to toggle a role.', normalizeHexColor(color), mode, normalizedDisplayMode]
  );
  return result.rows[0];
}

async function deletePanel(guildId, name) {
  const result = await query(`UPDATE role_panels SET active = false, updated_at = NOW() WHERE guild_id = $1 AND name = $2 RETURNING *`, [guildId, name]);
  return result.rows[0] || null;
}

async function getPanelByName(guildId, name) {
  const result = await query(`SELECT * FROM role_panels WHERE guild_id = $1 AND name = $2 AND active = true LIMIT 1`, [guildId, name]);
  return result.rows[0] || null;
}

async function getPanelById(guildId, panelId) {
  const result = await query(`SELECT * FROM role_panels WHERE guild_id = $1 AND id = $2 AND active = true LIMIT 1`, [guildId, panelId]);
  return result.rows[0] || null;
}

async function getPanelByMessageId(guildId, messageId) {
  const result = await query(
    `SELECT rp.*
     FROM panel_messages pm
     JOIN role_panels rp ON rp.guild_id = pm.guild_id
       AND rp.active = true
       AND (pm.panel_ref = rp.id OR pm.panel_ref = rp.name)
     WHERE pm.guild_id = $1
       AND pm.panel_type = 'role'
       AND pm.message_id = $2
       AND pm.active = true
     LIMIT 1`,
    [guildId, messageId]
  );
  return result.rows[0] || null;
}

async function listPanels(guildId) {
  const result = await query(
    `SELECT rp.*, COUNT(rpo.id)::int AS option_count
     FROM role_panels rp
     LEFT JOIN role_panel_options rpo ON rpo.panel_id = rp.id AND rpo.active = true
     WHERE rp.guild_id = $1 AND rp.active = true
     GROUP BY rp.id
     ORDER BY rp.created_at ASC`,
    [guildId]
  );
  return result.rows;
}

async function addOption({ guildId, panelName, roleId = null, roleIds = null, label = '', emoji = null, description = null, buttonColor = null }) {
  const normalizedRoleIds = normalizeRoleIds(roleIds && roleIds.length ? roleIds : roleId);
  const primaryRoleId = normalizedRoleIds[0];
  if (!primaryRoleId) return null;

  const normalizedButtonColor = normalizeHexColor(buttonColor, '#5865f2');
  const normalizedLabel = String(label || '').trim();
  const normalizedEmoji = emoji || null;
  const panel = await getPanelByName(guildId, panelName);
  if (!panel) return null;
  const count = await query(`SELECT COUNT(*)::int AS count FROM role_panel_options WHERE panel_id = $1 AND active = true`, [panel.id]);
  const displayOrder = (count.rows[0]?.count || 0) + 1;
  const result = await query(
    `INSERT INTO role_panel_options (panel_id, role_id, role_ids, label, emoji, description, button_color, display_order)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     ON CONFLICT (panel_id, role_id)
     DO UPDATE SET role_ids = EXCLUDED.role_ids,
                   label = EXCLUDED.label,
                   emoji = EXCLUDED.emoji,
                   description = EXCLUDED.description,
                   button_color = EXCLUDED.button_color,
                   active = true,
                   updated_at = NOW()
     RETURNING *`,
    [panel.id, primaryRoleId, JSON.stringify(normalizedRoleIds), normalizedLabel, normalizedEmoji, description, normalizedButtonColor, displayOrder]
  );
  return { panel, option: result.rows[0] };
}

async function addBundleOption({ guildId, panelName, roleIds, label = '', emoji = null, description = null, buttonColor = null }) {
  return addOption({ guildId, panelName, roleIds, label, emoji, description, buttonColor });
}


async function bulkAddOptions({ guildId, panelName, entries }) {
  const results = [];
  for (const entry of entries) {
    const result = await addOption({
      guildId,
      panelName,
      roleIds: entry.roleIds || entry.roleId,
      label: entry.label,
      emoji: entry.emoji || null,
      description: entry.description || null,
      buttonColor: entry.buttonColor || null
    });
    if (result) results.push(result.option);
  }
  return results;
}

function parseBulkEntries(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(0, 25).map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    const roleRaw = parts[0] || '';
    const roleIds = normalizeRoleIds(roleRaw);
    return {
      roleId: roleIds[0] || null,
      roleIds,
      label: parts.length > 1 ? parts[1] : '',
      emoji: parts[2] || null,
      buttonColor: parts[3] || null,
      description: parts[4] || null,
      valid: roleIds.length > 0
    };
  });
}


async function removeOption({ guildId, panelName, roleId }) {
  const panel = await getPanelByName(guildId, panelName);
  if (!panel) return null;
  const result = await query(`UPDATE role_panel_options SET active = false, updated_at = NOW() WHERE panel_id = $1 AND role_id = $2 RETURNING *`, [panel.id, roleId]);
  return result.rows[0] || null;
}


async function removeAllOptions({ guildId, panelName }) {
  const panel = await getPanelByName(guildId, panelName);
  if (!panel) return null;
  const result = await query(
    `UPDATE role_panel_options SET active = false, updated_at = NOW() WHERE panel_id = $1 AND active = true RETURNING *`,
    [panel.id]
  );
  return { panel, removed: result.rowCount || 0 };
}

async function getPanelOptions(panelId) {
  const result = await query(`SELECT * FROM role_panel_options WHERE panel_id = $1 AND active = true ORDER BY display_order ASC, created_at ASC`, [panelId]);
  return result.rows;
}


async function setPanelDisplayMode({ guildId, panelName, displayMode }) {
  const normalizedDisplayMode = normalizeDisplayMode(displayMode);
  const result = await query(
    `UPDATE role_panels
     SET panel_display_mode = $3, updated_at = NOW()
     WHERE guild_id = $1 AND name = $2 AND active = true
     RETURNING *`,
    [guildId, panelName, normalizedDisplayMode]
  );
  return result.rows[0] || null;
}

async function buildRolePanelComponents(panel, options) {
  const displayMode = normalizeDisplayMode(panel.panel_display_mode || 'BUTTONS');
  if (displayMode === 'REACTIONS') return [];

  if (displayMode === 'DROPDOWN') {
    const selectOptions = options.slice(0, 25).map((option, index) => {
      const roleCount = optionRoleIds(option).length;
      const item = {
        label: (option.label && option.label.trim()) || `Role ${index + 1}`,
        value: option.id,
        description: option.description || `Toggle ${roleCount} role${roleCount === 1 ? '' : 's'}`
      };
      if (option.emoji) item.emoji = option.emoji;
      return item;
    });
    if (!selectOptions.length) return [];
    return [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`slickbot:rolepanel-select:${panel.id}`)
        .setPlaceholder(panel.mode === 'SINGLE' ? 'Choose one role...' : 'Choose a role to toggle...')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(selectOptions)
    )];
  }

  const rows = [];
  for (let i = 0; i < options.length; i += 5) {
    const row = new ActionRowBuilder();
    options.slice(i, i + 5).forEach((option) => {
      const button = new ButtonBuilder()
        .setCustomId(`slickbot:rolepanel:${panel.id}:${option.id}`)
        .setStyle(buttonStyleFromHex(option.button_color || '#5865f2'));
      if (option.label && option.label.trim()) button.setLabel(option.label.trim());
      if (option.emoji) button.setEmoji(option.emoji);
      if (!option.label && !option.emoji) button.setLabel('\u200B');
      row.addComponents(button);
    });
    rows.push(row);
  }
  return rows;
}

async function buildRolePanelMessage(panel) {
  const options = await getPanelOptions(panel.id);
  const displayMode = normalizeDisplayMode(panel.panel_display_mode || 'BUTTONS');
  const reactionLines = displayMode === 'REACTIONS'
    ? options
        .filter((option) => option.emoji)
        .map((option, index) => `${option.emoji} ${option.label && option.label.trim() ? `**${option.label.trim()}**` : `Option ${index + 1}`} — ${formatRoleMentions(optionRoleIds(option))}`)
        .join('\n')
    : '';

  const baseDescription = panel.description || (displayMode === 'REACTIONS' ? 'React below to toggle a role.' : 'Select an option below to toggle a role.');
  const description = displayMode === 'REACTIONS' && reactionLines
    ? `${baseDescription}\n\n${reactionLines}`
    : baseDescription;

  const embed = createBaseEmbed({
    title: panel.title || panel.name,
    description,
    color: parseColor(panel.accent_color) || SlickBotColors.PRIMARY,
    footer: `SlickBot Role Panel · ${panel.mode === 'SINGLE' ? 'Single role' : 'Multi role'} · ${displayMode}`
  });

  const rows = await buildRolePanelComponents(panel, options);

  return { embeds: [embed], components: rows };
}

async function toggleRole({ interaction, panelId, optionId, logger }) {
  const panel = await getPanelById(interaction.guildId, panelId);
  if (!panel) return { ok: false, reason: 'This role panel is no longer available.' };
  const options = await getPanelOptions(panel.id);
  const option = options.find((item) => item.id === optionId);
  if (!option) return { ok: false, reason: 'This role option is no longer available.' };

  const member = interaction.member;
  if (!member || !member.roles) return { ok: false, reason: 'Could not resolve your server member profile.' };

  const selectedRoleIds = optionRoleIds(option);
  if (!selectedRoleIds.length) return { ok: false, reason: 'This role option has no roles configured.' };

  const hasAllSelectedRoles = selectedRoleIds.every((roleId) => member.roles.cache.has(roleId));

  if (panel.mode === 'SINGLE' && !hasAllSelectedRoles) {
    const rolesToRemove = new Set();
    for (const other of options) {
      if (other.id === option.id) continue;
      for (const roleId of optionRoleIds(other)) {
        if (member.roles.cache.has(roleId)) rolesToRemove.add(roleId);
      }
    }
    if (rolesToRemove.size) {
      await member.roles.remove([...rolesToRemove], 'SlickBot single-select role panel').catch(() => {});
    }
  }

  if (hasAllSelectedRoles) {
    await member.roles.remove(selectedRoleIds, 'SlickBot role panel bundle toggle');
  } else {
    const missingRoleIds = selectedRoleIds.filter((roleId) => !member.roles.cache.has(roleId));
    if (missingRoleIds.length) await member.roles.add(missingRoleIds, 'SlickBot role panel bundle toggle');
  }

  await logger?.log({
    guildId: interaction.guildId,
    eventKey: 'reaction-role-toggle',
    title: 'Role Panel Used',
    body: [`User: <@${interaction.user.id}>`, `Panel: **${panel.name}**`, `Roles: ${formatRoleMentions(selectedRoleIds)}`, `Action: **${hasAllSelectedRoles ? 'Removed' : 'Added'}**`].join('\n'),
    actorUserId: interaction.user.id,
    metadata: { panelId, optionId, roleIds: selectedRoleIds, added: !hasAllSelectedRoles }
  }).catch(() => {});

  return { ok: true, added: !hasAllSelectedRoles, roleIds: selectedRoleIds, panel };
}

function cleanEmojiName(value) {
  return String(value || '').trim();
}

function reactionEmojiKey(emoji) {
  if (!emoji) return '';
  if (emoji.id) return emoji.id;
  return cleanEmojiName(emoji.name || emoji.toString?.() || '');
}

function configuredEmojiKeys(value) {
  const raw = cleanEmojiName(value);
  if (!raw) return [];
  const customMatch = raw.match(/<?a?:?([A-Za-z0-9_~]+)?:?(\d{15,25})>?/);
  const keys = new Set([raw]);
  if (customMatch && customMatch[2]) keys.add(customMatch[2]);
  return [...keys];
}

function optionMatchesReaction(option, reaction) {
  const reactionKey = reactionEmojiKey(reaction.emoji);
  if (!reactionKey || !option.emoji) return false;
  return configuredEmojiKeys(option.emoji).includes(reactionKey);
}

async function reactWithRetry(message, emoji, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await message.react(emoji);
      return { ok: true };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(500 * attempt);
    }
  }
  return { ok: false, error: lastError };
}

async function syncReactionPanelMessage(message, panel) {
  const displayMode = normalizeDisplayMode(panel?.panel_display_mode || 'BUTTONS');
  if (displayMode !== 'REACTIONS') return { added: 0, skipped: 0, failed: 0, limited: 0 };

  const options = await getPanelOptions(panel.id);
  const uniqueOptions = [];
  const seenEmojiKeys = new Set();
  let skipped = 0;

  for (const option of options) {
    if (!option.emoji) {
      skipped += 1;
      continue;
    }
    const keys = configuredEmojiKeys(option.emoji);
    const primaryKey = keys.find(Boolean) || String(option.emoji);
    if (seenEmojiKeys.has(primaryKey)) {
      skipped += 1;
      continue;
    }
    seenEmojiKeys.add(primaryKey);
    uniqueOptions.push(option);
  }

  const usable = uniqueOptions.slice(0, MAX_NATIVE_REACTION_OPTIONS);
  const limited = Math.max(0, uniqueOptions.length - usable.length);
  let added = 0;
  let failed = 0;

  for (const option of usable) {
    const alreadyPresent = message.reactions?.cache?.some((reaction) => optionMatchesReaction(option, reaction));
    if (alreadyPresent) {
      added += 1;
      continue;
    }
    const result = await reactWithRetry(message, option.emoji);
    if (result.ok) added += 1;
    else failed += 1;
    await wait(175);
  }

  return { added, skipped, failed, limited, totalConfigured: options.length, maxSupported: MAX_NATIVE_REACTION_OPTIONS };
}

async function removeOtherSingleModeReactions({ message, options, selectedOption, userId }) {
  for (const other of options) {
    if (other.id === selectedOption.id || !other.emoji) continue;
    const reaction = message.reactions.cache.find((cachedReaction) => optionMatchesReaction(other, cachedReaction));
    if (reaction) await reaction.users.remove(userId).catch(() => {});
  }
}

async function handleReactionRole({ reaction, user, action, logger }) {
  if (!reaction || !user || user.bot) return { ok: false, reason: 'Ignored bot or invalid reaction.' };
  if (reaction.partial) await reaction.fetch().catch(() => null);
  const message = reaction.message?.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
  if (!message?.guildId) return { ok: false, reason: 'Reaction was not in a server.' };

  const panel = await getPanelByMessageId(message.guildId, message.id);
  if (!panel || normalizeDisplayMode(panel.panel_display_mode) !== 'REACTIONS') return { ok: false, reason: 'No active reaction-role panel found for this message.' };

  const options = await getPanelOptions(panel.id);
  const option = options.find((item) => optionMatchesReaction(item, reaction));
  if (!option) return { ok: false, reason: 'Reaction is not configured on this panel.' };

  const guild = message.guild || await message.client.guilds.fetch(message.guildId).catch(() => null);
  const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
  if (!member) return { ok: false, reason: 'Could not resolve member.' };

  const selectedRoleIds = optionRoleIds(option);
  if (!selectedRoleIds.length) return { ok: false, reason: 'This role option has no roles configured.' };

  if (action === 'remove') {
    await member.roles.remove(selectedRoleIds, 'SlickBot native reaction role removed').catch(() => {});
    await logger?.log({
      guildId: message.guildId,
      eventKey: 'reaction-role-toggle',
      title: 'Reaction Role Removed',
      body: [`User: <@${user.id}>`, `Panel: **${panel.name}**`, `Roles: ${formatRoleMentions(selectedRoleIds)}`].join('\n'),
      actorUserId: user.id,
      metadata: { panelId: panel.id, optionId: option.id, roleIds: selectedRoleIds, added: false, displayMode: 'REACTIONS' }
    }).catch(() => {});
    return { ok: true, added: false, panel, roleIds: selectedRoleIds };
  }

  if (panel.mode === 'SINGLE') {
    const rolesToRemove = new Set();
    for (const other of options) {
      if (other.id === option.id) continue;
      for (const roleId of optionRoleIds(other)) {
        if (member.roles.cache.has(roleId)) rolesToRemove.add(roleId);
      }
    }
    if (rolesToRemove.size) await member.roles.remove([...rolesToRemove], 'SlickBot single-select native reaction role panel').catch(() => {});
    await removeOtherSingleModeReactions({ message, options, selectedOption: option, userId: user.id }).catch(() => {});
  }

  const missingRoleIds = selectedRoleIds.filter((roleId) => !member.roles.cache.has(roleId));
  if (missingRoleIds.length) await member.roles.add(missingRoleIds, 'SlickBot native reaction role added').catch(() => {});

  await logger?.log({
    guildId: message.guildId,
    eventKey: 'reaction-role-toggle',
    title: 'Reaction Role Added',
    body: [`User: <@${user.id}>`, `Panel: **${panel.name}**`, `Roles: ${formatRoleMentions(selectedRoleIds)}`].join('\n'),
    actorUserId: user.id,
    metadata: { panelId: panel.id, optionId: option.id, roleIds: selectedRoleIds, added: true, displayMode: 'REACTIONS' }
  }).catch(() => {});

  return { ok: true, added: true, panel, roleIds: selectedRoleIds };
}


async function updatePublishedRolePanelMessages(client, guildId, panel) {
  if (!panel) return { updated: 0, removed: 0, total: 0 };
  const payload = await buildRolePanelMessage(panel);
  const result = await updatePublishedPanelsForRefs(client, {
    guildId,
    panelType: 'role',
    panelRefs: [panel.id, panel.name],
    payload
  });

  if (normalizeDisplayMode(panel.panel_display_mode) === 'REACTIONS') {
    const { getPublishedPanelsForRefs } = require('../panels/publishedPanelService');
    const panels = await getPublishedPanelsForRefs(guildId, 'role', [panel.id, panel.name]).catch(() => []);
    for (const published of panels) {
      const channel = await client.channels.fetch(published.channel_id).catch(() => null);
      const message = channel && typeof channel.messages?.fetch === 'function'
        ? await channel.messages.fetch(published.message_id).catch(() => null)
        : null;
      if (message) {
        // Reaction sync can take several seconds when a panel has many options.
        // Run it outside the command response path so setup interactions do not time out.
        syncReactionPanelMessage(message, panel).catch(() => {});
      }
    }
  }

  return result;
}

async function syncAllPublishedReactionPanels(client, guildId) {
  const panelsResult = await query(
    `SELECT * FROM role_panels
     WHERE guild_id = $1 AND active = true AND UPPER(panel_display_mode) = 'REACTIONS'
     ORDER BY created_at ASC`,
    [guildId]
  );
  const { getPublishedPanelsForRefs } = require('../panels/publishedPanelService');
  let messages = 0;
  let added = 0;
  let failed = 0;
  let limited = 0;

  for (const panel of panelsResult.rows) {
    const publishedRows = await getPublishedPanelsForRefs(guildId, 'role', [panel.id, panel.name]).catch(() => []);
    for (const published of publishedRows) {
      const channel = await client.channels.fetch(published.channel_id).catch(() => null);
      const message = channel && typeof channel.messages?.fetch === 'function'
        ? await channel.messages.fetch(published.message_id).catch(() => null)
        : null;
      if (!message) continue;
      messages += 1;
      const result = await syncReactionPanelMessage(message, panel).catch(() => ({ added: 0, failed: 1, limited: 0 }));
      added += result.added || 0;
      failed += result.failed || 0;
      limited += result.limited || 0;
    }
  }

  return { panels: panelsResult.rowCount, messages, added, failed, limited };
}

async function buildRoleManagerPanel(guildId) {
  const panels = await listPanels(guildId);
  const lines = panels.length
    ? panels.map((panel) => `• **${panel.name}** — ${panel.option_count} option(s), ${panel.mode}, ${panel.panel_display_mode || 'BUTTONS'}`).join('\n')
    : 'No role panels configured.';
  const embed = createBaseEmbed({
    title: 'SlickBot Role Panel Center',
    description: [
      lines,
      '',
      'Use `/roles panel-wizard`, `/roles bulk-add-wizard`, and `/roles post-panel` for guided setup-channel creation.'
    ].join('\n'),
    color: panels.length ? SlickBotColors.SUCCESS : SlickBotColors.WARNING
  });
  return { embeds: [embed] };
}

module.exports = {
  createPanel,
  deletePanel,
  getPanelByName,
  getPanelById,
  listPanels,
  addOption,
  addBundleOption,
  bulkAddOptions,
  parseBulkEntries,
  removeOption,
  removeAllOptions,
  setPanelDisplayMode,
  buildRolePanelMessage,
  getPanelOptions,
  syncReactionPanelMessage,
  syncAllPublishedReactionPanels,
  handleReactionRole,
  toggleRole,
  buildRoleManagerPanel,
  updatePublishedRolePanelMessages,
  optionRoleIds,
  formatRoleMentions,
  normalizeDisplayMode,
  MAX_NATIVE_REACTION_OPTIONS
};
