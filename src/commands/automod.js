const { SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { AutoModService } = require('../modules/moderation/autoModService');
const { createSuccessEmbed, createWarningEmbed, createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { CustomIds } = require('../modules/ui/customIds');
const { replyPrivate } = require('../utils/reply');

const autoMod = new AutoModService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Automated moderation, content filters, and anti-raid protection shield.')
    .addSubcommand((sub) => sub.setName('manager').setDescription('Open the interactive Auto-Mod manager dashboard.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('View current Auto-Mod protection status and active filters.'))
    .addSubcommand((sub) =>
      sub
        .setName('rule')
        .setDescription('Configure a specific Auto-Mod filter rule.')
        .addStringOption((opt) =>
          opt
            .setName('filter')
            .setDescription('Select the filter rule to configure.')
            .setRequired(true)
            .addChoices(
              { name: 'Anti-Invites (Discord invite links)', value: 'anti_invites' },
              { name: 'Anti-Links (External website URLs)', value: 'anti_links' },
              { name: 'Anti-Spam (Rapid message flooding)', value: 'anti_spam' },
              { name: 'Anti-Duplicates (Repeated messages)', value: 'anti_duplicates' },
              { name: 'Anti-Mentions (Mass pings)', value: 'anti_mentions' },
              { name: 'Anti-Caps (Excessive capitalization)', value: 'anti_caps' },
              { name: 'Anti-Emojis (Emoji spam)', value: 'anti_emojis' },
              { name: 'Anti-Zalgo (Glitch text formatting)', value: 'anti_zalgo' },
              { name: 'Default Blacklist (Scam/phishing filter)', value: 'default_blacklist' }
            )
        )
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable or disable this rule.').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('Action to take when this rule is violated.')
            .setRequired(false)
            .addChoices(
              { name: 'Delete Message', value: 'DELETE' },
              { name: 'Warn User & Delete', value: 'WARN' },
              { name: 'Timeout Member & Delete', value: 'TIMEOUT' },
              { name: 'Log Only (No Deletion)', value: 'LOG_ONLY' }
            )
        )
        .addIntegerOption((opt) => opt.setName('threshold').setDescription('Numeric trigger threshold (e.g. max mentions, spam count).').setRequired(false).setMinValue(1).setMaxValue(100))
        .addIntegerOption((opt) => opt.setName('timeout_seconds').setDescription('Timeout duration in seconds (if action is TIMEOUT).').setRequired(false).setMinValue(10).setMaxValue(86400))
    )
    .addSubcommand((sub) =>
      sub
        .setName('blacklist-add')
        .setDescription('Add a banned word, wildcard, or regex pattern.')
        .addStringOption((opt) => opt.setName('pattern').setDescription('Word, wildcard (*term*), or regex to block.').setRequired(true).setMaxLength(100))
        .addStringOption((opt) =>
          opt
            .setName('match_type')
            .setDescription('Matching style.')
            .setRequired(false)
            .addChoices(
              { name: 'Exact Word Match (default)', value: 'WORD' },
              { name: 'Wildcard Substring', value: 'WILDCARD' },
              { name: 'Regular Expression', value: 'REGEX' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('Punishment action.')
            .setRequired(false)
            .addChoices(
              { name: 'Delete Message', value: 'DELETE' },
              { name: 'Warn User & Delete', value: 'WARN' },
              { name: 'Timeout Member & Delete', value: 'TIMEOUT' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('blacklist-remove')
        .setDescription('Remove a pattern from the blacklist.')
        .addStringOption((opt) => opt.setName('pattern').setDescription('Word or pattern to remove.').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('blacklist-list').setDescription('List all active custom blacklist patterns.'))
    .addSubcommand((sub) =>
      sub
        .setName('whitelist-add')
        .setDescription('Add an exemption (role, channel, user, or domain).')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Type of exemption.')
            .setRequired(true)
            .addChoices(
              { name: 'Role Exemption', value: 'ROLE' },
              { name: 'Channel Exemption', value: 'CHANNEL' },
              { name: 'User Exemption', value: 'USER' },
              { name: 'Domain Whitelist (e.g. twitch.tv)', value: 'DOMAIN' },
              { name: 'Invite Code Whitelist', value: 'INVITE' }
            )
        )
        .addStringOption((opt) => opt.setName('value').setDescription('Role ID/mention, Channel ID/mention, User ID, or domain name.').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('whitelist-remove')
        .setDescription('Remove an exemption.')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Type of exemption.')
            .setRequired(true)
            .addChoices(
              { name: 'Role Exemption', value: 'ROLE' },
              { name: 'Channel Exemption', value: 'CHANNEL' },
              { name: 'User Exemption', value: 'USER' },
              { name: 'Domain Whitelist', value: 'DOMAIN' },
              { name: 'Invite Code Whitelist', value: 'INVITE' }
            )
        )
        .addStringOption((opt) => opt.setName('value').setDescription('Value to remove.').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('raid')
        .setDescription('Configure the Anti-Raid join velocity shield.')
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Enable or disable Anti-Raid monitoring.').setRequired(false))
        .addIntegerOption((opt) => opt.setName('join_threshold').setDescription('Number of joins to trigger an alert (default: 8).').setRequired(false).setMinValue(3).setMaxValue(50))
        .addIntegerOption((opt) => opt.setName('join_seconds').setDescription('Time window in seconds (default: 10).').setRequired(false).setMinValue(3).setMaxValue(60))
        .addIntegerOption((opt) => opt.setName('min_account_age_hours').setDescription('Flag accounts younger than this age (default: 24h).').setRequired(false).setMinValue(1).setMaxValue(720))
        .addChannelOption((opt) => opt.setName('alert_channel').setDescription('Channel to dispatch emergency staff raid alerts.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
    )
    .addSubcommand((sub) => sub.setName('reset').setDescription('Reset all Auto-Mod configurations to server defaults.')),

  moduleKey: ModuleKeys.AUTOMOD,

  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') return ActionKeys.AutoModView;
    if (sub === 'manager' || sub === 'rule') return ActionKeys.AutoModManage;
    if (sub.startsWith('blacklist')) return ActionKeys.AutoModBlacklist;
    if (sub.startsWith('whitelist')) return ActionKeys.AutoModWhitelist;
    if (sub === 'raid') return ActionKeys.AutoModRaid;
    if (sub === 'reset') return ActionKeys.AutoModReset;
    return ActionKeys.AutoModManage;
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'manager') {
      const panel = await autoMod.buildManagerPanel(guildId, 'FILTERS');
      return replyPrivate(interaction, panel);
    }

    if (sub === 'status') {
      const panel = await autoMod.buildManagerPanel(guildId, 'FILTERS');
      return replyPrivate(interaction, panel);
    }

    if (sub === 'rule') {
      const filter = interaction.options.getString('filter', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      const action = interaction.options.getString('action');
      const threshold = interaction.options.getInteger('threshold');
      const timeoutSec = interaction.options.getInteger('timeout_seconds');

      const updates = {};
      if (filter === 'default_blacklist') {
        updates.default_blacklist_enabled = enabled;
        if (action) updates.word_blacklist_action = action;
        if (timeoutSec) updates.word_blacklist_timeout_seconds = timeoutSec;
      } else {
        updates[`${filter}_enabled`] = enabled;
        if (action) updates[`${filter}_action`] = action;
        if (timeoutSec) updates[`${filter}_timeout_seconds`] = timeoutSec;

        if (threshold) {
          if (filter === 'anti_spam') updates.anti_spam_max_messages = threshold;
          if (filter === 'anti_duplicates') updates.anti_duplicates_max_count = threshold;
          if (filter === 'anti_mentions') updates.anti_mentions_max_count = threshold;
          if (filter === 'anti_caps') updates.anti_caps_percent = threshold;
          if (filter === 'anti_emojis') updates.anti_emojis_max_count = threshold;
        }
      }

      await autoMod.upsertConfig(guildId, updates);
      return replyPrivate(interaction, {
        embeds: [
          createSuccessEmbed(
            'Auto-Mod Rule Updated',
            `Successfully updated **${filter}** to ${enabled ? '`ENABLED`' : '`DISABLED`'}${action ? ` with action \`${action}\`` : ''}.`
          )
        ]
      });
    }

    if (sub === 'blacklist-add') {
      const pattern = interaction.options.getString('pattern', true);
      const matchType = interaction.options.getString('match_type') || 'WORD';
      const severity = interaction.options.getString('action') || 'DELETE';

      const result = await autoMod.addBlacklistEntry(guildId, pattern, matchType, severity, interaction.user.id);
      if (!result.ok) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Add Failed', result.reason || 'Could not add pattern.')] });
      }

      return replyPrivate(interaction, {
        embeds: [
          createSuccessEmbed(
            'Blacklist Pattern Added',
            `Added \`${pattern}\` [${matchType}] with action \`${severity}\` to the server blacklist.`
          )
        ]
      });
    }

    if (sub === 'blacklist-remove') {
      const pattern = interaction.options.getString('pattern', true);
      const result = await autoMod.removeBlacklistEntry(guildId, pattern);
      if (!result.ok || result.count === 0) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Not Found', `No blacklist entry matching \`${pattern}\` was found.`)] });
      }

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Blacklist Entry Removed', `Successfully removed \`${pattern}\` from the blacklist.`)]
      });
    }

    if (sub === 'blacklist-list') {
      const blacklists = await autoMod.getBlacklist(guildId);
      const config = await autoMod.getConfig(guildId);

      const customList = blacklists.length
        ? blacklists.map((b, i) => `${i + 1}. \`${b.pattern}\` [${b.match_type}] ➔ \`${b.severity}\``).join('\n')
        : '_No custom blacklist entries configured._';

      const embed = createBaseEmbed({
        title: '🚫 Auto-Mod Blacklist Catalog',
        description: `**Built-in Phishing Filter:** ${config.default_blacklist_enabled ? '`🟢 Enabled`' : '`🔴 Disabled`'}\n\n**Custom Server Patterns (${blacklists.length}):**\n${customList}`,
        color: SlickBotColors.PRIMARY
      });

      return replyPrivate(interaction, { embeds: [embed] });
    }

    if (sub === 'whitelist-add') {
      const category = interaction.options.getString('category', true);
      const rawValue = interaction.options.getString('value', true);
      const cleanValue = rawValue.replace(/[<@&#>]/g, '').trim();

      const result = await autoMod.addWhitelistItem(guildId, category, cleanValue);
      if (!result.ok) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Whitelist Failed', result.reason || 'Could not add item.')] });
      }

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Exemption Added', `Successfully added \`${cleanValue}\` to **${category}** exemptions.`)]
      });
    }

    if (sub === 'whitelist-remove') {
      const category = interaction.options.getString('category', true);
      const rawValue = interaction.options.getString('value', true);
      const cleanValue = rawValue.replace(/[<@&#>]/g, '').trim();

      const result = await autoMod.removeWhitelistItem(guildId, category, cleanValue);
      if (!result.ok) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Removal Failed', result.reason || 'Could not remove item.')] });
      }

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Exemption Removed', `Successfully removed \`${cleanValue}\` from **${category}** exemptions.`)]
      });
    }

    if (sub === 'raid') {
      const enabled = interaction.options.getBoolean('enabled');
      const joinThreshold = interaction.options.getInteger('join_threshold');
      const joinSeconds = interaction.options.getInteger('join_seconds');
      const minAge = interaction.options.getInteger('min_account_age_hours');
      const alertChannel = interaction.options.getChannel('alert_channel');

      const updates = {};
      if (typeof enabled === 'boolean') updates.raid_shield_enabled = enabled;
      if (joinThreshold) updates.raid_join_threshold = joinThreshold;
      if (joinSeconds) updates.raid_join_seconds = joinSeconds;
      if (minAge) updates.raid_min_account_age_hours = minAge;
      if (alertChannel) updates.raid_alert_channel_id = alertChannel.id;

      const saved = await autoMod.upsertConfig(guildId, updates);
      return replyPrivate(interaction, {
        embeds: [
          createSuccessEmbed(
            'Anti-Raid Shield Configured',
            `Raid Shield: ${saved.raid_shield_enabled ? '`ENABLED`' : '`DISABLED`'}\nSurge Trigger: **${saved.raid_join_threshold} joins** in **${saved.raid_join_seconds}s**\nAccount Age Gate: **${saved.raid_min_account_age_hours}h**\nAlert Channel: ${saved.raid_alert_channel_id ? `<#${saved.raid_alert_channel_id}>` : '_Default Mod Log_'}`
          )
        ]
      });
    }

    if (sub === 'reset') {
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CustomIds.AutoModResetConfirmPrefix}${interaction.user.id}`)
          .setLabel('Confirm Auto-Mod Reset')
          .setEmoji('⚠️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${CustomIds.AutoModResetCancelPrefix}${interaction.user.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      return replyPrivate(interaction, {
        embeds: [
          createWarningEmbed(
            'Reset Auto-Mod Protection?',
            'This will clear all filter settings, custom blacklists, and exemptions back to default values.'
          )
        ],
        components: [confirmRow]
      });
    }
  }
};
