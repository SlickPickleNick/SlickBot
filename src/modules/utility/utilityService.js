const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, createErrorEmbed, SlickBotColors } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { ActionKeys } = require('../permissions/actionKeys');
const { ModuleKeys } = require('../moduleRegistry');
const { parseDurationToMs } = require('../../utils/time');

const DEFAULT_UTILITY_CONFIG = Object.freeze({
  enabled: true,
  purge_enabled: true,
  polls_enabled: true,
  reminders_enabled: true,
  embeds_enabled: true,
  afk_enabled: true,
  snipe_enabled: true,
  max_reminders_per_user: 10,
  default_poll_channel_id: null,
  afk_ignored_channel_ids: []
});

const snipeCache = new Map(); // channelId -> Array<{ author, content, attachments, createdAt, deletedAt }>

function renderProgressBar(percentage, length = 10) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const fillCount = Math.round((clamped / 100) * length);
  const emptyCount = length - fillCount;
  return `${'█'.repeat(fillCount)}${'░'.repeat(emptyCount)}`;
}

class UtilityService {
  constructor() {
    this.snipeCache = snipeCache;
  }

  async getConfig(guildId) {
    const res = await query(
      `SELECT * FROM utility_configs WHERE guild_id = $1 LIMIT 1`,
      [guildId]
    ).catch(() => ({ rows: [] }));

    if (res.rows.length) {
      const cfg = res.rows[0];
      return {
        ...DEFAULT_UTILITY_CONFIG,
        ...cfg,
        afk_ignored_channel_ids: Array.isArray(cfg.afk_ignored_channel_ids)
          ? cfg.afk_ignored_channel_ids
          : []
      };
    }

    const inserted = await query(
      `INSERT INTO utility_configs (guild_id) VALUES ($1)
       ON CONFLICT (guild_id) DO NOTHING
       RETURNING *`,
      [guildId]
    ).catch(() => ({ rows: [] }));

    return inserted.rows[0] ? { ...DEFAULT_UTILITY_CONFIG, ...inserted.rows[0] } : DEFAULT_UTILITY_CONFIG;
  }

  async upsertConfig(guildId, updates = {}) {
    const current = await this.getConfig(guildId);
    const merged = { ...current, ...updates };

    const res = await query(
      `INSERT INTO utility_configs (
        guild_id, enabled, purge_enabled, polls_enabled, reminders_enabled,
        embeds_enabled, afk_enabled, snipe_enabled, max_reminders_per_user,
        default_poll_channel_id, afk_ignored_channel_ids, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (guild_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        purge_enabled = EXCLUDED.purge_enabled,
        polls_enabled = EXCLUDED.polls_enabled,
        reminders_enabled = EXCLUDED.reminders_enabled,
        embeds_enabled = EXCLUDED.embeds_enabled,
        afk_enabled = EXCLUDED.afk_enabled,
        snipe_enabled = EXCLUDED.snipe_enabled,
        max_reminders_per_user = EXCLUDED.max_reminders_per_user,
        default_poll_channel_id = EXCLUDED.default_poll_channel_id,
        afk_ignored_channel_ids = EXCLUDED.afk_ignored_channel_ids,
        updated_at = NOW()
      RETURNING *`,
      [
        guildId,
        merged.enabled ?? true,
        merged.purge_enabled ?? true,
        merged.polls_enabled ?? true,
        merged.reminders_enabled ?? true,
        merged.embeds_enabled ?? true,
        merged.afk_enabled ?? true,
        merged.snipe_enabled ?? true,
        merged.max_reminders_per_user ?? 10,
        merged.default_poll_channel_id || null,
        JSON.stringify(merged.afk_ignored_channel_ids || [])
      ]
    );

    return res.rows[0] || merged;
  }

