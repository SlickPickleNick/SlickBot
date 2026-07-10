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

function canUseInteractionReply(interaction) {
  return interaction && (typeof interaction.reply === 'function' || typeof interaction.followUp === 'function');
}

async function deleteEphemeralResponse(interaction, response, isFollowUp = false) {
  // Discord ephemeral messages can normally be deleted, but the exact method
  // differs between original interaction replies and follow-up webhook replies.
  // Try all supported deletion paths and silently ignore Discord-side expiry.
  try {
    if (response?.id && interaction?.webhook?.deleteMessage) {
      await interaction.webhook.deleteMessage(response.id);
      return true;
    }
  } catch (_error) {}

  try {
    if (!isFollowUp && typeof interaction?.deleteReply === 'function') {
      await interaction.deleteReply();
      return true;
    }
  } catch (_error) {}

  try {
    if (response && typeof response.delete === 'function') {
      await response.delete();
      return true;
    }
  } catch (_error) {}

  try {
    if (!isFollowUp && typeof interaction?.editReply === 'function') {
      await interaction.editReply({ content: '\u200B', embeds: [], components: [], files: [] });
      return true;
    }
  } catch (_error) {}

  return false;
}

function scheduleEphemeralDelete(interaction, response, seconds, isFollowUp = false) {
  if (!seconds) return;
  setTimeout(() => {
    deleteEphemeralResponse(interaction, response, isFollowUp).catch(() => {});
  }, seconds * 1000);
}

async function replyPrivate(interaction, options) {
  if (!canUseInteractionReply(interaction)) return null;
  const payload = typeof options === 'string' ? { content: options } : { ...options };
  const deleteAfterSeconds = extractAutoDeleteSeconds(payload);
  payload.flags = MessageFlags.Ephemeral;

  let response;
  let isFollowUp = false;
  if (interaction.deferred && !interaction.replied && typeof interaction.editReply === 'function') {
    const editPayload = { ...payload };
    delete editPayload.flags;
    response = await interaction.editReply(editPayload);
  } else if (interaction.replied) {
    isFollowUp = true;
    response = await interaction.followUp({ ...payload, fetchReply: deleteAfterSeconds > 0 });
  } else {
    response = await interaction.reply({ ...payload, fetchReply: deleteAfterSeconds > 0 });
  }

  scheduleEphemeralDelete(interaction, response, deleteAfterSeconds, isFollowUp);
  return response;
}

async function acknowledgeQuietly(interaction) {
  // Best for basic user actions on persistent panels, such as role toggles.
  // It avoids creating a separate ephemeral confirmation popup.
  if (!interaction || interaction.deferred || interaction.replied) return;
  if (typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate();
    return;
  }
  if (typeof interaction.deferReply === 'function') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
}

async function replyPublic(interaction, options) {
  const payload = typeof options === 'string' ? { content: options } : options;

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
}

module.exports = { replyPrivate, replyPublic, acknowledgeQuietly, deleteEphemeralResponse };
