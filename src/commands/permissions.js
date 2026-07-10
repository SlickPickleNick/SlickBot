const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys, defaultModules } = require('../modules/moduleRegistry');
const { ActionKeys, PermissionLevels } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { query } = require('../services/db');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { buildPermissionsPanel } = require('../modules/ui/panels');

const moduleChoices = defaultModules.map((module) => ({ name: module.key, value: module.key })).slice(0, 25);
const levelChoices = Object.values(PermissionLevels).map((level) => ({ name: level.replace('_', ' '), value: level }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permissions')
    .setDescription('Manage SlickBot command permissions and ignored users.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Open the permission control panel.'))
    .addSubcommand((subcommand) => subcommand.setName('apply-defaults').setDescription('Reapply SlickBot default command/module permission levels.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('module-allow-team')
        .setDescription('Allow a Permission Team to use a whole command module.')
        .addStringOption((option) => option.setName('module').setDescription('Module to allow.').setRequired(true).addChoices(...moduleChoices))
        .addStringOption((option) => option.setName('team').setDescription('Permission Team name.').setRequired(true).setMaxLength(80))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('module-allow-role')
        .setDescription('Allow a Discord role to use a whole command module.')
        .addStringOption((option) => option.setName('module').setDescription('Module to allow.').setRequired(true).addChoices(...moduleChoices))
        .addRoleOption((option) => option.setName('role').setDescription('Discord role to allow.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('command-allow-team')
        .setDescription('Allow a Permission Team to use one command/action key.')
        .addStringOption((option) => option.setName('action_key').setDescription('Command/action key, example: tickets.close.').setRequired(true).setMaxLength(100))
        .addStringOption((option) => option.setName('team').setDescription('Permission Team name.').setRequired(true).setMaxLength(80))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('command-allow-role')
        .setDescription('Allow a Discord role to use one command/action key.')
        .addStringOption((option) => option.setName('action_key').setDescription('Command/action key, example: tickets.close.').setRequired(true).setMaxLength(100))
        .addRoleOption((option) => option.setName('role').setDescription('Discord role to allow.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('command-public')
        .setDescription('Set whether a command/action key is available to all non-ignored users.')
        .addStringOption((option) => option.setName('action_key').setDescription('Command/action key, example: tickets.close.').setRequired(true).setMaxLength(100))
        .addBooleanOption((option) => option.setName('enabled').setDescription('Whether all users can use this command/action.').setRequired(true))
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('role-level')
        .setDescription('Set a Discord role permission level.')
        .addRoleOption((option) => option.setName('role').setDescription('Discord role.').setRequired(true))
        .addStringOption((option) => option.setName('level').setDescription('Permission level.').setRequired(true).addChoices(...levelChoices))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('team-level')
        .setDescription('Set a Permission Team permission level.')
        .addStringOption((option) => option.setName('team').setDescription('Permission Team name.').setRequired(true).setMaxLength(80))
        .addStringOption((option) => option.setName('level').setDescription('Permission level.').setRequired(true).addChoices(...levelChoices))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('command-level')
        .setDescription('Set the default permission level required for an action key.')
        .addStringOption((option) => option.setName('action_key').setDescription('Command/action key, example: tickets.close.').setRequired(true).setMaxLength(100))
        .addStringOption((option) => option.setName('level').setDescription('Required permission level.').setRequired(true).addChoices(...levelChoices))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('module-level')
        .setDescription('Set the default permission level required for an entire module.')
        .addStringOption((option) => option.setName('module').setDescription('Module key.').setRequired(true).addChoices(...moduleChoices))
        .addStringOption((option) => option.setName('level').setDescription('Required permission level.').setRequired(true).addChoices(...levelChoices))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ignore-add')
        .setDescription('Block a user from interacting with SlickBot.')
        .addUserOption((option) => option.setName('user').setDescription('User to ignore.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for ignoring this user.').setRequired(false).setMaxLength(300))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ignore-remove')
        .setDescription('Remove a user from the SlickBot ignored-user list.')
        .addUserOption((option) => option.setName('user').setDescription('User to unignore.').setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName('ignore-list').setDescription('List ignored users.')),
  actionKey: ActionKeys.PermissionsPanel,
  moduleKey: ModuleKeys.PERMISSIONS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand.startsWith('ignore-')) return ActionKeys.PermissionsIgnore;
    if (subcommand === 'panel') return ActionKeys.PermissionsPanel;
    return ActionKeys.PermissionsManage;
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'panel') return replyPrivate(interaction, await buildPermissionsPanel(interaction.guildId));

    if (subcommand === 'apply-defaults') {
      await ctx.permissions.reapplyDefaultPermissionLevels(interaction.guildId);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'permission-team', title: 'Default Permissions Applied', body: `Built-in SlickBot permission levels were reapplied by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Default Permissions Applied', 'SlickBot command levels, module levels, and public command defaults were reapplied. Use `/permissions panel` to review current access settings.')] });
    }

    if (subcommand === 'module-allow-team') {
      const moduleKey = interaction.options.getString('module', true);
      const teamName = interaction.options.getString('team', true);
      const team = await getTeam(interaction.guildId, teamName);
      if (!team) return replyPrivate(interaction, { embeds: [createWarningEmbed('Team Not Found', `Team **${teamName}** was not found.`)] });
      await query(`INSERT INTO module_permission_targets (guild_id, module_key, target_type, target_id, allow) VALUES ($1, $2, 'TEAM', $3, true) ON CONFLICT (guild_id, module_key, target_type, target_id) DO UPDATE SET allow = true, updated_at = NOW()`, [interaction.guildId, moduleKey, team.id]);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'permission-team', title: 'Module Permission Added', body: `Team **${team.name}** can now use module **${moduleKey}**.`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Module Permission Saved', `Allowed **${team.name}** to use **${moduleKey}**.`)] });
    }

    if (subcommand === 'module-allow-role') {
      const moduleKey = interaction.options.getString('module', true);
      const role = interaction.options.getRole('role', true);
      await query(`INSERT INTO module_permission_targets (guild_id, module_key, target_type, target_id, allow) VALUES ($1, $2, 'ROLE', $3, true) ON CONFLICT (guild_id, module_key, target_type, target_id) DO UPDATE SET allow = true, updated_at = NOW()`, [interaction.guildId, moduleKey, role.id]);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'permission-team', title: 'Module Permission Added', body: `Role ${role} can now use module **${moduleKey}**.`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Module Permission Saved', `Allowed ${role} to use **${moduleKey}**.`)] });
    }

    if (subcommand === 'command-allow-team') {
      const actionKey = interaction.options.getString('action_key', true);
      const teamName = interaction.options.getString('team', true);
      const team = await getTeam(interaction.guildId, teamName);
      if (!team) return replyPrivate(interaction, { embeds: [createWarningEmbed('Team Not Found', `Team **${teamName}** was not found.`)] });
      await query(`INSERT INTO command_permissions (guild_id, team_id, action_key, allow, channel_scope) VALUES ($1, $2, $3, true, '*') ON CONFLICT (team_id, action_key, channel_scope) DO UPDATE SET allow = true, updated_at = NOW()`, [interaction.guildId, team.id, actionKey]);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Command Permission Saved', `Allowed **${team.name}** to use ${actionKey}.`)] });
    }

    if (subcommand === 'command-allow-role') {
      const actionKey = interaction.options.getString('action_key', true);
      const role = interaction.options.getRole('role', true);
      await query(`INSERT INTO role_action_permissions (guild_id, role_id, action_key, allow, channel_scope) VALUES ($1, $2, $3, true, '*') ON CONFLICT (guild_id, role_id, action_key, channel_scope) DO UPDATE SET allow = true, updated_at = NOW()`, [interaction.guildId, role.id, actionKey]);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Command Permission Saved', `Allowed ${role} to use ${actionKey}.`)] });
    }

    if (subcommand === 'command-public') {
      const actionKey = interaction.options.getString('action_key', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      await query(`INSERT INTO public_action_permissions (guild_id, action_key, enabled) VALUES ($1, $2, $3) ON CONFLICT (guild_id, action_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`, [interaction.guildId, actionKey, enabled]);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Public Command Updated', `${actionKey} is now **${enabled ? 'available to all non-ignored users' : 'restricted'}**.`)] });
    }


    if (subcommand === 'role-level') {
      const role = interaction.options.getRole('role', true);
      const level = interaction.options.getString('level', true);
      await query(`INSERT INTO role_permission_levels (guild_id, role_id, permission_level) VALUES ($1, $2, $3) ON CONFLICT (guild_id, role_id) DO UPDATE SET permission_level = EXCLUDED.permission_level, updated_at = NOW()`, [interaction.guildId, role.id, level]);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Role Level Saved', `${role} is now mapped to **${level}**.`)] });
    }

    if (subcommand === 'team-level') {
      const teamName = interaction.options.getString('team', true);
      const level = interaction.options.getString('level', true);
      const team = await getTeam(interaction.guildId, teamName);
      if (!team) return replyPrivate(interaction, { embeds: [createWarningEmbed('Team Not Found', `Team **${teamName}** was not found.`)] });
      await query(`INSERT INTO team_permission_levels (guild_id, team_id, permission_level) VALUES ($1, $2, $3) ON CONFLICT (guild_id, team_id) DO UPDATE SET permission_level = EXCLUDED.permission_level, updated_at = NOW()`, [interaction.guildId, team.id, level]);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Team Level Saved', `Team **${team.name}** is now mapped to **${level}**.`)] });
    }

    if (subcommand === 'command-level') {
      const actionKey = interaction.options.getString('action_key', true);
      const level = interaction.options.getString('level', true);
      await query(`INSERT INTO command_permission_levels (guild_id, action_key, required_level) VALUES ($1, $2, $3) ON CONFLICT (guild_id, action_key) DO UPDATE SET required_level = EXCLUDED.required_level, updated_at = NOW()`, [interaction.guildId, actionKey, level]);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Command Level Saved', `Action key \`${actionKey}\` now requires **${level}**.`)] });
    }

    if (subcommand === 'module-level') {
      const moduleKey = interaction.options.getString('module', true);
      const level = interaction.options.getString('level', true);
      await query(`INSERT INTO module_permission_levels (guild_id, module_key, required_level) VALUES ($1, $2, $3) ON CONFLICT (guild_id, module_key) DO UPDATE SET required_level = EXCLUDED.required_level, updated_at = NOW()`, [interaction.guildId, moduleKey, level]);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Module Level Saved', `Module **${moduleKey}** now requires **${level}** unless a command has a higher requirement.`)] });
    }

    if (subcommand === 'ignore-add') {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || null;
      await query(`INSERT INTO permission_ignored_users (guild_id, user_id, reason, added_by_user_id, active) VALUES ($1, $2, $3, $4, true) ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, added_by_user_id = EXCLUDED.added_by_user_id, active = true, updated_at = NOW()`, [interaction.guildId, user.id, reason, interaction.user.id]);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'permission-team', title: 'User Ignored', body: `${user.tag} was added to the SlickBot ignored-user list by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Ignored', `${user} can no longer interact with SlickBot.`)] });
    }

    if (subcommand === 'ignore-remove') {
      const user = interaction.options.getUser('user', true);
      await query(`UPDATE permission_ignored_users SET active = false, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2`, [interaction.guildId, user.id]);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Unignored', `${user} can interact with SlickBot again.`)] });
    }

    if (subcommand === 'ignore-list') {
      const rows = await query(`SELECT user_id, reason, added_by_user_id, created_at FROM permission_ignored_users WHERE guild_id = $1 AND active = true ORDER BY created_at DESC LIMIT 25`, [interaction.guildId]);
      const description = rows.rowCount ? rows.rows.map((row) => `• <@${row.user_id}>${row.reason ? ` — ${row.reason}` : ''}`).join('\n') : 'No users are currently ignored.';
      return replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Ignored Users', description, color: SlickBotColors.INFO })] });
    }
  }
};

async function getTeam(guildId, teamName) {
  const result = await query(`SELECT * FROM permission_teams WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [guildId, teamName]);
  return result.rows[0] || null;
}
