const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const SlickBotColors = Object.freeze({
  PRIMARY: 0x7869ff,
  SUCCESS: 0x35d07f,
  WARNING: 0xf2b84b,
  ERROR: 0xff5c7a,
  INFO: 0x5aa7ff,
  MUTED: 0x2b2f3a
});

function createBaseEmbed({ title, description, color = SlickBotColors.PRIMARY, footer = 'SlickBot Control Panel' }) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || null)
    .setFooter({ text: footer })
    .setTimestamp(new Date());
}

function createSuccessEmbed(title, description) {
  return createBaseEmbed({ title, description, color: SlickBotColors.SUCCESS });
}

function createWarningEmbed(title, description) {
  return createBaseEmbed({ title, description, color: SlickBotColors.WARNING });
}

function createErrorEmbed(title, description) {
  return createBaseEmbed({ title, description, color: SlickBotColors.ERROR });
}

function createInfoEmbed(title, description) {
  return createBaseEmbed({ title, description, color: SlickBotColors.INFO });
}

function createButtonRow(buttons) {
  return new ActionRowBuilder().addComponents(buttons);
}

function createPanelButton(customId, label, style = ButtonStyle.Secondary, emoji = undefined) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);

  if (emoji) button.setEmoji(emoji);
  return button;
}

function createLinkButton(url, label, emoji = undefined) {
  const button = new ButtonBuilder()
    .setURL(url)
    .setLabel(label)
    .setStyle(ButtonStyle.Link);

  if (emoji) button.setEmoji(emoji);
  return button;
}

function createSelectRow(customId, placeholder, options, minValues = 1, maxValues = 1) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(minValues)
      .setMaxValues(maxValues)
      .addOptions(options)
  );
}


function normalizePanelHeaderImageUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) return null;
  if (text.length > 1800) return null;
  return text;
}

function withPanelHeaderImage(payload, headerImageUrl) {
  const normalized = normalizePanelHeaderImageUrl(headerImageUrl);
  if (!normalized) return payload;
  const existingContent = payload?.content ? String(payload.content) : '';
  return {
    ...payload,
    content: existingContent ? `${normalized}\n${existingContent}` : normalized
  };
}

function formatEnabled(enabled) {
  return enabled ? 'Enabled' : 'Disabled';
}

function formatStatusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'online') return 'Online';
  if (normalized === 'idle') return 'Idle';
  if (normalized === 'dnd') return 'Do Not Disturb';
  if (normalized === 'invisible') return 'Invisible';
  return 'Unknown';
}

module.exports = {
  SlickBotColors,
  createBaseEmbed,
  createSuccessEmbed,
  createWarningEmbed,
  createErrorEmbed,
  createInfoEmbed,
  createButtonRow,
  createPanelButton,
  createLinkButton,
  createSelectRow,
  normalizePanelHeaderImageUrl,
  withPanelHeaderImage,
  formatEnabled,
  formatStatusBadge,
  ButtonStyle
};
