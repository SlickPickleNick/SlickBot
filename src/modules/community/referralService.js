const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');
const { LevelingService } = require('./levelingService');
const { query } = require('../../services/db');

const DEFAULT_REFERRAL_XP = 100;

function normalizeBoolean(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeUserTag(user) {
  return user?.tag || user?.username || null;
}

class ReferralService {
  constructor() {
    this.leveling = new LevelingService();
  }

  async getConfig(guildId) {
    const result = await query(`SELECT * FROM referral_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    return result.rows[0] || null;
  }

  async ensureConfig(guildId) {
    const result = await query(
      `INSERT INTO referral_configs (guild_id, enabled, referral_xp)
       VALUES ($1,true,$2)
       ON CONFLICT (guild_id) DO UPDATE SET guild_id = EXCLUDED.guild_id
       RETURNING *`,
      [guildId, DEFAULT_REFERRAL_XP]
    );
    return result.rows[0];
  }

  async setup(guildId, values = {}) {
    const current = await this.ensureConfig(guildId);
    const enabled = normalizeBoolean(values.enabled, current.enabled !== false);
    const referralXp = Math.max(0, Math.min(100000, Number(values.referralXp ?? current.referral_xp ?? DEFAULT_REFERRAL_XP)));
    const result = await query(
      `INSERT INTO referral_configs (guild_id, enabled, referral_xp)
       VALUES ($1,$2,$3)
       ON CONFLICT (guild_id)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     referral_xp = EXCLUDED.referral_xp,
                     updated_at = NOW()
       RETURNING *`,
      [guildId, enabled, referralXp]
    );
    return result.rows[0];
  }

  async getReferralForUser(guildId, userId) {
    const result = await query(`SELECT * FROM referrals WHERE guild_id = $1 AND referee_user_id = $2 LIMIT 1`, [guildId, userId]);
    return result.rows[0] || null;
  }

  async submitReferral({ guild, refereeUser, referrerUser, actorUser = null, logger = null, awardXp = true, source = 'SELF_SUBMIT' }) {
    if (!guild || !refereeUser || !referrerUser) return { ok: false, reason: 'Missing guild, referred member, or referrer.' };
    if (refereeUser.bot || referrerUser.bot) return { ok: false, reason: 'Bot accounts cannot submit or receive referrals.' };
    if (refereeUser.id === referrerUser.id) return { ok: false, reason: 'Members cannot refer themselves.' };

    const config = await this.ensureConfig(guild.id);
    if (config.enabled === false) return { ok: false, reason: 'Referrals are currently disabled for this server.' };

    const existing = await this.getReferralForUser(guild.id, refereeUser.id);
    if (existing) return { ok: false, reason: 'This member already has a referral recorded. Referrals are one-time only per member.' };

    const referralXp = Math.max(0, Number(config.referral_xp || 0));
    const result = await query(
      `INSERT INTO referrals
       (guild_id, referee_user_id, referee_user_tag, referrer_user_id, referrer_user_tag, submitted_by_user_id, source, xp_awarded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [guild.id, refereeUser.id, safeUserTag(refereeUser), referrerUser.id, safeUserTag(referrerUser), actorUser?.id || refereeUser.id, source, awardXp ? referralXp : 0]
    );
    const referral = result.rows[0];

    let xpResult = { awarded: false };
    if (awardXp && referralXp > 0) {
      xpResult = await this.leveling.awardBonusXpToUser({
        guild,
        userId: referrerUser.id,
        amount: referralXp,
        logger,
        reason: `Referral bonus for ${refereeUser.tag || refereeUser.username}`
      }).catch(() => ({ awarded: false }));
    }

    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'referral-submit',
      title: source === 'STAFF_SET' ? 'Referral Set by Staff' : 'Referral Submitted',
      body: [`Referred Member: <@${refereeUser.id}>`, `Referrer: <@${referrerUser.id}>`, `XP Awarded: **${xpResult.awarded ? xpResult.gained : 0}**`, actorUser ? `Set By: <@${actorUser.id}>` : null].filter(Boolean).join('\n'),
      actorUserId: actorUser?.id || refereeUser.id,
      metadata: { refereeUserId: refereeUser.id, referrerUserId: referrerUser.id, xpAwarded: xpResult.awarded ? xpResult.gained : 0, source }
    }).catch(() => {});

    return { ok: true, referral, config, xpResult };
  }

  async leaderboard(guildId, limit = 10) {
    const result = await query(
      `SELECT referrer_user_id, COALESCE(MAX(referrer_user_tag), referrer_user_id) AS referrer_user_tag,
              COUNT(*)::int AS referrals,
              COALESCE(SUM(xp_awarded), 0)::int AS xp_awarded
       FROM referrals
       WHERE guild_id = $1
       GROUP BY referrer_user_id
       ORDER BY referrals DESC, xp_awarded DESC, MIN(created_at) ASC
       LIMIT $2`,
      [guildId, Math.max(1, Math.min(25, Number(limit) || 10))]
    );
    return result.rows;
  }

  async stats(guildId) {
    const [total, uniqueReferrers, config] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM referrals WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(DISTINCT referrer_user_id)::int AS count FROM referrals WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      this.getConfig(guildId).catch(() => null)
    ]);
    return { total: total.rows[0]?.count || 0, uniqueReferrers: uniqueReferrers.rows[0]?.count || 0, config };
  }

  async buildManagerPanel(guildId) {
    const stats = await this.stats(guildId);
    const top = await this.leaderboard(guildId, 5).catch(() => []);
    const config = stats.config || { enabled: true, referral_xp: DEFAULT_REFERRAL_XP };
    return {
      embeds: [createBaseEmbed({
        title: 'SlickBot Referrals Center',
        description: [
          `Status: **${config.enabled === false ? 'Disabled' : 'Enabled'}**`,
          `Referral Bonus XP: **${Number(config.referral_xp || DEFAULT_REFERRAL_XP).toLocaleString()}**`,
          `Recorded Referrals: **${Number(stats.total || 0).toLocaleString()}**`,
          `Unique Referrers: **${Number(stats.uniqueReferrers || 0).toLocaleString()}**`,
          '',
          '**Top Referrers**',
          top.length ? top.map((row, index) => `**${index + 1}.** <@${row.referrer_user_id}> — **${row.referrals}** referral(s) · **${Number(row.xp_awarded || 0).toLocaleString()} XP**`).join('\n') : 'No referrals have been recorded yet.',
          '',
          'Members use `/referral submit` once. Staff can use `/referral set` to retroactively record a referral for a member.'
        ].join('\n'),
        color: config.enabled === false ? SlickBotColors.MUTED : SlickBotColors.PRIMARY,
        footer: 'SlickBot Referrals'
      })]
    };
  }

  buildLeaderboardEmbed(rows) {
    return createBaseEmbed({
      title: 'Referral Leaderboard',
      description: rows.length
        ? rows.map((row, index) => `**${index + 1}.** <@${row.referrer_user_id}> — **${row.referrals}** referral(s) · **${Number(row.xp_awarded || 0).toLocaleString()} XP**`).join('\n')
        : 'No referrals have been recorded yet.',
      color: SlickBotColors.PRIMARY,
      footer: 'SlickBot Referrals · Lifetime'
    });
  }

  buildReferralStatusEmbed(user, referral) {
    if (!referral) {
      return createWarningEmbed('No Referral Recorded', `${user} does not have a referral recorded yet.`);
    }
    return createBaseEmbed({
      title: 'Referral Status',
      description: [
        `Member: ${user}`,
        `Referred By: <@${referral.referrer_user_id}>`,
        `XP Awarded: **${Number(referral.xp_awarded || 0).toLocaleString()}**`,
        `Source: **${String(referral.source || 'Unknown').replaceAll('_', ' ')}**`,
        `Recorded: <t:${Math.floor(new Date(referral.created_at).getTime() / 1000)}:f>`
      ].join('\n'),
      color: SlickBotColors.INFO,
      footer: 'SlickBot Referrals'
    });
  }
}

module.exports = { ReferralService, DEFAULT_REFERRAL_XP };
