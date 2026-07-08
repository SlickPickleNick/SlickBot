const { PermissionFlagsBits } = require('discord.js');
const { query } = require('../../services/db');
const { botOwnerIds, env } = require('../../config/env');
const { defaultModules, ModuleKeys } = require('../moduleRegistry');
const { defaultTeamPermissions } = require('./actionKeys');

class PermissionService {
  isBotOwner(userId) {
    return botOwnerIds.includes(userId);
  }

  async ensureGuildConfig(guildId, guildName = null) {
    await query(
      `INSERT INTO guild_configs (guild_id, guild_name, timezone)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id)
       DO UPDATE SET guild_name = EXCLUDED.guild_name, updated_at = NOW()`,
      [guildId, guildName, env.DEFAULT_TIMEZONE]
    );

    for (const moduleConfig of defaultModules) {
      await query(
        `INSERT INTO module_configs (guild_id, module_key, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, module_key) DO NOTHING`,
        [guildId, moduleConfig.key, moduleConfig.enabled]
      );
    }
  }

  async ensureOwnerTeam(guildId, ownerUserId) {
    const teamResult = await query(
      `INSERT INTO permission_teams (guild_id, name, description, is_system_team)
       VALUES ($1, 'Bot Owners', 'Full SlickBot access.', true)
       ON CONFLICT (guild_id, name)
       DO UPDATE SET description = EXCLUDED.description, updated_at = NOW()
       RETURNING id`,
      [guildId]
    );

    const teamId = teamResult.rows[0].id;

    if (ownerUserId) {
      await query(
        `INSERT INTO permission_team_users (team_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (team_id, user_id) DO NOTHING`,
        [teamId, ownerUserId]
      );
    }

    for (const actionKey of defaultTeamPermissions) {
      await query(
        `INSERT INTO command_permissions (guild_id, team_id, action_key, allow, channel_scope)
         VALUES ($1, $2, $3, true, '*')
         ON CONFLICT (team_id, action_key, channel_scope)
         DO UPDATE SET allow = true, updated_at = NOW()`,
        [guildId, teamId, actionKey]
      );
    }

    return teamId;
  }

  async isModuleEnabled(guildId, moduleKey) {
    if (moduleKey === ModuleKeys.PERMISSIONS || moduleKey === ModuleKeys.LOGGING || moduleKey === ModuleKeys.STATUS) return true;

    const result = await query(
      `SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = $2 LIMIT 1`,
      [guildId, moduleKey]
    );

    if (result.rowCount === 0) return false;
    return Boolean(result.rows[0].enabled);
  }

  getInteractionRoleIds(interaction) {
    const member = interaction.member;
    if (!member || typeof member !== 'object') return [];

    if (Array.isArray(member.roles)) return member.roles;

    if (member.roles && member.roles.cache) {
      return Array.from(member.roles.cache.keys());
    }

    return [];
  }

  async isIgnored(guildId, userId) {
    if (!guildId || !userId) return false;
    if (this.isBotOwner(userId)) return false;
    const result = await query(
      `SELECT 1 FROM permission_ignored_users WHERE guild_id = $1 AND user_id = $2 AND active = true LIMIT 1`,
      [guildId, userId]
    ).catch(() => ({ rowCount: 0 }));
    return result.rowCount > 0;
  }

  async isPublicAction(guildId, actionKey) {
    const result = await query(
      `SELECT enabled FROM public_action_permissions WHERE guild_id = $1 AND action_key = $2 LIMIT 1`,
      [guildId, actionKey]
    ).catch(() => ({ rows: [] }));
    return Boolean(result.rows[0]?.enabled);
  }

