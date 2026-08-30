const { query } = require('../../services/db');
const { truncate } = require('../../utils/format');
const { analyticsBuffer } = require('../analytics/analyticsBuffer');

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

    if (input.actorUserId) {
      analyticsBuffer.recordStaffAction(input.guildId, input.actorUserId, input.actionType);
    }

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

  // --- Auto-Escalation Engine ---

  async getEscalationRules(guildId) {
    const result = await query(
      `SELECT * FROM moderation_escalation_rules
       WHERE guild_id = $1 AND active = true
       ORDER BY warning_count ASC`,
      [guildId]
    );
    return result.rows;
  }

  async setEscalationRule(guildId, warningCount, punishment, durationSeconds = null) {
    const normPunishment = String(punishment).toUpperCase();
    const result = await query(
      `INSERT INTO moderation_escalation_rules (guild_id, warning_count, punishment, duration_seconds, active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (guild_id, warning_count)
       DO UPDATE SET punishment = EXCLUDED.punishment,
                     duration_seconds = EXCLUDED.duration_seconds,
                     active = true,
                     updated_at = NOW()
       RETURNING *`,
      [guildId, Number(warningCount), normPunishment, durationSeconds ? Number(durationSeconds) : null]
    );
    return result.rows[0];
  }

  async removeEscalationRule(guildId, warningCount) {
    const result = await query(
      `DELETE FROM moderation_escalation_rules
       WHERE guild_id = $1 AND warning_count = $2
       RETURNING *`,
      [guildId, Number(warningCount)]
    );
    return result.rows[0] || null;
  }

  async getActiveWarningCount(guildId, targetUserId, expiryDays = 30) {
    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM moderation_cases
       WHERE guild_id = $1
         AND target_user_id = $2
         AND action_type = 'WARN'
         AND status = 'OPEN'
         AND ($3::int = 0 OR created_at >= NOW() - ($3::int || ' days')::interval)`,
      [guildId, targetUserId, Number(expiryDays) || 0]
    );
    return Number(result.rows[0]?.count || 0);
  }

  async checkAndApplyEscalation({ guild, member = null, targetUser, actorUser = null, autoMod = null, logger = null, expiryDays = 30 }) {
    if (!guild || !targetUser) return { escalated: false, warningCount: 0 };

    const warningCount = await this.getActiveWarningCount(guild.id, targetUser.id, expiryDays);
    const rules = await this.getEscalationRules(guild.id);
    if (!rules.length) return { escalated: false, warningCount };

    // Match rule for exact warning count
    const matchedRule = rules.find((r) => r.warning_count === warningCount);
    if (!matchedRule) {
      const nextRule = rules.find((r) => r.warning_count > warningCount);
      return { escalated: false, warningCount, nextRule: nextRule || null };
    }

    const punishment = matchedRule.punishment;
    const durationSeconds = matchedRule.duration_seconds || 3600;
    let applied = false;
    let error = null;

    const guildMember = member || (guild.members?.fetch ? await guild.members.fetch(targetUser.id).catch(() => null) : null);

    if (punishment === 'TIMEOUT') {
      if (guildMember) {
        if (autoMod && typeof autoMod.applyTimeout === 'function') {
          await autoMod.applyTimeout(guildMember, durationSeconds, `Auto-Escalation: Reached ${warningCount} active warning(s).`, actorUser);
        } else if (typeof guildMember.timeout === 'function') {
          await guildMember.timeout(durationSeconds * 1000, `Auto-Escalation: Reached ${warningCount} active warning(s).`);
        }
        applied = true;
      }
    } else if (punishment === 'KICK') {
      if (guildMember && typeof guildMember.kick === 'function') {
        await guildMember.kick(`Auto-Escalation: Reached ${warningCount} active warning(s).`).catch((err) => { error = err; });
        applied = !error;
      }
    } else if (punishment === 'BAN') {
      if (guild.bans?.create) {
        await guild.bans.create(targetUser.id, { reason: `Auto-Escalation: Reached ${warningCount} active warning(s).` }).catch((err) => { error = err; });
        applied = !error;
      } else if (guild.members?.ban) {
        await guild.members.ban(targetUser.id, { reason: `Auto-Escalation: Reached ${warningCount} active warning(s).` }).catch((err) => { error = err; });
        applied = !error;
      }
    }

    const caseRecord = await this.createCase({
      guildId: guild.id,
      targetUserId: targetUser.id,
      targetUserTag: targetUser.tag || null,
      actorUserId: actorUser?.id || null,
      actionType: punishment,
      reason: `Auto-Escalation: Triggered at ${warningCount} active warning(s).`,
      durationSeconds: punishment === 'TIMEOUT' ? durationSeconds : null,
      expiresAt: punishment === 'TIMEOUT' ? new Date(Date.now() + durationSeconds * 1000).toISOString() : null,
      metadata: { autoEscalated: true, warningCount, ruleId: matchedRule.id }
    });

    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'moderation-auto-escalation',
      title: 'Infraction Auto-Escalation Triggered',
      body: `Target: <@${targetUser.id}>\nWarning Threshold: **${warningCount} Warnings**\nAction Applied: **${punishment}**${punishment === 'TIMEOUT' ? ` (${Math.round(durationSeconds / 60)}m)` : ''}\nCase: #${caseRecord.case_number}`,
      actorUserId: actorUser?.id || null,
      metadata: { targetUserId: targetUser.id, punishment, warningCount, caseNumber: caseRecord.case_number }
    }).catch(() => {});

    return {
      escalated: true,
      applied,
      rule: matchedRule,
      punishment,
      durationSeconds,
      warningCount,
      caseRecord
    };
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
