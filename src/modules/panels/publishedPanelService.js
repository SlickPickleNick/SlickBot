const { query } = require('../../services/db');

function normalizePanelRef(panelRef) {
  return panelRef == null || panelRef === '' ? '*' : String(panelRef);
}

async function recordPublishedPanel({ guildId, panelType, panelRef = '*', channelId, messageId }) {
  const normalizedRef = normalizePanelRef(panelRef);
  await query(
    `INSERT INTO panel_messages (guild_id, panel_type, panel_ref, channel_id, message_id, active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (guild_id, message_id)
     DO UPDATE SET panel_type = EXCLUDED.panel_type,
                   panel_ref = EXCLUDED.panel_ref,
                   channel_id = EXCLUDED.channel_id,
                   active = true,
                   updated_at = NOW()`,
    [guildId, panelType, normalizedRef, channelId, messageId]
  );
}

async function getPublishedPanels(guildId, panelType, panelRef = '*') {
  const normalizedRef = normalizePanelRef(panelRef);
  const result = await query(
    `SELECT * FROM panel_messages
     WHERE guild_id = $1 AND panel_type = $2 AND panel_ref = $3 AND active = true
     ORDER BY created_at ASC`,
    [guildId, panelType, normalizedRef]
  );
  return result.rows;
}

async function getPublishedPanelsForRefs(guildId, panelType, panelRefs = ['*']) {
  const refs = [...new Set(panelRefs.map(normalizePanelRef))];
  const result = await query(
    `SELECT * FROM panel_messages
     WHERE guild_id = $1 AND panel_type = $2 AND panel_ref = ANY($3) AND active = true
     ORDER BY created_at ASC`,
    [guildId, panelType, refs]
  );
  return result.rows;
}

async function markPanelInactive(id) {
  await query(`UPDATE panel_messages SET active = false, updated_at = NOW() WHERE id = $1`, [id]);
}

async function updatePanelRows(client, panels, payload) {
  let updated = 0;
  let removed = 0;

  for (const panel of panels) {
    try {
      const channel = await client.channels.fetch(panel.channel_id).catch(() => null);
      if (!channel || typeof channel.messages?.fetch !== 'function') {
        await markPanelInactive(panel.id);
        removed += 1;
        continue;
      }

      const message = await channel.messages.fetch(panel.message_id).catch(() => null);
      if (!message || typeof message.edit !== 'function') {
        await markPanelInactive(panel.id);
        removed += 1;
        continue;
      }

      await message.edit(payload);
      updated += 1;
    } catch (_error) {
      await markPanelInactive(panel.id).catch(() => {});
      removed += 1;
    }
  }

  return { updated, removed, total: panels.length };
}

async function updatePublishedPanels(client, { guildId, panelType, panelRef = '*', payload }) {
  if (!client || !payload) return { updated: 0, removed: 0, total: 0 };
  const panels = await getPublishedPanels(guildId, panelType, panelRef);
  return updatePanelRows(client, panels, payload);
}

async function updatePublishedPanelsForRefs(client, { guildId, panelType, panelRefs = ['*'], payload }) {
  if (!client || !payload) return { updated: 0, removed: 0, total: 0 };
  const panels = await getPublishedPanelsForRefs(guildId, panelType, panelRefs);
  return updatePanelRows(client, panels, payload);
}

module.exports = {
  recordPublishedPanel,
  getPublishedPanels,
  getPublishedPanelsForRefs,
  updatePublishedPanels,
  updatePublishedPanelsForRefs
};