  async purgeMessages(channel, {
    amount = 10,
    targetUser = null,
    botsOnly = false,
    humansOnly = false,
    contains = null,
    hasAttachment = false,
    hasLink = false,
    keepPinned = true,
    actorUser = null,
    logger = null
  }) {
    if (!channel || typeof channel.bulkDelete !== 'function') {
      throw new Error('This channel does not support message deletion.');
    }

    const fetchLimit = Math.min(100, Math.max(1, amount < 100 && (targetUser || botsOnly || humansOnly || contains || hasAttachment || hasLink) ? 100 : amount));
    const fetched = await channel.messages.fetch({ limit: fetchLimit });
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    let filtered = Array.from(fetched.values()).filter((msg) => {
      if (msg.createdTimestamp < fourteenDaysAgo) return false;
      if (keepPinned && msg.pinned) return false;
      if (targetUser && msg.author.id !== targetUser.id) return false;
      if (botsOnly && !msg.author.bot) return false;
      if (humansOnly && msg.author.bot) return false;
      if (contains && (!msg.content || !msg.content.toLowerCase().includes(contains.toLowerCase()))) return false;
      if (hasAttachment && (!msg.attachments || msg.attachments.size === 0)) return false;
      if (hasLink && (!msg.content || !/(https?:\/\/[^\s]+)/i.test(msg.content))) return false;
      return true;
    });

    if (filtered.length > amount) {
      filtered = filtered.slice(0, amount);
    }

    if (!filtered.length) {
      return { deletedCount: 0, requested: amount, olderThan14Days: fetched.some((m) => m.createdTimestamp < fourteenDaysAgo) };
    }

    const deleted = await channel.bulkDelete(filtered, true);
    const deletedCount = deleted.size || filtered.length;

    if (logger && channel.guild) {
      const filters = [];
      if (targetUser) filters.push(`User: <@${targetUser.id}>`);
      if (botsOnly) filters.push('Bots Only');
      if (humansOnly) filters.push('Humans Only');
      if (contains) filters.push(`Contains: "${contains}"`);
      if (hasAttachment) filters.push('Has Attachments');
      if (hasLink) filters.push('Has Links');
      if (keepPinned) filters.push('Kept Pinned');

      await logger.log({
        guildId: channel.guild.id,
        eventKey: 'mod_purge',
        title: 'Messages Purged',
        body: [
          `Moderator: <@${actorUser?.id || 'Unknown'}>`,
          `Channel: <#${channel.id}>`,
          `Messages Deleted: **${deletedCount}** (Requested: ${amount})`,
          filters.length ? `Filters Applied: ${filters.join(', ')}` : null
        ].filter(Boolean).join('\n'),
        metadata: {
          actorUserId: actorUser?.id,
          channelId: channel.id,
          deletedCount,
          filters
        }
      }).catch(() => {});
    }

    return {
      deletedCount,
      requested: amount,
      olderThan14Days: fetched.some((m) => m.createdTimestamp < fourteenDaysAgo)
    };
  }

  async generateUserInfoEmbed(guild, targetUser, targetMember = null, ctx = null) {
    const member = targetMember || (guild ? await guild.members.fetch(targetUser.id).catch(() => null) : null);
    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || SlickBotColors.PRIMARY)
      .setTitle(`${targetUser.globalName || targetUser.username} (${targetUser.tag})`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
      .setTimestamp();

    if (targetUser.bannerURL && targetUser.bannerURL()) {
      embed.setImage(targetUser.bannerURL({ dynamic: true, size: 1024 }));
    }

    const createdSec = Math.floor(targetUser.createdTimestamp / 1000);
    const fields = [
      {
        name: '👤 Identity',
        value: [
          `**User ID:** \`${targetUser.id}\``,
          `**Account Created:** <t:${createdSec}:F> (<t:${createdSec}:R>)`,
          `**Bot Account:** ${targetUser.bot ? '🤖 Yes' : 'No'}`
        ].join('\n'),
        inline: false
      }
    ];

    if (member) {
      const joinedSec = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
      const roles = member.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => `<@&${r.id}>`);

      const roleList = roles.length
        ? (roles.length > 12 ? `${roles.slice(0, 12).join(', ')} *+${roles.length - 12} more*` : roles.join(', '))
        : 'None';

      const keyBadges = [];
      if (guild.ownerId === targetUser.id) keyBadges.push('👑 Server Owner');
      if (member.permissions.has(PermissionFlagsBits.Administrator)) keyBadges.push('🛡️ Administrator');
      if (member.premiumSince) keyBadges.push('✨ Server Booster');

      fields.push({
        name: '🏰 Server Membership',
        value: [
          joinedSec ? `**Joined Server:** <t:${joinedSec}:F> (<t:${joinedSec}:R>)` : '**Joined Server:** Unknown',
          `**Highest Role:** ${member.roles.highest.id !== guild.id ? `<@&${member.roles.highest.id}>` : '@everyone'}`,
          keyBadges.length ? `**Badges:** ${keyBadges.join(' · ')}` : null,
          `**Roles (${roles.length}):** ${roleList}`
        ].filter(Boolean).join('\n'),
        inline: false
      });
    }

