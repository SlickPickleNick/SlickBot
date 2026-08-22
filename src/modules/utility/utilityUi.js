const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} = require('discord.js');
const { createBaseEmbed, SlickBotColors, createSuccessEmbed, createWarningEmbed } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { query } = require('../../services/db');
const { UtilityService } = require('./utilityService');

const utility = new UtilityService();

async function buildUtilityManagerPanel(guildId) {
  const config = await utility.getConfig(guildId);

  const [remindersRes, pollsRes, afkRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM utility_reminders WHERE guild_id = $1 AND status = 'PENDING'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM utility_polls WHERE guild_id = $1 AND status = 'OPEN'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM utility_afk_users WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
  ]);

  const activeReminders = remindersRes.rows[0]?.count || 0;
  const activePolls = pollsRes.rows[0]?.count || 0;
  const afkUsers = afkRes.rows[0]?.count || 0;

  const statusBadge = (enabled) => (enabled ? '`🟢 Enabled`' : '`🔴 Disabled`');

  const embed = createBaseEmbed({
    title: '🛠️ Utility Module Manager',
    description: 'Configure server essentials, message moderation tools, community polls, persistent reminders, and member utility commands.',
    color: SlickBotColors.PRIMARY
  }).addFields([
    {
      name: '⚙️ Feature Toggles',
      value: [
        `• **Message Purge:** ${statusBadge(config.purge_enabled)}`,
        `• **Interactive Polls:** ${statusBadge(config.polls_enabled)}`,
        `• **Persistent Reminders:** ${statusBadge(config.reminders_enabled)}`,
        `• **Embed Builder:** ${statusBadge(config.embeds_enabled)}`,
        `• **AFK System:** ${statusBadge(config.afk_enabled)}`,
        `• **Snipe Cache:** ${statusBadge(config.snipe_enabled)}`
      ].join('\n'),
      inline: true
    },
    {
      name: '📊 Active Statistics',
      value: [
        `• **Open Polls:** ${activePolls.toLocaleString()}`,
        `• **Pending Reminders:** ${activeReminders.toLocaleString()}`,
        `• **AFK Members:** ${afkUsers.toLocaleString()}`,
        `• **Max Reminders / User:** ${config.max_reminders_per_user || 10}`,
        config.default_poll_channel_id ? `• **Default Poll Channel:** <#${config.default_poll_channel_id}>` : '• **Default Poll Channel:** `Not Set`'
      ].join('\n'),
      inline: true
    },
    {
      name: '💡 Useful Commands',
      value: [
        '`/purge` — Bulk delete messages with filters',
        '`/userinfo` & `/serverinfo` — Rich profile & guild cards',
        '`/avatar` & `/banner` — High-res avatar/banner links',
        '`/poll create` — Launch interactive voting',
        '`/remind set` — Schedule persistent alerts',
        '`/embed create` — Design & publish formatted embeds',
        '`/afk` — Set status & alert users who ping you',
        '`/snipe` — View recent deleted messages'
      ].join('\n'),
      inline: false
    }
  ]);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CustomIds.UtilitySetupModal)
      .setLabel('Edit Settings')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚙️'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.UtilityToggleFeaturePrefix}purge`)
      .setLabel(config.purge_enabled ? 'Disable Purge' : 'Enable Purge')
      .setStyle(config.purge_enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji('🧹'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.UtilityToggleFeaturePrefix}polls`)
      .setLabel(config.polls_enabled ? 'Disable Polls' : 'Enable Polls')
      .setStyle(config.polls_enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji('📊'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.UtilityToggleFeaturePrefix}reminders`)
      .setLabel(config.reminders_enabled ? 'Disable Reminders' : 'Enable Reminders')
      .setStyle(config.reminders_enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji('⏰')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CustomIds.UtilityToggleFeaturePrefix}afk`)
      .setLabel(config.afk_enabled ? 'Disable AFK' : 'Enable AFK')
      .setStyle(config.afk_enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji('💤'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.UtilityToggleFeaturePrefix}embeds`)
      .setLabel(config.embeds_enabled ? 'Disable Embeds' : 'Enable Embeds')
      .setStyle(config.embeds_enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.UtilityToggleFeaturePrefix}snipe`)
      .setLabel(config.snipe_enabled ? 'Disable Snipe' : 'Enable Snipe')
      .setStyle(config.snipe_enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji('🎯'),
    new ButtonBuilder()
      .setCustomId(CustomIds.UtilityRefresh)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄')
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CustomIds.OnboardingModulePrefix}UTILITY`)
      .setLabel('Quick Setup')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId(CustomIds.SetupCategoryCore)
      .setLabel('Core & Safety')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🛡️'),
    new ButtonBuilder()
      .setCustomId(CustomIds.SetupRefresh)
      .setLabel('Setup Center')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⚙️')
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

