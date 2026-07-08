import { ModuleKey } from "@prisma/client";
import { SlashCommandBuilder } from "discord.js";
import { replyPrivate } from "../utils/reply.js";
import type { BotCommand } from "./types.js";

export const pingCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check whether the bot is online."),
  actionKey: "bot.ping",
  moduleKey: ModuleKey.PERMISSIONS,
  async execute(interaction) {
    await replyPrivate(interaction, `Bot is online. Latency: ${interaction.client.ws.ping}ms`);
  }
};
