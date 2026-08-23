const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const {
  createBaseEmbed,
  createSuccessEmbed,
  createWarningEmbed,
  createErrorEmbed,
  SlickBotColors
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { truncate } = require('../../utils/format');
const { AutoModService, AUTOMOD_PRESETS, RULE_KEYS } = require('./autoModService');

const autoMod = new AutoModService();

function formatAction(action) {
  const norm = String(action || '').toUpperCase();
  if (norm === 'WARN') return 'Warn & Delete';
  if (norm === 'DELETE') return 'Delete';
  if (norm === 'TIMEOUT') return 'Timeout';
  if (norm === 'LOG_ONLY') return 'Log Only';
  return action || 'Delete';
}

// --- 1-Click Setup Wizard ---

async function buildAutoModWizard(guildId) {
  const config = await autoMod.getConfig(guildId);

  const embed = createBaseEmbed({
    title: '🛡️ Auto-Mod & Anti-Raid Setup Wizard',
    description: 'Welcome to SlickBot Auto-Mod! Choose a 1-click protection preset below, or jump into the interactive Control Center for custom rule-by-rule tuning.\n\nAll settings and punishments are 100% configurable at any time.',
    color: SlickBotColors.PRIMARY
  }).addFields(
    {
      name: '🛡️ Balanced (Recommended)',
      value: '• Anti-Invites, Phishing Link Blacklist, Anti-Spam (5 msgs/4s), Duplicate Filter, Mass Pings (5), Zalgo Filter, and Anti-Raid Shield (8 joins/10s).\n• **Action:** Delete & Warn offenders.',
      inline: false
    },
    {
      name: '🔒 Strict Security',
      value: '• Maximum protection: Blocks all external URLs (except approved domains), Caps spam (>65%), Emoji clutter, 5-minute Timeouts, and strict 48h new account age gates.',
      inline: false
    },
    {
      name: '⚡ Anti-Spam & Phishing Only',
      value: '• Lightweight baseline: Blocks rapid chat floods, repetitive duplicate text, known scam links, and join raids without touching normal casual chat.',
      inline: false
    }
  );

  const presetRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModPresetPrefix}BALANCED`)
      .setLabel('Apply Balanced Preset')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModPresetPrefix}STRICT`)
      .setLabel('Apply Strict Preset')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModPresetPrefix}LIGHTWEIGHT`)
      .setLabel('Apply Anti-Spam Only')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Primary)
  );

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CustomIds.AutoModManager)
      .setLabel('Open Control Center')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CustomIds.SetupCategoryCore)
      .setLabel('Core Setup')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CustomIds.SetupRefresh)
      .setLabel('Setup Center')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CustomIds.AutoModRefresh)
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [presetRow, controlRow] };
}

// --- Interactive Manager Panel & Control Center ---

async function buildAutoModManagerPanel(guildId, tab = 'FILTERS', selectedRuleKey = null) {
  const config = await autoMod.getConfig(guildId);
  const blacklists = await autoMod.getBlacklist(guildId);

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModTabPrefix}FILTERS`)
      .setLabel('Filter Rules')
      .setEmoji('🛡️')
      .setStyle(tab === 'FILTERS' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModTabPrefix}TIMEOUT`)
      .setLabel('Timeout Role')
      .setEmoji('⏳')
      .setStyle(tab === 'TIMEOUT' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModTabPrefix}BLACKLIST`)
      .setLabel(`Blacklist (${blacklists.length})`)
      .setEmoji('🚫')
      .setStyle(tab === 'BLACKLIST' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModTabPrefix}WHITELIST`)
      .setLabel('Exemptions')
      .setEmoji('🌐')
      .setStyle(tab === 'WHITELIST' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModTabPrefix}RAID`)
      .setLabel('Anti-Raid Shield')
      .setEmoji('🚨')
      .setStyle(tab === 'RAID' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  // --- TAB: TIMEOUT ROLE ---
  if (tab === 'TIMEOUT') {
    const roleDisplay = config.timeout_role_id ? `<@&${config.timeout_role_id}>` : '_None configured_';
    const modeDisplay = (config.timeout_role_mode || 'HIDE') === 'HIDE' ? '🔒 **Hide Channels**' : '🔇 **Mute Only**';
    const autoLockDisplay = config.timeout_role_lock_new_channels !== false ? '`🟢 Enabled`' : '`🔴 Disabled`';
    const exemptChannels = (config.timeout_role_exempt_channel_ids || []).map((c) => `<#${c}>`).join(', ') || 'None';

    const embed = createBaseEmbed({
      title: '⏳ Timeout Role & Server Restriction System',
      description: 'Configure a dedicated server role applied to timed-out members. Restricts channel access while automatically preserving access to the Appeals channel and active support tickets.',
      color: SlickBotColors.PRIMARY
    }).addFields(
      { name: 'Assigned Timeout Role', value: roleDisplay, inline: true },
      { name: 'Restriction Mode', value: modeDisplay, inline: true },
      { name: 'Auto-Lock Future Channels', value: autoLockDisplay, inline: true },
      { name: 'Exempt Channels', value: `${exemptChannels}\n_(Appeals channel and Support Tickets are always automatically exempt)_`, inline: false }
    );

    const rolePickerRow = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(CustomIds.AutoModTimeoutRoleSelect)
        .setPlaceholder('Select an existing Timeout / Muted role...')
        .setMinValues(0)
        .setMaxValues(1)
    );

    const exemptChannelPickerRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(CustomIds.AutoModTimeoutRoleExemptSelect)
        .setPlaceholder('Select additional exempt channels (up to 10)...')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(10)
    );

    const actionButtonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModTimeoutRoleCreate)
        .setLabel('Auto-Create @Timeout')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModTimeoutRoleSync)
        .setLabel('Sync Channels')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModTimeoutRoleModeToggle)
        .setLabel((config.timeout_role_mode || 'HIDE') === 'HIDE' ? 'Switch: Mute Only' : 'Switch: Hide Channels')
        .setEmoji('👁️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModTimeoutRoleLockToggle)
        .setLabel(config.timeout_role_lock_new_channels !== false ? 'Auto-Lock: ON' : 'Auto-Lock: OFF')
        .setEmoji('🛡️')
        .setStyle(config.timeout_role_lock_new_channels !== false ? ButtonStyle.Secondary : ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModTimeoutRoleClear)
        .setLabel('Clear Role')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [navRow, rolePickerRow, exemptChannelPickerRow, actionButtonRow] };
  }

  // --- TAB: BLACKLIST ---
  if (tab === 'BLACKLIST') {
    const customList = blacklists.length
      ? blacklists.slice(0, 15).map((b, i) => `${i + 1}. \`${b.pattern}\` [${b.match_type}] ➔ \`${b.severity}\``).join('\n')
      : '_No custom blacklist entries configured._';

    const embed = createBaseEmbed({
      title: '🚫 Auto-Mod Blacklist Manager',
      description: `Manage prohibited words, wildcards, and custom regular expressions.\n\n**Built-in Scam & Phishing Filter:** ${config.default_blacklist_enabled ? '`🟢 Active`' : '`🔴 Disabled`'}\nIncludes known free nitro, steam phishing, and IP logger links.\n\n**Custom Blacklist Patterns (${blacklists.length}):**\n${customList}`,
      color: SlickBotColors.PRIMARY
    });

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModBlacklistAddModal)
        .setLabel('Add Blacklist Word')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModToggleRulePrefix}default_blacklist`)
        .setLabel(config.default_blacklist_enabled ? 'Disable Built-in Filter' : 'Enable Built-in Filter')
        .setEmoji('🛡️')
        .setStyle(config.default_blacklist_enabled ? ButtonStyle.Danger : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupCategoryCore)
        .setLabel('Core Setup')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupRefresh)
        .setLabel('Setup Center')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModRefresh)
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [navRow, actionRow] };
  }

  // --- TAB: WHITELIST / EXEMPTIONS ---
  if (tab === 'WHITELIST') {
    const roles = (config.exempt_roles || []).map((r) => `<@&${r}>`).join(', ') || 'None';
    const channels = (config.exempt_channels || []).map((c) => `<#${c}>`).join(', ') || 'None';
    const domains = (config.whitelisted_domains || []).map((d) => `\`${d}\``).join(', ') || 'None';

    const embed = createBaseEmbed({
      title: '🌐 Auto-Mod Exemptions & Whitelists',
      description: 'Users with Admin/Manage Server permissions are always exempt.\nSelect roles or channels from the dropdowns below to instantly toggle exemptions.',
      color: SlickBotColors.PRIMARY
    }).addFields(
      { name: 'Exempt Roles', value: roles, inline: false },
      { name: 'Exempt Channels', value: channels, inline: false },
      { name: 'Whitelisted External Domains', value: domains, inline: false }
    );

    const rolePickerRow = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(CustomIds.AutoModRoleExemptSelect)
        .setPlaceholder('Select bypass roles (up to 10)...')
        .setMinValues(0)
        .setMaxValues(10)
    );

    const channelPickerRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(CustomIds.AutoModChannelExemptSelect)
        .setPlaceholder('Select bypass channels (e.g. #media, #bot-commands)...')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(10)
    );

    const domainButtonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModDomainAddModal)
        .setLabel('Add Whitelisted Domain')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupCategoryCore)
        .setLabel('Core Setup')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupRefresh)
        .setLabel('Setup Center')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModRefresh)
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [navRow, rolePickerRow, channelPickerRow, domainButtonRow] };
  }

  // --- TAB: RAID SHIELD ---
  if (tab === 'RAID') {
    const embed = createBaseEmbed({
      title: '🚨 Anti-Raid & Join Burst Shield',
      description: 'Monitors member join velocity in real time and alerts staff with an emergency lockdown prompt if an organized raid is detected.',
      color: SlickBotColors.PRIMARY
    }).addFields(
      { name: 'Raid Shield Status', value: config.raid_shield_enabled ? '`🟢 Active`' : '`🔴 Disabled`', inline: true },
      { name: 'Surge Trigger', value: `**${config.raid_join_threshold || 8} joins** in **${config.raid_join_seconds || 10}s**`, inline: true },
      { name: 'New Account Age Gate', value: `**${config.raid_min_account_age_hours || 24} hours**`, inline: true },
      { name: 'Alert Channel', value: config.raid_alert_channel_id ? `<#${config.raid_alert_channel_id}>` : '_Default Mod Log Channel_', inline: true },
      { name: 'Staff Action Policy', value: 'Dispatches emergency alert with interactive **"Enact Emergency Lockdown"** button for moderator confirmation.', inline: false }
    );

    const channelSelectRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(CustomIds.AutoModRaidChannelSelect)
        .setPlaceholder('Select emergency staff alert channel...')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1)
    );

    const sensitivitySelectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(CustomIds.AutoModRaidSensitivitySelect)
        .setPlaceholder('Select join surge sensitivity threshold...')
        .addOptions([
          { label: 'High Sensitivity (5 joins in 5s)', value: '5:5', description: 'Strict protection for high-risk raid surges', default: config.raid_join_threshold === 5 && config.raid_join_seconds === 5 },
          { label: 'Normal Sensitivity (8 joins in 10s - Recommended)', value: '8:10', description: 'Standard balanced detection for most servers', default: config.raid_join_threshold === 8 && config.raid_join_seconds === 10 },
          { label: 'Relaxed Sensitivity (15 joins in 15s)', value: '15:15', description: 'Permissive threshold for large public communities', default: config.raid_join_threshold === 15 && config.raid_join_seconds === 15 }
        ])
    );

    const ageSelectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(CustomIds.AutoModRaidAgeSelect)
        .setPlaceholder('Select new account age gate...')
        .addOptions([
          { label: 'No Age Gate (Disabled)', value: '0', description: 'Do not flag account age' },
          { label: '1 Hour', value: '1', description: 'Flag accounts created in the past hour' },
          { label: '12 Hours', value: '12', description: 'Flag accounts created in the past 12 hours' },
          { label: '24 Hours (Recommended)', value: '24', description: 'Flag accounts created in the past 24 hours', default: config.raid_min_account_age_hours === 24 },
          { label: '3 Days', value: '72', description: 'Flag accounts created in the past 3 days' },
          { label: '7 Days', value: '168', description: 'Flag accounts created in the past 7 days' }
        ])
    );

    const raidButtonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModRaidShieldToggle)
        .setLabel(config.raid_shield_enabled ? 'Disable Raid Shield' : 'Enable Raid Shield')
        .setEmoji('🚨')
        .setStyle(config.raid_shield_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupCategoryCore)
        .setLabel('Core Setup')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupRefresh)
        .setLabel('Setup Center')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CustomIds.AutoModRefresh)
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [navRow, channelSelectRow, sensitivitySelectRow, ageSelectRow, raidButtonRow] };
  }

  // --- TAB: FILTERS (Default) ---
  const hasTimeoutRole = Boolean(config.timeout_role_id);
  const timeoutDisplay = hasTimeoutRole ? `<@&${config.timeout_role_id}> (${config.timeout_role_mode === 'MUTE_ONLY' ? 'Mute Only' : 'Hide Channels'})` : '🟠 _Not Configured_';
  const alertDisplay = config.raid_alert_channel_id ? `<#${config.raid_alert_channel_id}>` : (config.alert_channel_id ? `<#${config.alert_channel_id}>` : '🟠 _Not Configured_');

  const embed = createBaseEmbed({
    title: '🛡️ Auto-Mod Protection Engine',
    description: [
      `System Master Status: ${config.enabled ? '`🟢 Active`' : '`🔴 Paused`'}`,
      !hasTimeoutRole ? '⚠️ **Setup Notice:** A Timeout Role has not been selected. Punishments with timeouts will only apply native Discord timeouts until a role is assigned in the **Timeout Role** tab.' : '',
      'Select any rule from the dropdown below to customize its action or thresholds.'
    ].filter(Boolean).join('\n\n'),
    color: config.enabled && hasTimeoutRole ? SlickBotColors.PRIMARY : SlickBotColors.WARNING
  }).addFields(
    {
      name: 'System Integrations',
      value: `• **Timeout Role:** ${timeoutDisplay}\n• **Raid Alerts:** ${alertDisplay}`,
      inline: false
    },
    {
      name: 'Active Filter Rules',
      value: [
        `• **Anti-Invites:** ${fmt(config.anti_invites_enabled)} [Action: \`${formatAction(config.anti_invites_action)}\`]` ,
        `• **Anti-Links:** ${fmt(config.anti_links_enabled)} [Action: \`${formatAction(config.anti_links_action)}\`]` ,
        `• **Anti-Spam:** ${fmt(config.anti_spam_enabled)} [${config.anti_spam_max_messages} msgs/${config.anti_spam_seconds}s ➔ \`${formatAction(config.anti_spam_action)}\`]` ,
        `• **Anti-Duplicates:** ${fmt(config.anti_duplicates_enabled)} [${config.anti_duplicates_max_count} repeats ➔ \`${formatAction(config.anti_duplicates_action)}\`]` ,
        `• **Anti-Mentions:** ${fmt(config.anti_mentions_enabled)} [Max: ${config.anti_mentions_max_count} pings ➔ \`${formatAction(config.anti_mentions_action)}\`]` ,
        `• **Anti-Caps:** ${fmt(config.anti_caps_enabled)} [Min: ${config.anti_caps_min_chars} chars, >${config.anti_caps_percent}% ➔ \`${formatAction(config.anti_caps_action)}\`]` ,
        `• **Anti-Emojis:** ${fmt(config.anti_emojis_enabled)} [Max: ${config.anti_emojis_max_count} ➔ \`${formatAction(config.anti_emojis_action)}\`]` ,
        `• **Anti-Zalgo:** ${fmt(config.anti_zalgo_enabled)} [Action: \`${formatAction(config.anti_zalgo_action)}\`]` ,
        `• **Phishing Filter:** ${fmt(config.default_blacklist_enabled)} [Action: \`${formatAction(config.word_blacklist_action)}\`]`
      ].join('\n'),
      inline: false
    }
  );

  const ruleSelectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CustomIds.AutoModRuleSelect)
      .setPlaceholder('Select a rule to configure...')
      .addOptions(
        RULE_KEYS.map((r) => ({
          label: r.label,
          value: r.key,
          description: r.description,
          default: selectedRuleKey === r.key
        }))
      )
  );

  // If a rule is selected, render its dedicated tuning controls
  if (selectedRuleKey) {
    const editCard = buildRuleEditComponents(config, selectedRuleKey);
    return { embeds: [embed, editCard.embed], components: [navRow, ruleSelectRow, ...editCard.components] };
  }

  const quickToggleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CustomIds.AutoModSetupWizard)
      .setLabel('Setup Presets')
      .setEmoji('✨')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModToggleRulePrefix}master`)
      .setLabel(config.enabled ? 'Pause Auto-Mod' : 'Resume Auto-Mod')
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CustomIds.SetupCategoryCore)
      .setLabel('Core Setup')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CustomIds.SetupRefresh)
      .setLabel('Setup Center')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CustomIds.AutoModRefresh)
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [navRow, ruleSelectRow, quickToggleRow] };
}

// --- Rule Tuning Sub-Card ---

function buildRuleEditComponents(config, ruleKey) {
  const ruleMeta = RULE_KEYS.find((r) => r.key === ruleKey) || { label: ruleKey, description: '' };
  const isEnabled = ruleKey === 'default_blacklist' ? config.default_blacklist_enabled : config[`${ruleKey}_enabled`];
  const currentAction = ruleKey === 'default_blacklist' ? config.word_blacklist_action : config[`${ruleKey}_action`];
  const displayAction = formatAction(currentAction || 'DELETE');

  const embed = createBaseEmbed({
    title: `⚙️ Rule Settings: ${ruleMeta.label}`,
    description: `${ruleMeta.description}\n\n**Status:** ${isEnabled ? '`🟢 ENABLED`' : '`🔴 DISABLED`'}\n**Current Action:** \`${displayAction}\``,
    color: isEnabled ? SlickBotColors.SUCCESS : SlickBotColors.MUTED
  });

  const toggleAndTuneRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModToggleRulePrefix}${ruleKey}`)
      .setLabel(isEnabled ? 'Disable Rule' : 'Enable Rule')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setEmoji(isEnabled ? '🔴' : '🟢'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModThresholdEditPrefix}${ruleKey}`)
      .setLabel('Tune Limits & Thresholds')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CustomIds.AutoModManager)
      .setLabel('Back to Rules')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CustomIds.SetupRefresh)
      .setLabel('Setup Center')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary)
  );

  const actionSelectRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModSetActionPrefix}${ruleKey}:DELETE`)
      .setLabel('Delete')
      .setStyle(currentAction === 'DELETE' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModSetActionPrefix}${ruleKey}:WARN`)
      .setLabel('Warn & Delete')
      .setStyle(currentAction === 'WARN' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModSetActionPrefix}${ruleKey}:TIMEOUT`)
      .setLabel('Timeout Member')
      .setStyle(currentAction === 'TIMEOUT' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.AutoModSetActionPrefix}${ruleKey}:LOG_ONLY`)
      .setLabel('Log Only')
      .setStyle(currentAction === 'LOG_ONLY' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  return { embed, components: [toggleAndTuneRow, actionSelectRow] };
}