    if (guild) {
      const [levelRes, achRes, refRes, caseRes, noteRes] = await Promise.all([
        query(`SELECT xp, level, message_count FROM leveling_profiles WHERE guild_id = $1 AND user_id = $2`, [guild.id, targetUser.id]).catch(() => ({ rows: [] })),
        query(`SELECT COUNT(*)::int AS count FROM achievement_unlocks WHERE guild_id = $1 AND user_id = $2`, [guild.id, targetUser.id]).catch(() => ({ rows: [{ count: 0 }] })),
        query(`SELECT COUNT(*)::int AS count FROM referrals WHERE guild_id = $1 AND referrer_user_id = $2`, [guild.id, targetUser.id]).catch(() => ({ rows: [{ count: 0 }] })),
        query(`SELECT COUNT(*)::int AS count FROM moderation_cases WHERE guild_id = $1 AND target_user_id = $2`, [guild.id, targetUser.id]).catch(() => ({ rows: [{ count: 0 }] })),
        query(`SELECT COUNT(*)::int AS count FROM user_notes WHERE guild_id = $1 AND target_user_id = $2`, [guild.id, targetUser.id]).catch(() => ({ rows: [{ count: 0 }] }))
      ]);

      const levelProfile = levelRes.rows[0];
      const achCount = achRes.rows[0]?.count || 0;
      const refCount = refRes.rows[0]?.count || 0;
      const caseCount = caseRes.rows[0]?.count || 0;
      const noteCount = noteRes.rows[0]?.count || 0;

      const stats = [];
      if (levelProfile) {
        stats.push(`📈 **Level:** ${levelProfile.level} (${Number(levelProfile.xp).toLocaleString()} XP · ${levelProfile.message_count} msgs)`);
      }
      if (achCount > 0) {
        stats.push(`🏆 **Achievements:** ${achCount} unlocked`);
      }
      if (refCount > 0) {
        stats.push(`🤝 **Referrals:** ${refCount} invited`);
      }
      if (caseCount > 0 || noteCount > 0) {
        stats.push(`⚖️ **Moderation:** ${caseCount} cases · ${noteCount} notes`);
      }

      if (stats.length) {
        fields.push({
          name: '📊 Server Statistics',
          value: stats.join('\n'),
          inline: false
        });
      }
    }