  async hasModuleTargetAccess(interaction, moduleKey, roleIds) {
    const targetCount = await query(
      `SELECT COUNT(*)::int AS count FROM module_permission_targets WHERE guild_id = $1 AND module_key = $2 AND allow = true`,
      [interaction.guildId, moduleKey]
    ).catch(() => ({ rows: [{ count: 0 }] }));

    if ((targetCount.rows[0]?.count || 0) === 0) return { locked: false, allowed: true };

    const result = await query(
      `SELECT 1
       FROM module_permission_targets mpt
       LEFT JOIN permission_team_users ptu ON mpt.target_type = 'TEAM' AND ptu.team_id = mpt.target_id
       LEFT JOIN permission_team_roles ptr ON mpt.target_type = 'TEAM' AND ptr.team_id = mpt.target_id
       WHERE mpt.guild_id = $1
         AND mpt.module_key = $2
         AND mpt.allow = true
         AND (
           (mpt.target_type = 'EVERYONE' AND mpt.target_id = '*')
           OR (mpt.target_type = 'USER' AND mpt.target_id = $3)
           OR (${roleIds.length > 0 ? "mpt.target_type = 'ROLE' AND mpt.target_id = ANY($4)" : 'false'})
           OR (mpt.target_type = 'TEAM' AND (ptu.user_id = $3 OR ${roleIds.length > 0 ? 'ptr.role_id = ANY($4)' : 'false'}))
         )
       LIMIT 1`,
      roleIds.length > 0 ? [interaction.guildId, moduleKey, interaction.user.id, roleIds] : [interaction.guildId, moduleKey, interaction.user.id]
    ).catch(() => ({ rowCount: 0 }));

    return { locked: true, allowed: result.rowCount > 0 };
  }

  async checkInteraction(interaction, actionKey, moduleKey) {
    if (!interaction.guildId) {
      return { allowed: false, reason: 'This command can only be used inside a server.' };
    }

    await this.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (await this.isIgnored(interaction.guildId, interaction.user.id)) {
      return { allowed: false, reason: 'You are currently blocked from interacting with SlickBot.' };
    }

    if (this.isBotOwner(interaction.user.id)) return { allowed: true };

    const moduleEnabled = await this.isModuleEnabled(interaction.guildId, moduleKey);
    if (!moduleEnabled) {
      return { allowed: false, reason: `The ${moduleKey} module is disabled.` };
    }

    if (await this.isPublicAction(interaction.guildId, actionKey)) return { allowed: true };

    if (interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return { allowed: true };
    }

    const roleIds = this.getInteractionRoleIds(interaction);
    const moduleAccess = await this.hasModuleTargetAccess(interaction, moduleKey, roleIds);
    if (moduleAccess.locked && !moduleAccess.allowed) {
      return { allowed: false, reason: `The ${moduleKey} module is restricted to configured teams/roles.` };
    }

    if (moduleAccess.locked && moduleAccess.allowed) return { allowed: true };

    const teamResult = await query(
      `SELECT DISTINCT pt.id
       FROM permission_teams pt
       LEFT JOIN permission_team_users ptu ON ptu.team_id = pt.id
       LEFT JOIN permission_team_roles ptr ON ptr.team_id = pt.id
       INNER JOIN command_permissions cp ON cp.team_id = pt.id
       WHERE pt.guild_id = $1
         AND cp.guild_id = $1
         AND cp.action_key = $2
         AND cp.allow = true
         AND (cp.channel_scope = '*' OR cp.channel_scope = $3)
         AND (
           ptu.user_id = $4
           OR (${roleIds.length > 0 ? 'ptr.role_id = ANY($5)' : 'false'})
         )
       LIMIT 1`,
      roleIds.length > 0
        ? [interaction.guildId, actionKey, interaction.channelId, interaction.user.id, roleIds]
        : [interaction.guildId, actionKey, interaction.channelId, interaction.user.id]
    );

    if (teamResult.rowCount > 0) return { allowed: true };

    if (roleIds.length > 0) {
      const roleResult = await query(
        `SELECT 1 FROM role_action_permissions
         WHERE guild_id = $1 AND action_key = $2 AND allow = true AND (channel_scope = '*' OR channel_scope = $3) AND role_id = ANY($4)
         LIMIT 1`,
        [interaction.guildId, actionKey, interaction.channelId, roleIds]
      ).catch(() => ({ rowCount: 0 }));
      if (roleResult.rowCount > 0) return { allowed: true };
    }

    return { allowed: false, reason: 'You do not have permission to use this command/action.' };
  }

  async checkPublicInteraction(interaction, actionKey, moduleKey) {
    if (!interaction.guildId) return { allowed: false, reason: 'This command can only be used inside a server.' };
    await this.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
    if (await this.isIgnored(interaction.guildId, interaction.user.id)) return { allowed: false, reason: 'You are currently blocked from interacting with SlickBot.' };
    const moduleEnabled = await this.isModuleEnabled(interaction.guildId, moduleKey);
    if (!moduleEnabled) return { allowed: false, reason: `The ${moduleKey} module is disabled.` };
    return { allowed: true };
  }
}

module.exports = { PermissionService };