// --- Threshold Tuning Modal Builder ---

function buildThresholdTuneModal(ruleKey, config) {
  const modal = new ModalBuilder()
    .setCustomId(`${CustomIds.AutoModThresholdModalPrefix}${ruleKey}`)
    .setTitle(`Tune Limits: ${ruleKey}`);

  if (ruleKey === 'anti_spam') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('max_messages')
          .setLabel('Max Messages allowed in time window')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.anti_spam_max_messages || 5))
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('seconds')
          .setLabel('Time Window (seconds)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.anti_spam_seconds || 4))
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('timeout_seconds')
          .setLabel('Timeout Duration (seconds)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.anti_spam_timeout_seconds || 60))
          .setRequired(false)
      )
    );
  } else if (ruleKey === 'anti_duplicates') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('max_count')
          .setLabel('Max Repeated Messages allowed')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.anti_duplicates_max_count || 3))
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('seconds')
          .setLabel('Time Window (seconds)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.anti_duplicates_seconds || 10))
          .setRequired(true)
      )
    );
  } else if (ruleKey === 'anti_mentions') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('max_count')
          .setLabel('Max Mentions / Pings allowed')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.anti_mentions_max_count || 5))
          .setRequired(true)
      )
    );
  } else if (ruleKey === 'anti_caps') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('min_chars')
          .setLabel('Min characters before check')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.anti_caps_min_chars || 12))
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('percent')
          .setLabel('Max Uppercase % allowed')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.anti_caps_percent || 70))
          .setRequired(true)
      )
    );
  } else if (ruleKey === 'anti_emojis') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('max_count')
          .setLabel('Max Emojis allowed')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.anti_emojis_max_count || 8))
          .setRequired(true)
      )
    );
  } else {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('timeout_seconds')
          .setLabel('Timeout Duration (seconds)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config[`${ruleKey}_timeout_seconds`] || 60))
          .setRequired(true)
      )
    );
  }

  return modal;
}

// --- Domain Whitelist Modal Builder ---

function buildDomainWhitelistModal() {
  return new ModalBuilder()
    .setCustomId(CustomIds.AutoModDomainAddModal)
    .setTitle('Add Whitelisted Domain')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('domain')
          .setLabel('Domain Name (e.g. youtube.com, twitch.tv)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('youtube.com')
          .setRequired(true)
          .setMaxLength(100)
      )
    );
}

function fmt(bool) {
  return bool ? '`✅ ON`' : '`❌ OFF`';
}

module.exports = {
  buildAutoModWizard,
  buildAutoModManagerPanel,
  buildRuleEditComponents,
  buildThresholdTuneModal,
  buildDomainWhitelistModal
};
