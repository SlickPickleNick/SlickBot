const { EmbedBuilder } = require('discord.js');

function normalizeHeaderImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function resolveHeaderImageUrl(client, value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (['clear', 'remove', 'none'].includes(raw.toLowerCase())) return '';

  const messageMatch = raw.match(/https?:\/\/(?:www\.)?(?:discord\.com|discordapp\.com)\/channels\/(\d+)\/(\d+)\/(\d+)/i);
  if (messageMatch && client) {
    const [, , channelId, messageId] = messageMatch;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    const message = channel && typeof channel.messages?.fetch === 'function'
      ? await channel.messages.fetch(messageId).catch(() => null)
      : null;
    const attachment = message?.attachments?.first?.();
    const imageUrl = attachment?.url || message?.embeds?.find((embed) => embed.image?.url || embed.thumbnail?.url)?.image?.url || message?.embeds?.find((embed) => embed.thumbnail?.url)?.thumbnail?.url;
    return normalizeHeaderImageUrl(imageUrl);
  }

  return normalizeHeaderImageUrl(raw);
}

function embedsWithHeader(headerImageUrl, embed) {
  const imageUrl = normalizeHeaderImageUrl(headerImageUrl);
  if (!imageUrl) return [embed];
  return [new EmbedBuilder().setImage(imageUrl), embed];
}

module.exports = { normalizeHeaderImageUrl, resolveHeaderImageUrl, embedsWithHeader };
