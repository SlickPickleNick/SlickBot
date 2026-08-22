const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');
const { query } = require('../../services/db');
const { CustomIds } = require('../ui/customIds');
const { parseDurationToMs: parseTimeMs, formatDuration, MAX_DURATION_MS } = require('../../utils/time');

function parseDurationToMs(input) {
  return parseTimeMs(input, { maxDurationMs: MAX_DURATION_MS, fallback: 0 });
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

    const embed = createBaseEmbed({
      title: 'SlickBot Temporary Roles Center',
      description: [
        `Active Temporary Roles: **${stats.active} member(s)**`,
        `Completed/Removed Assignments: **${stats.inactive}**`,
        '',
        '**Next Expiring Role Assignments**',
        rows.length ? rows.map((row) => `• <@${row.user_id}> — <@&${row.role_id}> · expires <t:${Math.floor(new Date(row.expires_at).getTime() / 1000)}:R>`).join('\n') : '*No active temporary roles.*',
        '',
        'Moderators can assign timed roles with `/temp-role add`. SlickBot automatically strips expired roles.'
      ].join('\n'),
      color: stats.active > 0 ? SlickBotColors.SUCCESS : SlickBotColors.PRIMARY,
      footer: 'SlickBot Temporary Roles'
    });

    const moduleCfg = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = 'TEMP_ROLES' LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const enabled = moduleCfg.rows[0]?.enabled ?? true;

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingModulePrefix}TEMP_ROLES`)
        .setLabel('Quick Setup')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.ModuleTogglePrefix}TEMP_ROLES`)
        .setLabel(enabled ? 'Disable Module' : 'Enable Module')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(enabled ? '⏸️' : '▶️'),
      new ButtonBuilder()
        .setCustomId(CustomIds.TempRolesCleanup)
        .setLabel('Check Expirations')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🧹')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.TempRolesRefresh)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupCategoryCore)
        .setLabel('Core & Safety')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🛡️'),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupRefresh)
        .setLabel('Setup Center')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚙️')
    );

    return { embeds: [embed], components: [row1, row2] };
  }
}

module.exports = { TemporaryRoleService, parseDurationToMs, formatDuration };
