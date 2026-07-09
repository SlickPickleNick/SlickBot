const { MessageFlags } = require('discord.js');

function extractAutoDeleteSeconds(payload) {
  const raw = payload.deleteAfterSeconds ?? payload.autoDeleteSeconds ?? payload.autoDeleteMs;
  delete payload.deleteAfterSeconds;
  delete payload.autoDeleteSeconds;
  delete payload.autoDeleteMs;
  if (raw == null) return 0;
  const seconds = Number(raw > 1000 ? raw / 1000 : raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(2, Math.min(seconds, 60));
}

async function scheduleEphemeralDelete(interaction, response, seconds) {
  if (!seconds) return;
  setTimeout(async () => {
    try {
      if (response && typeof response.delete === 'function') {
        await response.delete();
        return;
      }
      if (typeof interaction.deleteReply === 'function') {
        await interaction.deleteReply();
      }
    } catch (_error) {
      // Ephemeral follow-ups cannot always be programmatically removed. Ignore.
    }
  }, seconds * 1000);
}

async function replyPrivate(interaction, options) {
  const payload = typeof options === 'string' ? { content: options } : { ...options };
  const deleteAfterSeconds = extractAutoDeleteSeconds(payload);
  payload.flags = MessageFlags.Ephemeral;

  let response;
  if (interaction.deferred || interaction.replied) {
    response = await interaction.followUp({ ...payload, fetchReply: deleteAfterSeconds > 0 });
  } else {
    response = await interaction.reply({ ...payload, fetchReply: deleteAfterSeconds > 0 });
  }

  await scheduleEphemeralDelete(interaction, response, deleteAfterSeconds);
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
