const { query } = require('../../services/db');
const { truncate } = require('../../utils/format');

class ModerationService {
  async createCase(input) {
    const nextResult = await query(
      `SELECT COALESCE(MAX(case_number), 0) + 1 AS next_number
       FROM moderation_cases
       WHERE guild_id = $1`,
      [input.guildId]
    );

    const caseNumber = Number(nextResult.rows[0]?.next_number || 1);
    const result = await query(
      `INSERT INTO moderation_cases
       (guild_id, case_number, target_user_id, target_user_tag, actor_user_id, action_type, reason, status, duration_seconds, expires_at, evidence, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        input.guildId,
        caseNumber,
        input.targetUserId,
        input.targetUserTag || null,
        input.actorUserId || null,
        input.actionType,
        input.reason || null,
        input.status || 'OPEN',
        input.durationSeconds || null,
        input.expiresAt || null,
        input.evidence || null,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );

    return result.rows[0];
  }

  async getCase(guildId, caseNumber) {
    const result = await query(
      `SELECT * FROM moderation_cases WHERE guild_id = $1 AND case_number = $2 LIMIT 1`,
      [guildId, caseNumber]
    );
    return result.rows[0] || null;
  }

  async listUserCases(guildId, targetUserId, limit = 10) {
    const result = await query(
      `SELECT * FROM moderation_cases
       WHERE guild_id = $1 AND target_user_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [guildId, targetUserId, limit]
    );
    return result.rows;
  }

  async listRecentCases(guildId, limit = 10) {
    const result = await query(
      `SELECT * FROM moderation_cases
       WHERE guild_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [guildId, limit]
    );
    return result.rows;
  }

  async updateCaseStatus(guildId, caseNumber, status, actorUserId, note = null) {
    const result = await query(
      `UPDATE moderation_cases
       SET status = $1,
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE guild_id = $3 AND case_number = $4
       RETURNING *`,
      [
        status,
        JSON.stringify({ lastStatusUpdateBy: actorUserId, lastStatusNote: note, lastStatusUpdateAt: new Date().toISOString() }),
        guildId,
        caseNumber
      ]
    );
    return result.rows[0] || null;
  }

  async addUserNote(input) {
    const nextResult = await query(
      `SELECT COALESCE(MAX(note_number), 0) + 1 AS next_number
       FROM user_notes
       WHERE guild_id = $1`,
      [input.guildId]
    );

    const noteNumber = Number(nextResult.rows[0]?.next_number || 1);
    const result = await query(
      `INSERT INTO user_notes
       (guild_id, note_number, target_user_id, target_user_tag, actor_user_id, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.guildId,
        noteNumber,
        input.targetUserId,
        input.targetUserTag || null,
        input.actorUserId || null,
        input.note
      ]
    );

    return result.rows[0];
  }

  async listUserNotes(guildId, targetUserId, includeInactive = false, limit = 10) {
    const result = await query(
      `SELECT * FROM user_notes
       WHERE guild_id = $1
         AND target_user_id = $2
         AND ($3::boolean = true OR is_active = true)
       ORDER BY created_at DESC
       LIMIT $4`,
      [guildId, targetUserId, includeInactive, limit]
    );
    return result.rows;
  }

  async removeUserNote(guildId, noteNumber, actorUserId) {
    const result = await query(
      `UPDATE user_notes
       SET is_active = false,
           updated_at = NOW()
       WHERE guild_id = $1 AND note_number = $2
       RETURNING *`,
      [guildId, noteNumber]
    );
    return result.rows[0] || null;
  }
}

function formatCaseLine(item) {
  return `#${item.case_number} • **${item.action_type}** • ${item.status} • <@${item.target_user_id}>\n${truncate(item.reason || 'No reason provided.', 140)}`;
}

function formatNoteLine(item) {
  return `#${item.note_number} • ${item.is_active ? 'Active' : 'Removed'} • <@${item.target_user_id}>\n${truncate(item.note || 'No note text.', 180)}`;
}

module.exports = {
  ModerationService,
  formatCaseLine,
  formatNoteLine
};
