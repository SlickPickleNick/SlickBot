const { PermissionFlagsBits } = require('discord.js');
const { query } = require('../../services/db');
const { botOwnerIds, env } = require('../../config/env');
const { defaultModules, ModuleKeys } = require('../moduleRegistry');
const {
  defaultTeamPermissions,
  defaultActionLevels,
  defaultModuleLevels,
  defaultPublicActions,
  permissionLevelRank,
  PermissionLevels,
  PERMISSION_DEFAULTS_VERSION
} = require('./actionKeys');

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

    await this.ensureDefaultPermissionLevels(guildId);
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

  async getPublicActionSetting(guildId, actionKey) {
    const result = await query(
      `SELECT enabled FROM public_action_permissions WHERE guild_id = $1 AND action_key = $2 LIMIT 1`,
      [guildId, actionKey]
    ).catch(() => ({ rows: [] }));
    if (!result.rows.length) return null;
    return Boolean(result.rows[0]?.enabled);
  }

  async isPublicAction(guildId, actionKey) {
    return (await this.getPublicActionSetting(guildId, actionKey)) === true;
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


  async ensureDefaultPermissionLevels(guildId) {
    const versionResult = await query(
      `SELECT seeded_version FROM permission_default_versions WHERE guild_id = $1 LIMIT 1`,
      [guildId]
    ).catch(() => ({ rows: [] }));

    const shouldReseed = versionResult.rows[0]?.seeded_version !== PERMISSION_DEFAULTS_VERSION;
    if (shouldReseed) {
      await this.reapplyDefaultPermissionLevels(guildId);
      return;
    }

    await this.seedMissingDefaultPermissionLevels(guildId);
  }

  async seedMissingDefaultPermissionLevels(guildId) {
    for (const [actionKey, level] of Object.entries(defaultActionLevels)) {
      await query(
        `INSERT INTO command_permission_levels (guild_id, action_key, required_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, action_key) DO NOTHING`,
        [guildId, actionKey, level]
      ).catch(() => {});
    }

    for (const [moduleKey, level] of Object.entries(defaultModuleLevels)) {
      await query(
        `INSERT INTO module_permission_levels (guild_id, module_key, required_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, module_key) DO NOTHING`,
        [guildId, moduleKey, level]
      ).catch(() => {});
    }

    for (const actionKey of defaultPublicActions) {
      await query(
        `INSERT INTO public_action_permissions (guild_id, action_key, enabled)
         VALUES ($1, $2, true)
         ON CONFLICT (guild_id, action_key) DO NOTHING`,
        [guildId, actionKey]
      ).catch(() => {});
    }
  }

  async reapplyDefaultPermissionLevels(guildId) {
    for (const [actionKey, level] of Object.entries(defaultActionLevels)) {
      await query(
        `INSERT INTO command_permission_levels (guild_id, action_key, required_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, action_key)
         DO UPDATE SET required_level = EXCLUDED.required_level, updated_at = NOW()`,
        [guildId, actionKey, level]
      ).catch(() => {});
    }

    for (const [moduleKey, level] of Object.entries(defaultModuleLevels)) {
      await query(
        `INSERT INTO module_permission_levels (guild_id, module_key, required_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, module_key)
         DO UPDATE SET required_level = EXCLUDED.required_level, updated_at = NOW()`,
        [guildId, moduleKey, level]
      ).catch(() => {});
    }

    const knownPublicActions = new Set(defaultPublicActions);
    for (const actionKey of Object.keys(defaultActionLevels)) {
      await query(
        `INSERT INTO public_action_permissions (guild_id, action_key, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, action_key)
         DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
        [guildId, actionKey, knownPublicActions.has(actionKey)]
      ).catch(() => {});
    }

    await query(
      `INSERT INTO permission_default_versions (guild_id, seeded_version)
       VALUES ($1, $2)
       ON CONFLICT (guild_id)
       DO UPDATE SET seeded_version = EXCLUDED.seeded_version, updated_at = NOW()`,
      [guildId, PERMISSION_DEFAULTS_VERSION]
    ).catch(() => {});
  }

  isServerOwner(interaction) {
    return Boolean(interaction.guild && interaction.guild.ownerId === interaction.user.id);
  }

  normalizeLevel(level) {
    const normalized = String(level || '').toUpperCase();
    return Object.values(PermissionLevels).includes(normalized) ? normalized : PermissionLevels.SENIOR_MODERATOR;
  }

  async getRequiredLevel(guildId, actionKey, moduleKey) {
    const [commandLevel, moduleLevel] = await Promise.all([
      query(`SELECT required_level FROM command_permission_levels WHERE guild_id = $1 AND action_key = $2 LIMIT 1`, [guildId, actionKey]).catch(() => ({ rows: [] })),
      query(`SELECT required_level FROM module_permission_levels WHERE guild_id = $1 AND module_key = $2 LIMIT 1`, [guildId, moduleKey]).catch(() => ({ rows: [] }))
    ]);
    const actionDefault = defaultActionLevels[actionKey] || PermissionLevels.SENIOR_MODERATOR;
    const levels = [this.normalizeLevel(actionDefault)];
    if (commandLevel.rows[0]?.required_level) levels.push(this.normalizeLevel(commandLevel.rows[0].required_level));
    if (moduleLevel.rows[0]?.required_level) levels.push(this.normalizeLevel(moduleLevel.rows[0].required_level));
    return levels.sort((a, b) => (permissionLevelRank[b] || 0) - (permissionLevelRank[a] || 0))[0];
  }

  async getUserPermissionLevel(interaction, roleIds = []) {
    if (this.isBotOwner(interaction.user.id) || this.isServerOwner(interaction)) return PermissionLevels.OWNER;
    if (interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return PermissionLevels.OWNER;

    let highest = PermissionLevels.EVERYONE;
    if (roleIds.length) {
      const roleResult = await query(
        `SELECT permission_level FROM role_permission_levels WHERE guild_id = $1 AND role_id = ANY($2)`,
        [interaction.guildId, roleIds]
      ).catch(() => ({ rows: [] }));
      for (const row of roleResult.rows) {
        const level = this.normalizeLevel(row.permission_level);
        if ((permissionLevelRank[level] || 0) > (permissionLevelRank[highest] || 0)) highest = level;
      }
    }

    const teamResult = await query(
      `SELECT tpl.permission_level
       FROM team_permission_levels tpl
       INNER JOIN permission_teams pt ON pt.id = tpl.team_id
       LEFT JOIN permission_team_users ptu ON ptu.team_id = pt.id
       LEFT JOIN permission_team_roles ptr ON ptr.team_id = pt.id
       WHERE tpl.guild_id = $1
         AND (ptu.user_id = $2 OR (${roleIds.length ? 'ptr.role_id = ANY($3)' : 'false'}))`,
      roleIds.length ? [interaction.guildId, interaction.user.id, roleIds] : [interaction.guildId, interaction.user.id]
    ).catch(() => ({ rows: [] }));

    for (const row of teamResult.rows) {
      const level = this.normalizeLevel(row.permission_level);
      if ((permissionLevelRank[level] || 0) > (permissionLevelRank[highest] || 0)) highest = level;
    }

    return highest;
  }

  async hasRequiredLevel(interaction, actionKey, moduleKey, roleIds) {
    await this.ensureDefaultPermissionLevels(interaction.guildId);
    const [required, userLevel] = await Promise.all([
      this.getRequiredLevel(interaction.guildId, actionKey, moduleKey),
      this.getUserPermissionLevel(interaction, roleIds)
    ]);
    return {
      allowed: (permissionLevelRank[userLevel] || 0) >= (permissionLevelRank[required] || 0),
      required,
      userLevel
    };
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

    const roleIds = this.getInteractionRoleIds(interaction);

    const moduleAccess = await this.hasModuleTargetAccess(interaction, moduleKey, roleIds);
    if (moduleAccess.locked && !moduleAccess.allowed) {
      return { allowed: false, reason: `The ${moduleKey} module is restricted to configured teams/roles.` };
    }

    const publicSetting = await this.getPublicActionSetting(interaction.guildId, actionKey);
    if (publicSetting === true) return { allowed: true };

    const levelCheck = await this.hasRequiredLevel(interaction, actionKey, moduleKey, roleIds);
    if (levelCheck.allowed && !(publicSetting === false && levelCheck.userLevel === PermissionLevels.EVERYONE)) return { allowed: true };

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

    return { allowed: false, reason: `You do not have permission to use this command/action. Required level: ${levelCheck.required}. Your level: ${levelCheck.userLevel}.` };
  }

  async checkPublicInteraction(interaction, actionKey, moduleKey) {
    if (!interaction.guildId) return { allowed: false, reason: 'This command can only be used inside a server.' };
    await this.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
    if (await this.isIgnored(interaction.guildId, interaction.user.id)) return { allowed: false, reason: 'You are currently blocked from interacting with SlickBot.' };
    const moduleEnabled = await this.isModuleEnabled(interaction.guildId, moduleKey);
    if (!moduleEnabled) return { allowed: false, reason: `The ${moduleKey} module is disabled.` };

    const roleIds = this.getInteractionRoleIds(interaction);
    const moduleAccess = await this.hasModuleTargetAccess(interaction, moduleKey, roleIds);
    if (moduleAccess.locked && !moduleAccess.allowed) return { allowed: false, reason: `The ${moduleKey} module is restricted to configured teams/roles.` };

    const publicSetting = await this.getPublicActionSetting(interaction.guildId, actionKey);
    if (publicSetting === true || publicSetting === null) return { allowed: true };

    const levelCheck = await this.hasRequiredLevel(interaction, actionKey, moduleKey, roleIds);
    if (levelCheck.allowed && levelCheck.userLevel !== PermissionLevels.EVERYONE) return { allowed: true };
    return { allowed: false, reason: `This command is not currently available to everyone. Required level: ${levelCheck.required}. Your level: ${levelCheck.userLevel}.` };
  }
}

module.exports = { PermissionService };
