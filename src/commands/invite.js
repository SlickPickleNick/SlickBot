const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { replyPrivate } = require('../utils/reply');
const packageInfo = require('../../package.json');

const RECOMMENDED_PERMISSIONS = '549755813950';
const ADMIN_PERMISSIONS = '8';

function buildInviteUrl(clientId, permissions = RECOMMENDED_PERMISSIONS) {
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;
}

function buildInvitePayload(clientId) {
  const recommendedUrl = buildInviteUrl(clientId, RECOMMENDED_PERMISSIONS);
  const adminUrl = buildInviteUrl(clientId, ADMIN_PERMISSIONS);

  const embed = createBaseEmbed({
    title: 'Invite SlickBot to Your Server 🚀',
    description: [
      `Add **SlickBot v${packageInfo.version}** to your Discord servers with all 29 built-in management, support, moderation, and community modules!`,
      '',
      '**Choose an Invite Option**',
      `• [**Standard / Recommended Permissions**](${recommendedUrl}) — *Granular permissions for moderation, logging, tickets, games, voice, and leveling without global Admin.*`,
      `• [**Administrator Permissions**](${adminUrl}) — *Full server management permissions for quick zero-hassle setup.*`,
      '',
      '**Quickstart After Inviting**',
      '1. Type `/setup` to open the **Interactive Setup Center**.',
      '2. Click **Guided Onboarding** for one-click channel & role creation.',
      '3. Run `/help` anytime to browse all available commands.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: `SlickBot v${packageInfo.version} • Multi-Server Ready`
  });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Invite (Recommended)')
      .setStyle(ButtonStyle.Link)
      .setURL(recommendedUrl)
      .setEmoji('✨'),
    new ButtonBuilder()
      .setLabel('Invite (Admin)')
      .setStyle(ButtonStyle.Link)
      .setURL(adminUrl)
      .setEmoji('🛡️')
  );

  return { embeds: [embed], components: [buttons] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the official SlickBot invite link with setup instructions.'),
  actionKey: ActionKeys.BotInvite,
  moduleKey: ModuleKeys.PERMISSIONS,
  buildInviteUrl,
  buildInvitePayload,
  async execute(interaction) {
    const clientId = interaction.client.user?.id || interaction.applicationId;
    return replyPrivate(interaction, buildInvitePayload(clientId));
  }
};
