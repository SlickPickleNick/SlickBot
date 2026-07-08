import { LogDeliveryMode, ModuleKey } from "@prisma/client";
import { ChannelType, SlashCommandBuilder } from "discord.js";
import { ActionKeys } from "../modules/permissions/actionKeys.js";
import { replyPrivate } from "../utils/reply.js";
import type { BotCommand } from "./types.js";

export const loggingCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Configure or test logging.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-channel")
        .setDescription("Set the default log channel.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Default log channel.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("mode")
        .setDescription("Configure a log event delivery mode.")
        .addStringOption((option) => option.setName("event_key").setDescription("Example: system, moderation, voice, message-delete.").setRequired(true))
        .addStringOption((option) =>
          option
            .setName("delivery")
            .setDescription("How logs should be delivered.")
            .setRequired(true)
            .addChoices(
              { name: "Immediate", value: LogDeliveryMode.IMMEDIATE },
              { name: "Batched", value: LogDeliveryMode.BATCHED },
              { name: "Disabled", value: LogDeliveryMode.DISABLED }
            )
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Optional channel override for this event.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("interval_seconds")
            .setDescription("Batch interval in seconds. Recommended: 300 or higher.")
            .setMinValue(60)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) => subcommand.setName("test").setDescription("Send a test log."))
    .addSubcommand((subcommand) => subcommand.setName("flush").setDescription("Flush queued batched logs now.")),
  actionKey: ActionKeys.LoggingConfigure,
  moduleKey: ModuleKey.LOGGING,
  async execute(interaction, ctx) {
    if (!interaction.guildId) {
      await replyPrivate(interaction, "This command can only be used inside a server.");
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "set-channel") {
      const channel = interaction.options.getChannel("channel", true);
      await ctx.db.guildConfig.upsert({
        where: { guildId: interaction.guildId },
        create: {
          guildId: interaction.guildId,
          guildName: interaction.guild?.name ?? null,
          defaultLogChannelId: channel.id
        },
        update: { defaultLogChannelId: channel.id }
      });

      await replyPrivate(interaction, `Default log channel set to <#${channel.id}>.`);
      return;
    }

    if (subcommand === "mode") {
      const eventKey = interaction.options.getString("event_key", true).trim();
      const delivery = interaction.options.getString("delivery", true) as LogDeliveryMode;
      const channel = interaction.options.getChannel("channel", false);
      const intervalSeconds = interaction.options.getInteger("interval_seconds", false) ?? 300;

      await ctx.db.logSetting.upsert({
        where: { guildId_eventKey: { guildId: interaction.guildId, eventKey } },
        create: {
          guildId: interaction.guildId,
          eventKey,
          deliveryMode: delivery,
          channelId: channel?.id ?? null,
          batchIntervalSeconds: intervalSeconds,
          enabled: delivery !== LogDeliveryMode.DISABLED
        },
        update: {
          deliveryMode: delivery,
          channelId: channel?.id ?? undefined,
          batchIntervalSeconds: intervalSeconds,
          enabled: delivery !== LogDeliveryMode.DISABLED
        }
      });

      await replyPrivate(interaction, `Log event \`${eventKey}\` set to **${delivery}**.`);
      return;
    }

    if (subcommand === "test") {
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: "system",
        title: "Test Log",
        body: `Test log created by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id
      });

      await replyPrivate(interaction, "Test log sent or queued, depending on the current logging mode.");
      return;
    }

    if (subcommand === "flush") {
      const count = await ctx.logger.flushGuildBatches(interaction.guildId);
      await replyPrivate(interaction, `Flushed ${count} queued log item${count === 1 ? "" : "s"}.`);
    }
  }
};