function buildUtilitySetupModal(config) {
  const modal = new ModalBuilder()
    .setCustomId(CustomIds.UtilitySetupModal)
    .setTitle('Utility Module Settings');

  const pollChannelInput = new TextInputBuilder()
    .setCustomId('default_poll_channel_id')
    .setLabel('Default Poll Channel ID (Optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 123456789012345678')
    .setValue(config.default_poll_channel_id || '')
    .setRequired(false);

  const maxRemindersInput = new TextInputBuilder()
    .setCustomId('max_reminders_per_user')
    .setLabel('Max Reminders per User (1–50)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('10')
    .setValue(String(config.max_reminders_per_user || 10))
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(pollChannelInput),
    new ActionRowBuilder().addComponents(maxRemindersInput)
  );

  return modal;
}

function buildEmbedComposerModal(existingData = {}) {
  const modal = new ModalBuilder()
    .setCustomId(`${CustomIds.EmbedEditModalPrefix}${existingData.channelId || ''}`)
    .setTitle('Embed Composer');

  const titleInput = new TextInputBuilder()
    .setCustomId('embed_title')
    .setLabel('Embed Title')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Announcement Title')
    .setValue(existingData.title || '')
    .setMaxLength(256)
    .setRequired(false);

  const descInput = new TextInputBuilder()
    .setCustomId('embed_desc')
    .setLabel('Embed Description')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Write your announcement or information here...')
    .setValue(existingData.description || '')
    .setMaxLength(4000)
    .setRequired(true);

  const colorInput = new TextInputBuilder()
    .setCustomId('embed_color')
    .setLabel('Color (Hex code, e.g. #7869ff)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('#7869ff')
    .setValue(existingData.color || '#7869ff')
    .setMaxLength(10)
    .setRequired(false);

  const imageInput = new TextInputBuilder()
    .setCustomId('embed_image')
    .setLabel('Image URL (Optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://example.com/banner.png')
    .setValue(existingData.imageUrl || '')
    .setMaxLength(1000)
    .setRequired(false);

  const thumbnailInput = new TextInputBuilder()
    .setCustomId('embed_thumb')
    .setLabel('Thumbnail URL (Optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://example.com/icon.png')
    .setValue(existingData.thumbnailUrl || '')
    .setMaxLength(1000)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(colorInput),
    new ActionRowBuilder().addComponents(imageInput),
    new ActionRowBuilder().addComponents(thumbnailInput)
  );

  return modal;
}

function buildEmbedFieldModal(channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`${CustomIds.EmbedAddFieldModalPrefix}${channelId || ''}`)
    .setTitle('Add Embed Field');

  const nameInput = new TextInputBuilder()
    .setCustomId('field_name')
    .setLabel('Field Name / Title')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Field Name')
    .setMaxLength(256)
    .setRequired(true);

  const valueInput = new TextInputBuilder()
    .setCustomId('field_value')
    .setLabel('Field Content / Value')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Field Content')
    .setMaxLength(1024)
    .setRequired(true);

  const inlineInput = new TextInputBuilder()
    .setCustomId('field_inline')
    .setLabel('Inline? (yes / no)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('no')
    .setValue('no')
    .setMaxLength(5)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(valueInput),
    new ActionRowBuilder().addComponents(inlineInput)
  );

  return modal;
}

function buildEmbedPreviewPayload(embedData, channelId, rolePingId = null) {
  let color = SlickBotColors.PRIMARY;
  if (embedData.color) {
    const raw = embedData.color.startsWith('#') ? embedData.color.slice(1) : embedData.color;
    const parsed = parseInt(raw, 16);
    if (!isNaN(parsed)) color = parsed;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(embedData.description || 'No description.')
    .setTimestamp();

  if (embedData.title) embed.setTitle(embedData.title);
  if (embedData.imageUrl && /^https?:\/\//i.test(embedData.imageUrl)) embed.setImage(embedData.imageUrl);
  if (embedData.thumbnailUrl && /^https?:\/\//i.test(embedData.thumbnailUrl)) embed.setThumbnail(embedData.thumbnailUrl);

  if (Array.isArray(embedData.fields)) {
    for (const f of embedData.fields.slice(0, 25)) {
      embed.addFields([{ name: f.name, value: f.value, inline: Boolean(f.inline) }]);
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CustomIds.EmbedSendPrefix}${channelId}${rolePingId ? `:${rolePingId}` : ''}`)
      .setLabel('Send Embed')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.EmbedEditBtnPrefix}${channelId}`)
      .setLabel('Edit Content')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✏️'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.EmbedAddFieldBtnPrefix}${channelId}`)
      .setLabel('Add Field')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('➕'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.EmbedCancelPrefix}${channelId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('✖️')
  );

  const previewNotice = new EmbedBuilder()
    .setColor(SlickBotColors.INFO)
    .setTitle('📝 Embed Composer Preview')
    .setDescription(`Destination Channel: <#${channelId}>\n${rolePingId ? `Role Ping: <@&${rolePingId}>\n` : ''}Click **Send Embed** when ready to publish.`);

  return { embeds: [previewNotice, embed], components: [row] };
}

module.exports = {
  buildUtilityManagerPanel,
  buildUtilitySetupModal,
  buildEmbedComposerModal,
  buildEmbedFieldModal,
  buildEmbedPreviewPayload
};
