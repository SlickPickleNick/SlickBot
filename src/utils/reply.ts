import { MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";

export async function replyPrivate(
  interaction: ChatInputCommandInteraction,
  options: string | InteractionReplyOptions
): Promise<void> {
  const payload: InteractionReplyOptions = typeof options === "string" ? { content: options } : options;
  const response = {
    ...payload,
    flags: MessageFlags.Ephemeral
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(response);
    return;
  }

  await interaction.reply(response);
}

export async function replyPublic(
  interaction: ChatInputCommandInteraction,
  options: string | InteractionReplyOptions
): Promise<void> {
  const payload: InteractionReplyOptions = typeof options === "string" ? { content: options } : options;

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
}
