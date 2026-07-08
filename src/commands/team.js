const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys, defaultTeamPermissions } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { query } = require('../services/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Manage SlickBot permission teams.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a permission team.')
        .addStringOption((option) => option.setName('name').setDescription('Team name.').setRequired(true))
        .addStringOption((option) => option.setName('description').setDescription('Team description.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add-role')
        .setDescription('Add a Discord role to a permission team.')
        .addStringOption((option) => option.setName('team').setDescription('Team name.').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Role to add.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove-role')
        .setDescription('Remove a Discord role from a permission team.')
        .addStringOption((option) => option.setName('team').setDescription('Team name.').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Role to remove.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('allow')
        .setDescription('Allow a team to use an action key.')
        .addStringOption((option) => option.setName('team').setDescription('Team name.').setRequired(true))
        .addStringOption((option) => option.setName('action_key').setDescription('Example: moderation.warn').setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List permission teams.')),
  actionKey: ActionKeys.TeamsManage,
  moduleKey: ModuleKeys.PERMISSIONS,
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();

    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'create') {
      const name = interaction.options.getString('name', true).trim();
      const description = interaction.options.getString('description', false);
      const result = await query(
        `INSERT INTO permission_teams (guild_id, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, name)
         DO UPDATE SET description = EXCLUDED.description, updated_at = NOW()
         RETURNING id`,
        [interaction.guildId, name, description]
      );

      const teamId = result.rows[0].id;
      for (const actionKey of defaultTeamPermissions) {
        await query(
          `INSERT INTO command_permissions (guild_id, team_id, action_key, allow, channel_scope)
           VALUES ($1, $2, $3, true, '*')
           ON CONFLICT (team_id, action_key, channel_scope) DO NOTHING`,
          [interaction.guildId, teamId, actionKey]
        );
      }

      await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Permission Team Saved', description: `Team **${name}** created/updated.`, color: SlickBotColors.SUCCESS })] });
      return;
    }

    if (subcommand === 'add-role' || subcommand === 'remove-role') {
      const teamName = interaction.options.getString('team', true).trim();
      const role = interaction.options.getRole('role', true);
      const team = await getTeam(interaction.guildId, teamName);

      if (!team) {
        await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Team Not Found', description: `Team **${teamName}** was not found.`, color: SlickBotColors.WARNING })] });
        return;
      }

      if (subcommand === 'add-role') {
        await query(
          `INSERT INTO permission_team_roles (team_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT (team_id, role_id) DO NOTHING`,
          [team.id, role.id]
        );
        await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Role Added to Team', description: `Added ${role} to **${teamName}**.`, color: SlickBotColors.SUCCESS })] });
        return;
      }

      await query(`DELETE FROM permission_team_roles WHERE team_id = $1 AND role_id = $2`, [team.id, role.id]);
      await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Role Removed from Team', description: `Removed ${role} from **${teamName}**.`, color: SlickBotColors.INFO })] });
      return;
    }

    if (subcommand === 'allow') {
      const teamName = interaction.options.getString('team', true).trim();
      const actionKey = interaction.options.getString('action_key', true).trim();
      const team = await getTeam(interaction.guildId, teamName);

      if (!team) {
        await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Team Not Found', description: `Team **${teamName}** was not found.`, color: SlickBotColors.WARNING })] });
        return;
      }

      await query(
        `INSERT INTO command_permissions (guild_id, team_id, action_key, allow, channel_scope)
         VALUES ($1, $2, $3, true, '*')
         ON CONFLICT (team_id, action_key, channel_scope)
         DO UPDATE SET allow = true, updated_at = NOW()`,
        [interaction.guildId, team.id, actionKey]
      );

      await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Team Permission Added', description: `Allowed **${teamName}** to use \`${actionKey}\`.`, color: SlickBotColors.SUCCESS })] });
      return;
    }

    if (subcommand === 'list') {
      const teams = await query(
        `SELECT pt.id, pt.name, pt.description,
                COALESCE(COUNT(DISTINCT ptr.role_id), 0) AS role_count,
                COALESCE(COUNT(DISTINCT ptu.user_id), 0) AS user_count
         FROM permission_teams pt
         LEFT JOIN permission_team_roles ptr ON ptr.team_id = pt.id
         LEFT JOIN permission_team_users ptu ON ptu.team_id = pt.id
         WHERE pt.guild_id = $1
         GROUP BY pt.id, pt.name, pt.description
         ORDER BY pt.name ASC`,
        [interaction.guildId]
      );

      if (teams.rowCount === 0) {
        await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'No Teams Found', description: 'Run `/setup` first to create the Bot Owners team.', color: SlickBotColors.WARNING })] });
        return;
      }

      const output = teams.rows
        .map((team) => `**${team.name}** — ${team.role_count} role(s), ${team.user_count} user(s)${team.description ? `\n${team.description}` : ''}`)
        .join('\n\n');
      await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'SlickBot Permission Teams', description: output, color: SlickBotColors.INFO })] });
    }
  }
};

async function getTeam(guildId, teamName) {
  const result = await query(
    `SELECT * FROM permission_teams WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [guildId, teamName]
  );
  return result.rows[0] || null;
}
