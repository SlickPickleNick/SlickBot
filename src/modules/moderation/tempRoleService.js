const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');
const { query } = require('../../services/db');

const DURATION_PATTERN = /(\d+)\s*(w|week|weeks|d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/gi;
const MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

function parseDurationToMs(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return 0;
  let total = 0;
  let match;
  while ((match = DURATION_PATTERN.exec(text)) !== null) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (unit.startsWith('w')) total += amount * 7 * 24 * 60 * 60 * 1000;
    else if (unit.startsWith('d')) total += amount * 24 * 60 * 60 * 1000;
    else if (unit.startsWith('h')) total += amount * 60 * 60 * 1000;
    else total += amount * 60 * 1000;
  }
  return Math.max(0, Math.min(total, MAX_DURATION_MS));
}

function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(Number(ms || 0) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || !parts.length) parts.push(`${mins}m`);
  return parts.join(' ');
}

class TemporaryRoleService {
  async addTemporaryRole({ guild, user, role, durationText, actorUser, reason = null, logger = null }) {
    if (!guild || !user || !role) return { ok: false, reason: 'Missing guild, user, or role.' };
    if (user.bot) return { ok: false, reason: 'Temporary roles cannot be assigned to bot accounts through this command.' };
    if (role.managed) return { ok: false, reason: 'Managed roles cannot be assigned by SlickBot.' };
    if (role.id === guild.id) return { ok: false, reason: 'The @everyone role cannot be assigned temporarily.' };
    const durationMs = parseDurationToMs(durationText);
    if (!durationMs) return { ok: false, reason: 'Use a duration such as `30m`, `2h`, `7d`, or `1w`.' };
    const expiresAt = new Date(Date.now() + durationMs);
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return { ok: false, reason: 'That member could not be found in this server.' };
    const added = await member.roles.add(role.id, reason || `Temporary role assigned by ${actorUser?.tag || 'staff'}`).then(() => true).catch(() => false);
    if (!added) return { ok: false, reason: 'SlickBot could not add that role. Check bot role hierarchy and Manage Roles permission.' };

    const result = await query(
      `INSERT INTO temporary_role_assignments
       (guild_id, user_id, user_tag, role_id, assigned_by_user_id, assigned_by_tag, reason, expires_at, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
       RETURNING *`,
      [guild.id, user.id, user.tag || user.username || null, role.id, actorUser?.id || null, actorUser?.tag || actorUser?.username || null, reason, expiresAt]
    );
    const assignment = result.rows[0];

    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'temp-role-add',
      title: 'Temporary Role Assigned',
      body: [`User: <@${user.id}>`, `Role: <@&${role.id}>`, `Duration: **${formatDuration(durationMs)}**`, `Expires: <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, reason ? `Reason: ${reason}` : null, actorUser ? `Assigned By: <@${actorUser.id}>` : null].filter(Boolean).join('\n'),
      actorUserId: actorUser?.id || null,
      metadata: { assignmentId: assignment.id, userId: user.id, roleId: role.id, expiresAt: expiresAt.toISOString() }
    }).catch(() => {});

    return { ok: true, assignment, durationMs, expiresAt };
  }

  async removeTemporaryRole({ guild, user, role, actorUser = null, reason = null, logger = null }) {
    const active = await query(
      `SELECT * FROM temporary_role_assignments
       WHERE guild_id = $1 AND user_id = $2 AND role_id = $3 AND active = true
       ORDER BY expires_at ASC`,
      [guild.id, user.id, role.id]
    );
    if (!active.rows.length) return { ok: false, reason: 'No active temporary assignment was found for that user and role.' };
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member) await member.roles.remove(role.id, reason || `Temporary role removed by ${actorUser?.tag || 'staff'}`).catch(() => {});
    await query(
      `UPDATE temporary_role_assignments
       SET active = false, removed_at = NOW(), removed_by_user_id = $4, remove_reason = $5, remove_status = 'MANUAL', updated_at = NOW()
       WHERE guild_id = $1 AND user_id = $2 AND role_id = $3 AND active = true`,
      [guild.id, user.id, role.id, actorUser?.id || null, reason]
    );
    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'temp-role-remove',
      title: 'Temporary Role Removed',
      body: [`User: <@${user.id}>`, `Role: <@&${role.id}>`, actorUser ? `Removed By: <@${actorUser.id}>` : null, reason ? `Reason: ${reason}` : null].filter(Boolean).join('\n'),
      actorUserId: actorUser?.id || null,
      metadata: { userId: user.id, roleId: role.id, reason }
    }).catch(() => {});
    return { ok: true, removed: active.rows.length };
  }

  async listActive(guildId, userId = null, limit = 25) {
    const params = [guildId];
    let where = `guild_id = $1 AND active = true`;
    if (userId) {
      params.push(userId);
      where += ` AND user_id = $${params.length}`;
    }
    params.push(Math.max(1, Math.min(50, Number(limit) || 25)));
    const result = await query(
      `SELECT * FROM temporary_role_assignments
       WHERE ${where}
       ORDER BY expires_at ASC
       LIMIT $${params.length}`,
      params
    );
    return result.rows;
  }

  async processExpired(client, logger = null) {
    const due = await query(
      `UPDATE temporary_role_assignments
       SET active = false, removed_at = NOW(), remove_status = 'EXPIRED', updated_at = NOW()
       WHERE active = true AND expires_at <= NOW()
       RETURNING *`
    );
    let processed = 0;
    let failed = 0;
    for (const assignment of due.rows) {
      const guild = await client.guilds.fetch(assignment.guild_id).catch(() => null);
      const member = guild ? await guild.members.fetch(assignment.user_id).catch(() => null) : null;
      let removed = false;
      if (member) {
        removed = await member.roles.remove(assignment.role_id, 'Temporary role duration expired.').then(() => true).catch(() => false);
      }
      if (removed) processed += 1;
      else failed += 1;
      await logger?.log?.({
        guildId: assignment.guild_id,
        eventKey: removed ? 'temp-role-expire' : 'temp-role-error',
        title: removed ? 'Temporary Role Expired' : 'Temporary Role Expiration Issue',
        body: [`User: <@${assignment.user_id}>`, `Role: <@&${assignment.role_id}>`, removed ? 'Role removed automatically.' : 'SlickBot marked the assignment expired but could not remove the role. The member may have left or permissions may be missing.'].join('\n'),
        metadata: { assignmentId: assignment.id, userId: assignment.user_id, roleId: assignment.role_id, removed }
      }).catch(() => {});
    }
    return { processed, failed, total: due.rows.length };
  }

  async stats(guildId) {
    const [active, expired] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM temporary_role_assignments WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM temporary_role_assignments WHERE guild_id = $1 AND active = false`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    return { active: active.rows[0]?.count || 0, inactive: expired.rows[0]?.count || 0 };
  }

  buildListEmbed(rows, title = 'Active Temporary Roles') {
    return createBaseEmbed({
      title,
      description: rows.length
        ? rows.map((row) => `• <@${row.user_id}> — <@&${row.role_id}> until <t:${Math.floor(new Date(row.expires_at).getTime() / 1000)}:R>${row.reason ? ` · ${row.reason}` : ''}`).join('\n')
        : 'No active temporary role assignments found.',
      color: rows.length ? SlickBotColors.INFO : SlickBotColors.WARNING,
      footer: 'SlickBot Temporary Roles'
    });
  }

  async buildManagerPanel(guildId) {
    const stats = await this.stats(guildId);
    const rows = await this.listActive(guildId, null, 8).catch(() => []);
    return {
      embeds: [createBaseEmbed({
        title: 'SlickBot Temporary Roles Center',
        description: [
          `Active Temporary Roles: **${stats.active}**`,
          `Completed/Removed Assignments: **${stats.inactive}**`,
          '',
          '**Next Expiring**',
          rows.length ? rows.map((row) => `• <@${row.user_id}> — <@&${row.role_id}> · <t:${Math.floor(new Date(row.expires_at).getTime() / 1000)}:R>`).join('\n') : 'No active temporary roles.',
          '',
          'Use `/temp-role add` to assign a role for a fixed duration. SlickBot removes it automatically when it expires, including after bot restarts.'
        ].join('\n'),
        color: SlickBotColors.PRIMARY,
        footer: 'SlickBot Temporary Roles'
      })]
    };
  }
}

module.exports = { TemporaryRoleService, parseDurationToMs, formatDuration };
