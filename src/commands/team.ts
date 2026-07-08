import { ModuleKey } from "@prisma/client";
import { SlashCommandBuilder } from "discord.js";
import { ActionKeys } from "../modules/permissions/actionKeys.js";
import { replyPrivate } from "../utils/reply.js";
import type { BotCommand } from "./types.js";

export const teamCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("team")
    .setDescription("Manage bot permission teams.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a permission team.")
        .addStringOption((option) => option.setName("name").setDescription("Team name.").setRequired(true))
        .addStringOption((option) => option.setName("description").setDescription("Optional team description.").setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add-role")
        .setDescription("Add a Discord role to a permission team.")
        .addStringOption((option) => option.setName("team").setDescription("Team name.").setRequired(true).setAutocomplete(false))
        .addRoleOption((option) => option.setName("role").setDescription("Discord role to add.").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove-role")
        .setDescription("Remove a Discord role from a permission team.")
        .addStringOption((option) => option.setName("team").setDescription("Team name.").setRequired(true))
        .addRoleOption((option) => option.setName("role").setDescription("Discord role to remove.").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add-user")
        .setDescription("Add a specific user to a permission team.")
        .addStringOption((option) => option.setName("team").setDescription("Team name.").setRequired(true))
        .addUserOption((option) => option.setName("user").setDescription("User to add.").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove-user")
        .setDescription("Remove a specific user from a permission team.")
        .addStringOption((option) => option.setName("team").setDescription("Team name.").setRequired(true))
        .addUserOption((option) => option.setName("user").setDescription("User to remove.").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("allow")
        .setDescription("Allow a team to use a bot action.")
        .addStringOption((option) => option.setName("team").setDescription("Team name.").setRequired(true))
        .addStringOption((option) => option.setName("action_key").setDescription("Action key, such as moderation.warn.").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("revoke")
        .setDescription("Remove a bot action from a team.")
        .addStringOption((option) => option.setName("team").setDescription("Team name.").setRequired(true))
        .addStringOption((option) => option.setName("action_key").setDescription("Action key to revoke.").setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List permission teams.")),
  actionKey: ActionKeys.PermissionsManage,
  moduleKey: ModuleKey.PERMISSIONS,
  async execute(interaction, ctx) {
    if (!interaction.guildId) {
      await replyPrivate(interaction, "This command can only be used inside a server.");
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const name = interaction.options.getString("name", true).trim();
      const description = interaction.options.getString("description", false)?.trim() ?? null;

      await ctx.db.permissionTeam.upsert({
        where: { guildId_name: { guildId: interaction.guildId, name } },
        create: { guildId: interaction.guildId, name, description },
        update: { description }
      });

      await ctx.logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.PermissionsManage,
        targetType: "PermissionTeam",
        targetId: name,
        summary: `Permission team created/updated: ${name}`
      });

      await replyPrivate(interaction, `Team created/updated: **${name}**`);
      return;
    }

    if (subcommand === "add-role") {
      const teamName = interaction.options.getString("team", true).trim();
      const role = interaction.options.getRole("role", true);
      const team = await ctx.db.permissionTeam.findUnique({ where: { guildId_name: { guildId: interaction.guildId, name: teamName } } });

      if (!team) {
        await replyPrivate(interaction, `Team not found: **${teamName}**`);
        return;
      }

      await ctx.db.permissionTeamRole.upsert({
        where: { teamId_roleId: { teamId: team.id, roleId: role.id } },
        create: { teamId: team.id, roleId: role.id },
        update: {}
      });

      await replyPrivate(interaction, `Added ${role.toString()} to **${team.name}**.`);
      return;
    }

    if (subcommand === "remove-role") {
      const teamName = interaction.options.getString("team", true).trim();
      const role = interaction.options.getRole("role", true);
      const team = await ctx.db.permissionTeam.findUnique({ where: { guildId_name: { guildId: interaction.guildId, name: teamName } } });

      if (!team) {
        await replyPrivate(interaction, `Team not found: **${teamName}**`);
        return;
      }

      await ctx.db.permissionTeamRole.deleteMany({ where: { teamId: team.id, roleId: role.id } });
      await replyPrivate(interaction, `Removed ${role.toString()} from **${team.name}**.`);
      return;
    }

    if (subcommand === "add-user") {
      const teamName = interaction.options.getString("team", true).trim();
      const user = interaction.options.getUser("user", true);
      const team = await ctx.db.permissionTeam.findUnique({ where: { guildId_name: { guildId: interaction.guildId, name: teamName } } });

      if (!team) {
        await replyPrivate(interaction, `Team not found: **${teamName}**`);
        return;
      }

      await ctx.db.permissionTeamUser.upsert({
        where: { teamId_userId: { teamId: team.id, userId: user.id } },
        create: { teamId: team.id, userId: user.id },
        update: {}
      });

      await replyPrivate(interaction, `Added ${user.toString()} to **${team.name}**.`);
      return;
    }

    if (subcommand === "remove-user") {
      const teamName = interaction.options.getString("team", true).trim();
      const user = interaction.options.getUser("user", true);
      const team = await ctx.db.permissionTeam.findUnique({ where: { guildId_name: { guildId: interaction.guildId, name: teamName } } });

      if (!team) {
        await replyPrivate(interaction, `Team not found: **${teamName}**`);
        return;
      }

      await ctx.db.permissionTeamUser.deleteMany({ where: { teamId: team.id, userId: user.id } });
      await replyPrivate(interaction, `Removed ${user.toString()} from **${team.name}**.`);
      return;
    }

    if (subcommand === "allow") {
      const teamName = interaction.options.getString("team", true).trim();
      const actionKey = interaction.options.getString("action_key", true).trim();
      const team = await ctx.db.permissionTeam.findUnique({ where: { guildId_name: { guildId: interaction.guildId, name: teamName } } });

      if (!team) {
        await replyPrivate(interaction, `Team not found: **${teamName}**`);
        return;
      }

      await ctx.db.commandPermission.upsert({
        where: {
          teamId_actionKey_channelScope: {
            teamId: team.id,
            actionKey,
            channelScope: "*"
          }
        },
        create: {
          guildId: interaction.guildId,
          teamId: team.id,
          actionKey,
          channelScope: "*",
          allow: true
        },
        update: { allow: true }
      });

      await replyPrivate(interaction, `Allowed **${team.name}** to use \`${actionKey}\`.`);
      return;
    }

    if (subcommand === "revoke") {
      const teamName = interaction.options.getString("team", true).trim();
      const actionKey = interaction.options.getString("action_key", true).trim();
      const team = await ctx.db.permissionTeam.findUnique({ where: { guildId_name: { guildId: interaction.guildId, name: teamName } } });

      if (!team) {
        await replyPrivate(interaction, `Team not found: **${teamName}**`);
        return;
      }

      await ctx.db.commandPermission.deleteMany({ where: { teamId: team.id, actionKey } });
      await replyPrivate(interaction, `Revoked \`${actionKey}\` from **${team.name}**.`);
      return;
    }

    if (subcommand === "list") {
      const teams = await ctx.db.permissionTeam.findMany({
        where: { guildId: interaction.guildId },
        include: { roles: true, users: true, permissions: true },
        orderBy: { name: "asc" }
      });

      if (teams.length === 0) {
        await replyPrivate(interaction, "No permission teams have been created yet.");
        return;
      }

      const output = teams
        .map((team) => {
          const roleList = team.roles.length > 0 ? team.roles.map((role) => `<@&${role.roleId}>`).join(", ") : "No roles";
          const userList = team.users.length > 0 ? team.users.map((user) => `<@${user.userId}>`).join(", ") : "No users";
          return `**${team.name}**\nRoles: ${roleList}\nUsers: ${userList}\nAllowed actions: ${team.permissions.length}`;
        })
        .join("\n\n");

      await replyPrivate(interaction, { content: output.slice(0, 1900) });
    }
  }
};
