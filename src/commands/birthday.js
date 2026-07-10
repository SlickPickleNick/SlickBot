const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { recordPublishedPanel } = require('../modules/panels/publishedPanelService');
const {
  BirthdayService,
  birthdaySavedEmbed,
  birthdayNotFoundEmbed,
  formatBirthday,
  timezoneChoicesForAutocomplete,
  MONTH_NAMES
} = require('../modules/community/birthdayService');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');

const birthdays = new BirthdayService();

function addTimezoneOption(option, description = 'Timezone, such as America/New_York.') {
  return option
    .setName('timezone')
    .setDescription(description)
    .setRequired(false)
    .setMaxLength(64)
    .setAutocomplete(true);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Manage birthday tracking and birthday announcements.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('manager')
        .setDescription('Open the birthday manager panel.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure birthday announcements and birthday role behavior.')
        .addChannelOption((option) => option.setName('channel').setDescription('Birthday announcement channel.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addRoleOption((option) => option.setName('birthday_role').setDescription('Role to add while it is a user\'s birthday.').setRequired(false))
        .addStringOption((option) => option.setName('message').setDescription('Announcement template. Supports {user}, {username}, {server}, {date}.').setRequired(false).setMaxLength(1500))
        .addStringOption((option) => addTimezoneOption(option, 'Default timezone. Start typing ET, EST, Pacific, UTC, etc.'))
        .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable birthday automation.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Save your birthday.')
        .addIntegerOption((option) => option.setName('month').setDescription('Birthday month.').setRequired(true).setMinValue(1).setMaxValue(12).addChoices(...MONTH_NAMES.slice(1).map((name, index) => ({ name, value: index + 1 }))))
        .addIntegerOption((option) => option.setName('day').setDescription('Birthday day.').setRequired(true).setMinValue(1).setMaxValue(31))
        .addStringOption((option) => addTimezoneOption(option, 'Optional timezone. Start typing ET, EST, Pacific, UTC, etc.'))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Post a public birthday setup panel.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the birthday panel in.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('test')
        .setDescription('Send a test birthday announcement without changing roles.')
        .addUserOption((option) => option.setName('user').setDescription('User to use for the test. Defaults to yourself.').setRequired(false))
        .addChannelOption((option) => option.setName('channel').setDescription('Test channel. Defaults to configured birthday channel.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('View a saved birthday.')
        .addUserOption((option) => option.setName('user').setDescription('User to view. Defaults to yourself.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove your saved birthday.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Open an interactive birthday list.')
    ),
  moduleKey: ModuleKeys.BIRTHDAYS,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set' || sub === 'view' || sub === 'remove') return ActionKeys.BirthdaysUse;
    if (sub === 'list' || sub === 'manager') return ActionKeys.BirthdaysView;
    return ActionKeys.BirthdaysConfigure;
  },
  isPublic(interaction) {
    const sub = interaction.options.getSubcommand();
    return ['set', 'view', 'remove'].includes(sub);
  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'timezone') {
      await interaction.respond(timezoneChoicesForAutocomplete(focused.value));
    }
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'manager') {
      await replyPrivate(interaction, await birthdays.buildManagerPanel(interaction.guildId));
      return;
    }

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('birthday_role');
      const config = await birthdays.updateConfig(interaction.guildId, {
        channelId: channel?.id || null,
        birthdayRoleId: role?.id || null,
        announcementTemplate: interaction.options.getString('message') || null,
        timezone: interaction.options.getString('timezone') || null,
        enabled: interaction.options.getBoolean('enabled') ?? true
      });
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'birthday-config',
        title: 'Birthday Settings Updated',
        body: `Updated By: <@${interaction.user.id}>\nChannel: ${config.channel_id ? `<#${config.channel_id}>` : 'Not set'}\nRole: ${config.birthday_role_id ? `<@&${config.birthday_role_id}>` : 'Not set'}`,
        actorUserId: interaction.user.id
      }).catch(() => {});
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Birthday Settings Saved', `Birthday automation is **${config.enabled ? 'enabled' : 'disabled'}**. Announcement channel: ${config.channel_id ? `<#${config.channel_id}>` : 'not set'}. Birthday role: ${config.birthday_role_id ? `<@&${config.birthday_role_id}>` : 'not set'}.`)] });
      return;
    }

    if (sub === 'panel') {
      const channel = interaction.options.getChannel('channel', true);
      const payload = await birthdays.buildPublicPanel(interaction.guildId);
      const message = await channel.send(payload);
      await recordPublishedPanel({ guildId: interaction.guildId, panelType: 'birthday', panelRef: '*', channelId: channel.id, messageId: message.id });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'birthday-config', title: 'Birthday Panel Posted', body: `Channel: <#${channel.id}>\nPosted By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Birthday Panel Posted', `Posted the birthday setup panel in <#${channel.id}>.`)] });
      return;
    }

    if (sub === 'test') {
      const user = interaction.options.getUser('user') || interaction.user;
      const channel = interaction.options.getChannel('channel') || null;
      const result = await birthdays.sendTestBirthday({ guild: interaction.guild, channel, user, logger: ctx.logger, actorUserId: interaction.user.id });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Test Failed', result.reason)] });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Birthday Test Sent', `Sent a test birthday announcement to <#${result.channel.id}>.`)] });
      return;
    }

    if (sub === 'set') {
      const result = await birthdays.setBirthday({
        guildId: interaction.guildId,
        user: interaction.user,
        month: interaction.options.getInteger('month', true),
        day: interaction.options.getInteger('day', true),
        timezone: interaction.options.getString('timezone') || null
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Birthday Not Saved', result.reason)] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'birthday-profile', title: 'Birthday Saved', body: `User: <@${interaction.user.id}>\nBirthday: **${formatBirthday(result.profile.birth_month, result.profile.birth_day)}**`, actorUserId: interaction.user.id }).catch(() => {});
      await replyPrivate(interaction, { embeds: [birthdaySavedEmbed(result.profile)], deleteAfterSeconds: 12 });
      return;
    }

    if (sub === 'view') {
      const user = interaction.options.getUser('user') || interaction.user;
      const profile = await birthdays.getBirthday(interaction.guildId, user.id);
      if (!profile) return replyPrivate(interaction, { embeds: [birthdayNotFoundEmbed()], deleteAfterSeconds: 12 });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Birthday Found', `<@${user.id}> has a birthday saved for **${formatBirthday(profile.birth_month, profile.birth_day)}**${profile.timezone ? ` · ${profile.timezone}` : ''}.`)], deleteAfterSeconds: 12 });
      return;
    }

    if (sub === 'remove') {
      const profile = await birthdays.removeBirthday(interaction.guildId, interaction.user.id);
      if (!profile) return replyPrivate(interaction, { embeds: [birthdayNotFoundEmbed()], deleteAfterSeconds: 12 });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'birthday-profile', title: 'Birthday Removed', body: `User: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Birthday Removed', 'Your birthday has been removed from SlickBot.')], deleteAfterSeconds: 12 });
      return;
    }

    if (sub === 'list') {
      await replyPrivate(interaction, await birthdays.buildListPanel(interaction.guildId, 'ALL'));
    }
  }
};
