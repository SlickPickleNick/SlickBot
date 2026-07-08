const { MessageFlags } = require('discord.js');

async function replyPrivate(interaction, options) {
  const payload = typeof options === 'string' ? { content: options } : { ...options };
  payload.flags = MessageFlags.Ephemeral;

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
}

async function replyPublic(interaction, options) {
  const payload = typeof options === 'string' ? { content: options } : options;

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
}

module.exports = { replyPrivate, replyPublic };