    embed.addFields(fields);
    return embed;
  }

  async generateServerInfoEmbed(guild) {
    if (!guild) throw new Error('Guild not available.');

    const createdSec = Math.floor(guild.createdTimestamp / 1000);
    const iconUrl = guild.iconURL({ dynamic: true, size: 512 });
    const bannerUrl = guild.bannerURL ? guild.bannerURL({ dynamic: true, size: 1024 }) : null;
    const splashUrl = guild.splashURL ? guild.splashURL({ dynamic: true, size: 1024 }) : null;

    const totalMembers = guild.memberCount || 0;
    const botMembers = guild.members?.cache ? guild.members.cache.filter((m) => m.user.bot).size : 0;
    const humanMembers = Math.max(0, totalMembers - botMembers);

    const textChannels = guild.channels?.cache ? guild.channels.cache.filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).size : 0;
    const voiceChannels = guild.channels?.cache ? guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).size : 0;
    const forumChannels = guild.channels?.cache ? guild.channels.cache.filter((c) => c.type === ChannelType.GuildForum).size : 0;
    const categoryChannels = guild.channels?.cache ? guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size : 0;
    const totalChannels = textChannels + voiceChannels + forumChannels + categoryChannels;

    const rolesCount = guild.roles?.cache ? guild.roles.cache.size - 1 : 0;
    const staticEmojis = guild.emojis?.cache ? guild.emojis.cache.filter((e) => !e.animated).size : 0;
    const animatedEmojis = guild.emojis?.cache ? guild.emojis.cache.filter((e) => e.animated).size : 0;
    const stickersCount = guild.stickers?.cache ? guild.stickers.cache.size : 0;

    const embed = new EmbedBuilder()
      .setColor(SlickBotColors.PRIMARY)
      .setTitle(`🏰 ${guild.name}`)
      .setThumbnail(iconUrl || null)
      .setTimestamp();

    if (bannerUrl || splashUrl) {
      embed.setImage(bannerUrl || splashUrl);
    }

    embed.addFields([
      {
        name: '📌 General Information',
        value: [
          `**Server ID:** \`${guild.id}\``,
          `**Owner:** <@${guild.ownerId}>`,
          `**Created:** <t:${createdSec}:F> (<t:${createdSec}:R>)`,
          `**Verification Level:** ${guild.verificationLevel || 'None'}`,
          guild.vanityURLCode ? `**Vanity URL:** \`.gg/${guild.vanityURLCode}\`` : null
        ].filter(Boolean).join('\n'),
        inline: false
      },
      {
        name: '👥 Members Breakdown',
        value: [
          `**Total Members:** ${totalMembers.toLocaleString()}`,
          `**Humans:** ${humanMembers.toLocaleString()}`,
          `**Bots:** ${botMembers.toLocaleString()}`,
          `**Boost Tier:** Tier ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)`
        ].join('\n'),
        inline: true
      },
      {
        name: '💬 Channels Breakdown',
        value: [
          `**Total Channels:** ${totalChannels}`,
          `**Text / Announcement:** ${textChannels}`,
          `**Voice / Stage:** ${voiceChannels}`,
          `**Forums:** ${forumChannels} · **Categories:** ${categoryChannels}`
        ].join('\n'),
        inline: true
      },
      {
        name: '🎨 Roles & Assets',
        value: [
          `**Roles:** ${rolesCount}`,
          `**Emojis:** ${staticEmojis + animatedEmojis} (${staticEmojis} static, ${animatedEmojis} animated)`,
          `**Stickers:** ${stickersCount}`
        ].join('\n'),
        inline: false
      }
    ]);

    return embed;
  }

  async generateRoleInfoEmbed(guild, role) {
    const createdSec = Math.floor(role.createdTimestamp / 1000);
    const membersCount = role.members ? role.members.size : 0;

    const keyPerms = [];
    if (role.permissions.has(PermissionFlagsBits.Administrator)) keyPerms.push('Administrator');
    if (role.permissions.has(PermissionFlagsBits.ManageGuild)) keyPerms.push('Manage Server');
    if (role.permissions.has(PermissionFlagsBits.BanMembers)) keyPerms.push('Ban Members');
    if (role.permissions.has(PermissionFlagsBits.KickMembers)) keyPerms.push('Kick Members');
    if (role.permissions.has(PermissionFlagsBits.ManageRoles)) keyPerms.push('Manage Roles');
    if (role.permissions.has(PermissionFlagsBits.ManageChannels)) keyPerms.push('Manage Channels');
    if (role.permissions.has(PermissionFlagsBits.MentionEveryone)) keyPerms.push('Mention Everyone');
    if (role.permissions.has(PermissionFlagsBits.ModerateMembers)) keyPerms.push('Timeout Members');

    const embed = new EmbedBuilder()
      .setColor(role.color || SlickBotColors.PRIMARY)
      .setTitle(`🛡️ Role: ${role.name}`)
      .setTimestamp()
      .addFields([
        {
          name: '📌 Details',
          value: [
            `**Role ID:** \`${role.id}\``,
            `**Color:** \`${role.hexColor}\``,
            `**Position:** ${role.position} (of ${guild.roles.cache.size})`,
            `**Members with Role:** ${membersCount.toLocaleString()}`,
            `**Mentionable:** ${role.mentionable ? 'Yes' : 'No'}`,
            `**Hoisted (Displayed Separately):** ${role.hoist ? 'Yes' : 'No'}`,
            `**Managed (Bot/Integration):** ${role.managed ? 'Yes' : 'No'}`,
            `**Created:** <t:${createdSec}:F> (<t:${createdSec}:R>)`
          ].join('\n'),
          inline: false
        },
        {
          name: '🔑 Key Permissions',
          value: keyPerms.length ? keyPerms.join(', ') : 'Standard member permissions',
          inline: false
        }
      ]);

    if (role.iconURL && role.iconURL()) {
      embed.setThumbnail(role.iconURL({ size: 256 }));
    }

    return embed;
  }

  async generateChannelInfoEmbed(guild, channel) {
    const createdSec = Math.floor(channel.createdTimestamp / 1000);
    const embed = new EmbedBuilder()
      .setColor(SlickBotColors.PRIMARY)
      .setTitle(`💬 Channel: #${channel.name}`)
      .setTimestamp();

    const details = [
      `**Channel ID:** \`${channel.id}\``,
      `**Type:** ${ChannelType[channel.type] || 'Unknown'}`,
      channel.parent ? `**Category:** ${channel.parent.name}` : null,
      channel.topic ? `**Topic:** ${channel.topic}` : null,
      channel.rateLimitPerUser ? `**Slowmode:** ${channel.rateLimitPerUser}s` : '**Slowmode:** Disabled',
      `**NSFW:** ${channel.nsfw ? 'Yes' : 'No'}`,
      `**Created:** <t:${createdSec}:F> (<t:${createdSec}:R>)`
    ].filter(Boolean);

    if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
      details.push(`**Bitrate:** ${channel.bitrate / 1000}kbps`);
      details.push(`**User Limit:** ${channel.userLimit ? `${channel.userLimit} users` : 'Unlimited'}`);
    }

    embed.addFields([{ name: '📌 Channel Details', value: details.join('\n'), inline: false }]);
    return embed;
  }

  generateAvatarEmbed(user, member = null) {
    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || SlickBotColors.PRIMARY)
      .setTitle(`🖼️ Avatar: ${user.globalName || user.username}`)
      .setImage(user.displayAvatarURL({ dynamic: true, size: 2048 }))
      .setTimestamp();

    const links = [
      `[PNG](${user.displayAvatarURL({ extension: 'png', size: 2048 })})`,
      `[JPG](${user.displayAvatarURL({ extension: 'jpg', size: 2048 })})`,
      `[WEBP](${user.displayAvatarURL({ extension: 'webp', size: 2048 })})`
    ];

    if (user.avatar?.startsWith('a_')) {
      links.push(`[GIF](${user.displayAvatarURL({ extension: 'gif', size: 2048 })})`);
    }

    let desc = `**Global Avatar Links:** ${links.join(' · ')}`;
    if (member && member.avatar && member.avatar !== user.avatar) {
      const serverLinks = [
        `[PNG](${member.displayAvatarURL({ extension: 'png', size: 2048 })})`,
        `[JPG](${member.displayAvatarURL({ extension: 'jpg', size: 2048 })})`,
        `[WEBP](${member.displayAvatarURL({ extension: 'webp', size: 2048 })})`
      ];
      desc += `\n**Server Avatar Links:** ${serverLinks.join(' · ')}`;
    }

    embed.setDescription(desc);
    return embed;
  }

  generateBannerEmbed(user, guild = null) {
    const bannerUrl = user.bannerURL ? user.bannerURL({ dynamic: true, size: 2048 }) : null;
    const embed = new EmbedBuilder()
      .setColor(user.accentColor || SlickBotColors.PRIMARY)
      .setTitle(`🖼️ Banner: ${user.globalName || user.username}`)
      .setTimestamp();

    if (bannerUrl) {
      embed.setImage(bannerUrl);
      const links = [
        `[PNG](${user.bannerURL({ extension: 'png', size: 2048 })})`,
        `[JPG](${user.bannerURL({ extension: 'jpg', size: 2048 })})`,
        `[WEBP](${user.bannerURL({ extension: 'webp', size: 2048 })})`
      ];
      if (user.banner?.startsWith('a_')) links.push(`[GIF](${user.bannerURL({ extension: 'gif', size: 2048 })})`);
      embed.setDescription(`**Banner Links:** ${links.join(' · ')}`);
    } else if (user.hexAccentColor) {
      embed.setDescription(`This user has no custom banner image. Accent color: \`${user.hexAccentColor}\`.`);
    } else {
      embed.setDescription('This user has no banner configured.');
    }

    return embed;
  }

  // --- POLLS ENGINE ---
  async createPoll(guild, channel, {
    creator,
    question,
    options = [],
    durationMs = null,
    multipleVotes = false,
    anonymous = false,
    inputStyle = 'AUTO'
  }) {
    if (!options.length || options.length > 10) {
      throw new Error('Polls must have between 2 and 10 options.');
    }

    const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;

    const pollRes = await query(
      `INSERT INTO utility_polls (
        guild_id, channel_id, creator_user_id, creator_user_tag,
        question, input_style, multiple_votes, anonymous, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        guild.id,
        channel.id,
        creator.id,
        creator.tag,
        question,
        inputStyle,
        Boolean(multipleVotes),
        Boolean(anonymous),
        expiresAt
      ]
    );

    const poll = pollRes.rows[0];

    const optionRows = [];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const optRes = await query(
        `INSERT INTO utility_poll_options (poll_id, option_index, label, emoji)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [poll.id, i + 1, opt.label, opt.emoji || null]
      );
      optionRows.push(optRes.rows[0]);
    }

    const payload = this.buildPollPayload(poll, optionRows, 0, []);
    const message = await channel.send(payload);

    await query(`UPDATE utility_polls SET message_id = $1 WHERE id = $2`, [message.id, poll.id]);
    poll.message_id = message.id;

    return { poll, message };
  }

  buildPollPayload(poll, options, totalVotes, userVotes = []) {
    const isClosed = poll.status === 'CLOSED';
    const isButtons = (poll.input_style === 'BUTTONS') ||
      (poll.input_style === 'AUTO' && options.length <= 5);

    const embed = new EmbedBuilder()
      .setColor(isClosed ? SlickBotColors.MUTED : SlickBotColors.PRIMARY)
      .setTitle(`📊 Poll: ${poll.question}`)
      .setTimestamp();

    const descLines = [];
    if (poll.expires_at && !isClosed) {
      const expSec = Math.floor(new Date(poll.expires_at).getTime() / 1000);
      descLines.push(`⏳ **Ends:** <t:${expSec}:R> (<t:${expSec}:F>)`);
    } else if (isClosed) {
      descLines.push('🔒 **This poll is closed.** Final results:');
    }

    descLines.push(`📋 **Voting Mode:** ${poll.multiple_votes ? 'Multiple Choices Allowed' : 'Single Choice'}`);
    if (poll.anonymous) descLines.push('🕵️ **Anonymous Poll:** Voter identities are hidden');
    descLines.push('');

    const letterEmojis = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'];

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const votes = opt.vote_count ? Number(opt.vote_count) : 0;
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      const bar = renderProgressBar(pct, 10);
      const isSelected = userVotes.includes(opt.id);
      const prefix = isSelected ? '👉 ' : '';
      const marker = opt.emoji || letterEmojis[i] || `${i + 1}️⃣`;

      descLines.push(`${prefix}${marker} **${opt.label}**`);
      descLines.push(`\`${bar}\` **${pct}%** (${votes.toLocaleString()} ${votes === 1 ? 'vote' : 'votes'})`);
      descLines.push('');
    }

    descLines.push(`👥 **Total Votes:** ${totalVotes.toLocaleString()}`);
    embed.setDescription(descLines.join('\n'));

    const components = [];
    if (!isClosed) {
      if (isButtons) {
        const rows = [];
        let currentRow = new ActionRowBuilder();

        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          const isSelected = userVotes.includes(opt.id);
          const btn = new ButtonBuilder()
            .setCustomId(`${CustomIds.PollVotePrefix}${poll.id}:${opt.id}`)
            .setLabel(`${opt.emoji || letterEmojis[i] || (i + 1)} ${opt.label}`.slice(0, 80))
            .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary);

          currentRow.addComponents(btn);
          if (currentRow.components.length === 5 || i === options.length - 1) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
          }
        }
        components.push(...rows);
      } else {
        const select = new StringSelectMenuBuilder()
          .setCustomId(`${CustomIds.PollSelectVotePrefix}${poll.id}`)
          .setPlaceholder('Select your choice(s)...')
          .setMinValues(1)
          .setMaxValues(poll.multiple_votes ? options.length : 1);

        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          select.addOptions({
            label: opt.label.slice(0, 100),
            value: opt.id,
            emoji: opt.emoji || letterEmojis[i] || undefined,
            default: userVotes.includes(opt.id)
          });
        }
        components.push(new ActionRowBuilder().addComponents(select));
      }

      // Add management button for end poll
      const endBtn = new ButtonBuilder()
        .setCustomId(`${CustomIds.PollEndPrefix}${poll.id}`)
        .setLabel('End Poll')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒');
      components.push(new ActionRowBuilder().addComponents(endBtn));
    }

    return { embeds: [embed], components };
  }

  async handleVote(pollId, optionIds, userId) {
    const selectedList = Array.isArray(optionIds) ? optionIds : [optionIds];

    const pollRes = await query(`SELECT * FROM utility_polls WHERE id = $1`, [pollId]);
    if (!pollRes.rows.length) throw new Error('Poll not found.');
    const poll = pollRes.rows[0];

    if (poll.status === 'CLOSED') {
      throw new Error('This poll is already closed.');
    }

    const existingVotesRes = await query(
      `SELECT option_id FROM utility_poll_votes WHERE poll_id = $1 AND user_id = $2`,
      [pollId, userId]
    );
    const existingOptionIds = existingVotesRes.rows.map((r) => r.option_id);

    if (!poll.multiple_votes) {
      // Single vote mode
      const selected = selectedList[0];
      if (existingOptionIds.includes(selected)) {
        // Toggle off
        await query(`DELETE FROM utility_poll_votes WHERE poll_id = $1 AND user_id = $2`, [pollId, userId]);
      } else {
        await query(`DELETE FROM utility_poll_votes WHERE poll_id = $1 AND user_id = $2`, [pollId, userId]);
        await query(
          `INSERT INTO utility_poll_votes (poll_id, option_id, user_id) VALUES ($1, $2, $3)`,
          [pollId, selected, userId]
        );
      }
    } else {
      // Multiple votes mode: toggle each selected option
      for (const optId of selectedList) {
        if (existingOptionIds.includes(optId)) {
          await query(
            `DELETE FROM utility_poll_votes WHERE poll_id = $1 AND option_id = $2 AND user_id = $3`,
            [pollId, optId, userId]
          );
        } else {
          await query(
            `INSERT INTO utility_poll_votes (poll_id, option_id, user_id) VALUES ($1, $2, $3)
             ON CONFLICT (poll_id, option_id, user_id) DO NOTHING`,
            [pollId, optId, userId]
          );
        }
      }
    }

    return this.getPollState(pollId, userId);
  }

  async getPollState(pollId, userId = null) {
    const pollRes = await query(`SELECT * FROM utility_polls WHERE id = $1`, [pollId]);
    if (!pollRes.rows.length) return null;
    const poll = pollRes.rows[0];

    const optionsRes = await query(
      `SELECT o.*, COUNT(v.id)::int AS vote_count
       FROM utility_poll_options o
       LEFT JOIN utility_poll_votes v ON v.option_id = o.id
       WHERE o.poll_id = $1
       GROUP BY o.id
       ORDER BY o.option_index ASC`,
      [pollId]
    );

    const totalVotes = optionsRes.rows.reduce((sum, o) => sum + Number(o.vote_count || 0), 0);

    let userVotes = [];
    if (userId) {
      const userVotesRes = await query(
        `SELECT option_id FROM utility_poll_votes WHERE poll_id = $1 AND user_id = $2`,
        [pollId, userId]
      );
      userVotes = userVotesRes.rows.map((r) => r.option_id);
    }

    return {
      poll,
      options: optionsRes.rows,
      totalVotes,
      userVotes
    };
  }

  async closePoll(pollId, client, endedBy = null) {
    const pollRes = await query(
      `UPDATE utility_polls SET status = 'CLOSED', ended_at = NOW() WHERE id = $1 RETURNING *`,
      [pollId]
    );
    if (!pollRes.rows.length) return null;
    const poll = pollRes.rows[0];

    const pollState = await this.getPollState(pollId);
    if (!pollState) return null;

    if (client && poll.channel_id && poll.message_id) {
      try {
        const channel = await client.channels.fetch(poll.channel_id).catch(() => null);
        if (channel) {
          const message = await channel.messages.fetch(poll.message_id).catch(() => null);
          if (message) {
            const payload = this.buildPollPayload(poll, pollState.options, pollState.totalVotes, []);
            await message.edit(payload).catch(() => {});
          }
        }
      } catch (e) {}
    }

    return pollState;
  }

  async processExpiredPolls(client, logger = null) {
    const due = await query(
      `SELECT id FROM utility_polls WHERE status = 'OPEN' AND expires_at IS NOT NULL AND expires_at <= NOW()`
    ).catch(() => ({ rows: [] }));

    for (const row of due.rows) {
      await this.closePoll(row.id, client).catch(() => {});
    }
  }

  // --- REMINDERS ENGINE ---
  async setReminder(guildId, user, channelId, {
    durationMs,
    reminderText,
    destinationType = 'DM',
    messageJumpUrl = null
  }) {
    if (!durationMs || durationMs < 1000) {
      throw new Error('Please specify a duration of at least 1 second.');
    }
    if (!reminderText || !reminderText.trim()) {
      throw new Error('Please provide a reminder message.');
    }

    const config = await this.getConfig(guildId);
    const countRes = await query(
      `SELECT COUNT(*)::int AS count FROM utility_reminders WHERE guild_id = $1 AND user_id = $2 AND status = 'PENDING'`,
      [guildId, user.id]
    );

    const activeCount = countRes.rows[0]?.count || 0;
    if (activeCount >= (config.max_reminders_per_user || 10)) {
      throw new Error(`You have reached the limit of ${config.max_reminders_per_user || 10} active reminders.`);
    }

    const dueAt = new Date(Date.now() + durationMs);
    const res = await query(
      `INSERT INTO utility_reminders (
        guild_id, user_id, user_tag, channel_id, reminder_text,
        destination_type, message_jump_url, due_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        guildId,
        user.id,
        user.tag,
        channelId,
        reminderText.trim().slice(0, 1000),
        destinationType,
        messageJumpUrl,
        dueAt
      ]
    );

    return { reminder: res.rows[0], dueAt };
  }

  async getUserReminders(guildId, userId) {
    const res = await query(
      `SELECT * FROM utility_reminders
       WHERE guild_id = $1 AND user_id = $2 AND status = 'PENDING'
       ORDER BY due_at ASC`,
      [guildId, userId]
    );
    return res.rows;
  }

  async cancelReminder(id, userId) {
    const res = await query(
      `UPDATE utility_reminders SET status = 'CANCELLED' WHERE id = $1 AND user_id = $2 AND status = 'PENDING' RETURNING *`,
      [id, userId]
    );
    return res.rows[0] || null;
  }

  async processDueReminders(client, logger = null) {
    const due = await query(
      `SELECT * FROM utility_reminders WHERE status = 'PENDING' AND due_at <= NOW() ORDER BY due_at ASC LIMIT 50`
    ).catch(() => ({ rows: [] }));

    for (const rem of due.rows) {
      await query(`UPDATE utility_reminders SET status = 'SENT', sent_at = NOW() WHERE id = $1`, [rem.id]);

      try {
        const embed = new EmbedBuilder()
          .setColor(SlickBotColors.PRIMARY)
          .setTitle('⏰ Reminder Alert')
          .setDescription(`**Reminder:** ${rem.reminder_text}`)
          .setTimestamp()
          .setFooter({ text: 'SlickBot Reminders' });

        if (rem.message_jump_url) {
          embed.addFields([{ name: '🔗 Original Context', value: `[Jump to message](${rem.message_jump_url})`, inline: false }]);
        }

        let delivered = false;
        if (rem.destination_type === 'CHANNEL' && rem.channel_id) {
          const channel = await client.channels.fetch(rem.channel_id).catch(() => null);
          if (channel) {
            await channel.send({ content: `🔔 <@${rem.user_id}>, here is your reminder:`, embeds: [embed] }).catch(() => {});
            delivered = true;
          }
        }

        if (!delivered) {
          const user = await client.users.fetch(rem.user_id).catch(() => null);
          if (user) {
            await user.send({ embeds: [embed] }).catch(() => {});
          }
        }
      } catch (err) {}
    }
  }

  // --- AFK ENGINE ---
  async setAfk(guildId, user, message = 'AFK') {
    const safeMsg = String(message || 'AFK').trim().slice(0, 500);
    const res = await query(
      `INSERT INTO utility_afk_users (guild_id, user_id, user_tag, message, set_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         user_tag = EXCLUDED.user_tag,
         message = EXCLUDED.message,
         set_at = NOW()
       RETURNING *`,
      [guildId, user.id, user.tag, safeMsg]
    );
    return res.rows[0];
  }

  async getAfk(guildId, userId) {
    const res = await query(
      `SELECT * FROM utility_afk_users WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    ).catch(() => ({ rows: [] }));
    return res.rows[0] || null;
  }

  async clearAfk(guildId, userId) {
    const res = await query(
      `DELETE FROM utility_afk_users WHERE guild_id = $1 AND user_id = $2 RETURNING *`,
      [guildId, userId]
    ).catch(() => ({ rows: [] }));
    return res.rows[0] || null;
  }

  async handleMessageAfkCheck(message) {
    if (!message || message.author?.bot || !message.guild) return;

    const guildId = message.guild.id;
    const authorId = message.author.id;

    // 1. Check if author is AFK - if so, clear it
    const authorAfk = await this.getAfk(guildId, authorId);
    if (authorAfk) {
      await this.clearAfk(guildId, authorId);
      const setSec = Math.floor(new Date(authorAfk.set_at).getTime() / 1000);
      await message.reply({
        embeds: [createSuccessEmbed('Welcome Back!', `Welcome back <@${authorId}>! I removed your AFK status. (You were AFK since <t:${setSec}:R>)`)]
      }).then((msg) => {
        setTimeout(() => msg.delete().catch(() => {}), 8000);
      }).catch(() => {});
    }

    // 2. Check if any mentioned users are AFK
    if (message.mentions && message.mentions.users && message.mentions.users.size > 0) {
      const mentionedIds = Array.from(message.mentions.users.keys()).filter((id) => id !== authorId && !message.mentions.users.get(id).bot);
      if (mentionedIds.length) {
        for (const targetId of mentionedIds.slice(0, 5)) {
          const targetAfk = await this.getAfk(guildId, targetId);
          if (targetAfk) {
            const setSec = Math.floor(new Date(targetAfk.set_at).getTime() / 1000);
            await message.reply({
              embeds: [createBaseEmbed({
                title: '💤 User is AFK',
                description: `<@${targetId}> is currently AFK: **${targetAfk.message}** (<t:${setSec}:R>)`,
                color: SlickBotColors.INFO
              })]
            }).then((msg) => {
              setTimeout(() => msg.delete().catch(() => {}), 10000);
            }).catch(() => {});
          }
        }
      }
    }
  }

  // --- SNIPE CACHE ---
  recordDeletedMessage(message) {
    if (!message || !message.channelId) return;
    const channelId = message.channelId;
    const existing = this.snipeCache.get(channelId) || [];

    const attachments = message.attachments
      ? Array.from(message.attachments.values()).map((a) => ({ name: a.name, url: a.url, proxyURL: a.proxyURL }))
      : [];

    existing.unshift({
      author: message.author ? { id: message.author.id, tag: message.author.tag, avatar: message.author.displayAvatarURL() } : null,
      content: message.content || '',
      attachments,
      createdAt: message.createdTimestamp ? new Date(message.createdTimestamp) : new Date(),
      deletedAt: new Date()
    });

    if (existing.length > 10) existing.pop();
    this.snipeCache.set(channelId, existing);
  }

  getSnipe(channelId) {
    const list = this.snipeCache.get(channelId);
    return list && list.length ? list[0] : null;
  }
}

module.exports = {
  UtilityService,
  DEFAULT_UTILITY_CONFIG,
  parseDurationToMs,
  renderProgressBar
};
