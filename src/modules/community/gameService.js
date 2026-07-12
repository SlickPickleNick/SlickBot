const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const { pool, query } = require('../../services/db');
const { LevelingService } = require('./levelingService');
const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  SlickBotColors
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

const GAME_KEYS = Object.freeze({
  COUNTING: 'COUNTING',
  TIC_TAC_TOE: 'TIC_TAC_TOE',
  CONNECT_FOUR: 'CONNECT_FOUR'
});

const GAME_LABELS = Object.freeze({
  [GAME_KEYS.COUNTING]: 'Counting',
  [GAME_KEYS.TIC_TAC_TOE]: 'Tic-Tac-Toe',
  [GAME_KEYS.CONNECT_FOUR]: 'Connect Four'
});

const SESSION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  WON: 'WON',
  DRAW: 'DRAW',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
});

const POSTGRES_BIGINT_MIN = -9223372036854775808n;
const POSTGRES_BIGINT_MAX = 9223372036854775807n;
const DEFAULT_RESET_MESSAGE = '{user} reset the count. The next number is **{next}**.';
const DEFAULT_MILESTONE_MESSAGE = 'The server reached **{number}** in <#{channel}>. New counting record: **{record}**.';
const DEFAULT_COUNTING_ACCEPTED_REACTION = '✅';
const DEFAULT_COUNTING_FAILED_REACTION = '🚫';
const DEFAULT_BOARD_GAME_WIN_XP = 50;

function gameLabel(gameKey) {
  return GAME_LABELS[gameKey] || gameKey;
}

function boolLabel(value) {
  return value ? 'Enabled' : 'Disabled';
}

function channelLabel(channelId) {
  return channelId ? `<#${channelId}>` : 'Any text channel';
}

function countingChannelLabel(channelId) {
  return channelId ? `<#${channelId}>` : 'Not configured';
}

function normalizeBoard(value, expectedLength) {
  const board = Array.isArray(value) ? value.map((cell) => Number(cell) || 0) : [];
  return board.length === expectedLength ? board : Array(expectedLength).fill(0);
}

function replaceTemplate(template, values) {
  let output = String(template || '');
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, String(value));
  }
  return output.slice(0, 1900);
}

const REACTION_ALIASES = Object.freeze({
  ':greencheck:': '✅',
  'greencheck': '✅',
  ':white_check_mark:': '✅',
  'white_check_mark': '✅',
  ':no_entry_sign:': '🚫',
  'no_entry_sign': '🚫',
  ':no_entry:': '⛔',
  'no_entry': '⛔'
});

function normalizeReactionEmoji(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const named = raw.toLowerCase();
  return (REACTION_ALIASES[named] || raw).slice(0, 100);
}

function uniqueReactionCandidates(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const candidate = String(value || '').trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    output.push(candidate);
  }
  return output;
}

async function resolveNamedGuildEmoji(message, emojiName) {
  const name = String(emojiName || '').trim();
  if (!name || !message.guild) return null;
  const cached = message.guild.emojis?.cache?.find((emojiObject) => emojiObject.name === name);
  if (cached) return cached;
  const manager = message.guild.emojis;
  if (!manager || typeof manager.fetch !== 'function') return null;
  const fetched = await manager.fetch().catch(() => null);
  return fetched?.find?.((emojiObject) => emojiObject.name === name) || null;
}

function buildReactionCandidates(rawEmoji, fallbackEmoji) {
  const raw = String(rawEmoji || '').trim();
  const fallback = String(fallbackEmoji || '').trim();
  const normalized = normalizeReactionEmoji(raw || fallback, fallback);
  const candidates = [normalized];
  const custom = raw.match(/^<a?:([A-Za-z0-9_~-]{2,32}):(\d{15,25})>$/);
  if (custom) {
    candidates.push(`${custom[1]}:${custom[2]}`, custom[2], raw);
  }
  const namedRaw = raw.match(/^:([A-Za-z0-9_~-]{2,32}):$/);
  if (namedRaw) {
    const alias = REACTION_ALIASES[raw.toLowerCase()];
    if (alias) candidates.push(alias);
    candidates.push(`guild-name:${namedRaw[1]}`);
  }
  const namedNormalized = normalized.match(/^:([A-Za-z0-9_~-]{2,32}):$/);
  if (namedNormalized) candidates.push(`guild-name:${namedNormalized[1]}`);
  if (fallback) candidates.push(fallback);
  return uniqueReactionCandidates(candidates);
}

async function reactToCountingMessage(message, emoji, fallbackEmoji) {
  if (!message || typeof message.react !== 'function') return false;

  const botUserId = message.client?.user?.id;
  const botMember = message.guild?.members?.me
    || (botUserId && message.guild?.members?.cache?.get(botUserId))
    || (botUserId && message.guild ? await message.guild.members.fetch(botUserId).catch(() => null) : null);
  const botPermissions = botMember && typeof message.channel?.permissionsFor === 'function'
    ? message.channel.permissionsFor(botMember)
    : null;
  if (botPermissions && (!botPermissions.has(PermissionFlagsBits.AddReactions) || !botPermissions.has(PermissionFlagsBits.ReadMessageHistory))) {
    return false;
  }

  const target = typeof message.fetch === 'function' ? await message.fetch().catch(() => message) : message;
  for (const candidate of buildReactionCandidates(emoji, fallbackEmoji)) {
    if (candidate.startsWith('guild-name:')) {
      const guildEmoji = await resolveNamedGuildEmoji(target, candidate.slice('guild-name:'.length));
      if (!guildEmoji) continue;
      if (await target.react(guildEmoji).then(() => true).catch(() => false)) return true;
      continue;
    }
    if (await target.react(candidate).then(() => true).catch(() => false)) return true;
  }
  return false;
}

function parseIntegerOrExpression(content, allowExpressions) {
  const source = String(content || '').trim();
  if (!source || source.length > 120) return null;

  const plain = source.replaceAll(',', '');
  if (/^[+-]?\d+$/.test(plain)) {
    try {
      const value = BigInt(plain);
      return value >= POSTGRES_BIGINT_MIN && value <= POSTGRES_BIGINT_MAX ? value : null;
    } catch {
      return null;
    }
  }

  if (!allowExpressions) return null;
  try {
    const parser = new BigIntExpressionParser(plain);
    const value = parser.parse();
    return value >= POSTGRES_BIGINT_MIN && value <= POSTGRES_BIGINT_MAX ? value : null;
  } catch {
    return null;
  }
}

class BigIntExpressionParser {
  constructor(source) {
    this.tokens = this.tokenize(source);
    this.position = 0;
  }

  tokenize(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const char = source[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (/\d/.test(char)) {
        let end = index + 1;
        while (end < source.length && /\d/.test(source[end])) end += 1;
        tokens.push({ type: 'number', value: BigInt(source.slice(index, end)) });
        index = end;
        continue;
      }
      if ('+-*/%^()'.includes(char)) {
        tokens.push({ type: char, value: char });
        index += 1;
        continue;
      }
      throw new Error('Unsupported expression token.');
    }
    return tokens;
  }

  current() {
    return this.tokens[this.position] || null;
  }

  consume(type) {
    if (this.current()?.type !== type) throw new Error(`Expected ${type}.`);
    return this.tokens[this.position++];
  }

  parse() {
    if (!this.tokens.length) throw new Error('Empty expression.');
    const value = this.parseAdditive();
    if (this.current()) throw new Error('Unexpected token.');
    return value;
  }

  parseAdditive() {
    let value = this.parseMultiplicative();
    while (this.current() && ['+', '-'].includes(this.current().type)) {
      const operator = this.current().type;
      this.position += 1;
      const right = this.parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
      this.assertRange(value);
    }
    return value;
  }

  parseMultiplicative() {
    let value = this.parsePower();
    while (this.current() && ['*', '/', '%'].includes(this.current().type)) {
      const operator = this.current().type;
      this.position += 1;
      const right = this.parsePower();
      if ((operator === '/' || operator === '%') && right === 0n) throw new Error('Division by zero.');
      if (operator === '/') {
        if (value % right !== 0n) throw new Error('Result is not an integer.');
        value /= right;
      } else if (operator === '%') {
        value %= right;
      } else {
        value *= right;
      }
      this.assertRange(value);
    }
    return value;
  }

  parsePower() {
    let value = this.parseUnary();
    if (this.current()?.type === '^') {
      this.position += 1;
      const exponent = this.parsePower();
      if (exponent < 0n || exponent > 63n) throw new Error('Exponent outside supported range.');
      value **= exponent;
      this.assertRange(value);
    }
    return value;
  }

  parseUnary() {
    if (this.current()?.type === '+') {
      this.position += 1;
      return this.parseUnary();
    }
    if (this.current()?.type === '-') {
      this.position += 1;
      const value = -this.parseUnary();
      this.assertRange(value);
      return value;
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.current()?.type === 'number') return this.consume('number').value;
    if (this.current()?.type === '(') {
      this.consume('(');
      const value = this.parseAdditive();
      this.consume(')');
      return value;
    }
    throw new Error('Expected a number.');
  }

  assertRange(value) {
    if (value < POSTGRES_BIGINT_MIN || value > POSTGRES_BIGINT_MAX) throw new Error('Expression outside supported range.');
  }
}

function makeSessionButton(customId, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

function sessionExpired(session) {
  return session?.expires_at && new Date(session.expires_at).getTime() <= Date.now();
}

class CommunityGameService {
  constructor() {
    this.leveling = new LevelingService();
  }

  async ensureGameConfigs(guildId) {
    for (const gameKey of Object.values(GAME_KEYS)) {
      await query(
        `INSERT INTO community_game_configs (guild_id, game_key, enabled)
         VALUES ($1, $2, false)
         ON CONFLICT (guild_id, game_key) DO NOTHING`,
        [guildId, gameKey]
      );
    }
    await query(
      `INSERT INTO counting_game_configs (guild_id)
       VALUES ($1)
       ON CONFLICT (guild_id) DO NOTHING`,
      [guildId]
    );
  }

  async getGameConfig(guildId, gameKey) {
    await this.ensureGameConfigs(guildId);
    const result = await query(
      `SELECT * FROM community_game_configs WHERE guild_id = $1 AND game_key = $2 LIMIT 1`,
      [guildId, gameKey]
    );
    return result.rows[0] || null;
  }

  async getAllGameConfigs(guildId) {
    await this.ensureGameConfigs(guildId);
    const result = await query(
      `SELECT * FROM community_game_configs WHERE guild_id = $1 ORDER BY game_key ASC`,
      [guildId]
    );
    return result.rows;
  }

  async getCountingConfig(guildId) {
    await this.ensureGameConfigs(guildId);
    const result = await query(
      `SELECT c.*, g.enabled
       FROM counting_game_configs c
       INNER JOIN community_game_configs g ON g.guild_id = c.guild_id AND g.game_key = 'COUNTING'
       WHERE c.guild_id = $1
       LIMIT 1`,
      [guildId]
    );
    return result.rows[0] || null;
  }

  async setGameEnabled(guildId, gameKey, enabled) {
    await this.ensureGameConfigs(guildId);
    if (gameKey === GAME_KEYS.COUNTING && enabled) {
      const counting = await this.getCountingConfig(guildId);
      if (!counting?.channel_id) {
        return { ok: false, reason: 'Configure a counting channel with `/games counting setup` before enabling Counting.' };
      }
    }
    const result = await query(
      `UPDATE community_game_configs
       SET enabled = $3, updated_at = NOW()
       WHERE guild_id = $1 AND game_key = $2
       RETURNING *`,
      [guildId, gameKey, enabled]
    );
    return { ok: true, config: result.rows[0] };
  }

  async updateBoardGameConfig(guildId, gameKey, values = {}) {
    await this.ensureGameConfigs(guildId);
    const current = await this.getGameConfig(guildId, gameKey);
    const channelId = values.channelId === undefined ? current?.channel_id || null : values.channelId;
    const winXp = Math.max(0, Math.min(1000000, Number(values.winXp ?? current?.win_xp ?? DEFAULT_BOARD_GAME_WIN_XP)));
    const result = await query(
      `UPDATE community_game_configs
       SET channel_id = $3,
           win_xp = $4,
           updated_at = NOW()
       WHERE guild_id = $1 AND game_key = $2
       RETURNING *`,
      [guildId, gameKey, channelId, winXp]
    );
    return result.rows[0];
  }

  async updateCountingConfig(guildId, values = {}) {
    await this.ensureGameConfigs(guildId);
    const current = await this.getCountingConfig(guildId);
    const oldStart = BigInt(current?.starting_number || 1);
    const oldCurrent = BigInt(current?.current_number || 0);
    const newStart = values.startingNumber === undefined ? oldStart : BigInt(values.startingNumber);
    const newCurrent = values.startingNumber !== undefined && oldCurrent === oldStart - 1n
      ? newStart - 1n
      : oldCurrent;

    const config = {
      channelId: values.channelId === undefined ? current?.channel_id || null : values.channelId,
      startingNumber: newStart,
      currentNumber: newCurrent,
      resetOnIncorrect: values.resetOnIncorrect ?? current?.reset_on_incorrect ?? true,
      preventConsecutive: values.preventConsecutive ?? current?.prevent_consecutive ?? true,
      resetOnEdit: values.resetOnEdit ?? current?.reset_on_edit ?? true,
      resetOnDelete: values.resetOnDelete ?? current?.reset_on_delete ?? true,
      ignoreNonNumbers: values.ignoreNonNumbers ?? current?.ignore_non_number_messages ?? true,
      allowExpressions: values.allowExpressions ?? current?.allow_expressions ?? false,
      deleteInvalid: values.deleteInvalid ?? current?.delete_invalid_messages ?? false,
      resetMessage: values.resetMessage ?? current?.reset_message ?? DEFAULT_RESET_MESSAGE,
      milestoneInterval: Math.max(0, Number(values.milestoneInterval ?? current?.milestone_interval ?? 100)),
      milestoneMessage: values.milestoneMessage ?? current?.milestone_message ?? DEFAULT_MILESTONE_MESSAGE,
      milestoneXp: Math.max(0, Number(values.milestoneXp ?? current?.milestone_xp ?? 0)),
      normalMessageXp: values.normalMessageXp ?? current?.normal_message_xp ?? false,
      acceptedReactionEmoji: normalizeReactionEmoji(values.acceptedReactionEmoji ?? current?.accepted_reaction_emoji, DEFAULT_COUNTING_ACCEPTED_REACTION),
      failedReactionEmoji: normalizeReactionEmoji(values.failedReactionEmoji ?? current?.failed_reaction_emoji, DEFAULT_COUNTING_FAILED_REACTION)
    };

    const channelChanged = values.channelId !== undefined && values.channelId !== (current?.channel_id || null);

    const result = await query(
      `UPDATE counting_game_configs
       SET channel_id = $2,
           starting_number = $3,
           current_number = $4,
           reset_on_incorrect = $5,
           prevent_consecutive = $6,
           reset_on_edit = $7,
           reset_on_delete = $8,
           ignore_non_number_messages = $9,
           allow_expressions = $10,
           delete_invalid_messages = $11,
           reset_message = $12,
           milestone_interval = $13,
           milestone_message = $14,
           milestone_xp = $15,
           normal_message_xp = $16,
           accepted_reaction_emoji = $17,
           failed_reaction_emoji = $18,
           updated_at = NOW()
       WHERE guild_id = $1
       RETURNING *`,
      [
        guildId,
        config.channelId,
        config.startingNumber.toString(),
        config.currentNumber.toString(),
        config.resetOnIncorrect,
        config.preventConsecutive,
        config.resetOnEdit,
        config.resetOnDelete,
        config.ignoreNonNumbers,
        config.allowExpressions,
        config.deleteInvalid,
        config.resetMessage,
        config.milestoneInterval,
        config.milestoneMessage,
        config.milestoneXp,
        config.normalMessageXp,
        config.acceptedReactionEmoji,
        config.failedReactionEmoji
      ]
    );
    if (channelChanged) await query(`DELETE FROM counting_game_entries WHERE guild_id = $1`, [guildId]);
    return { ...result.rows[0], enabled: current?.enabled ?? false };
  }

  async setCountingNumber(guildId, currentNumber) {
    await this.ensureGameConfigs(guildId);
    const value = BigInt(currentNumber);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT guild_id FROM counting_game_configs WHERE guild_id = $1 FOR UPDATE`, [guildId]);
      await client.query(`DELETE FROM counting_game_entries WHERE guild_id = $1`, [guildId]);
      const result = await client.query(
        `UPDATE counting_game_configs
         SET current_number = $2,
             record_number = GREATEST(record_number, $2),
             last_user_id = NULL,
             updated_at = NOW()
         WHERE guild_id = $1
         RETURNING *`,
        [guildId, value.toString()]
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async resetCounting(guildId, nextNumber = null) {
    await this.ensureGameConfigs(guildId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(`SELECT * FROM counting_game_configs WHERE guild_id = $1 FOR UPDATE`, [guildId]);
      const config = locked.rows[0];
      const next = nextNumber == null ? BigInt(config?.starting_number || 1) : BigInt(nextNumber);
      const current = next - 1n;
      await client.query(`DELETE FROM counting_game_entries WHERE guild_id = $1`, [guildId]);
      const result = await client.query(
        `UPDATE counting_game_configs
         SET current_number = $2,
             last_user_id = NULL,
             updated_at = NOW()
         WHERE guild_id = $1
         RETURNING *`,
        [guildId, current.toString()]
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async addCountingIgnoredRole(guildId, roleId) {
    await this.ensureGameConfigs(guildId);
    await query(
      `INSERT INTO counting_game_ignored_roles (guild_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (guild_id, role_id) DO NOTHING`,
      [guildId, roleId]
    );
  }

  async removeCountingIgnoredRole(guildId, roleId) {
    const result = await query(
      `DELETE FROM counting_game_ignored_roles WHERE guild_id = $1 AND role_id = $2 RETURNING *`,
      [guildId, roleId]
    );
    return Boolean(result.rows[0]);
  }

  async addCountingIgnoredUser(guildId, userId) {
    await this.ensureGameConfigs(guildId);
    await query(
      `INSERT INTO counting_game_ignored_users (guild_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (guild_id, user_id) DO NOTHING`,
      [guildId, userId]
    );
  }

  async removeCountingIgnoredUser(guildId, userId) {
    const result = await query(
      `DELETE FROM counting_game_ignored_users WHERE guild_id = $1 AND user_id = $2 RETURNING *`,
      [guildId, userId]
    );
    return Boolean(result.rows[0]);
  }

  async getActiveCountingConfigForChannel(guildId, channelId) {
    const result = await query(
      `SELECT c.*, g.enabled
       FROM counting_game_configs c
       INNER JOIN community_game_configs g ON g.guild_id = c.guild_id AND g.game_key = 'COUNTING'
       WHERE c.guild_id = $1 AND c.channel_id = $2 AND g.enabled = true
       LIMIT 1`,
      [guildId, channelId]
    );
    return result.rows[0] || null;
  }

  async isCountingParticipantIgnored(message) {
    const userResult = await query(
      `SELECT 1 FROM counting_game_ignored_users WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
      [message.guild.id, message.author.id]
    );
    if (userResult.rows.length) return true;
    const roleIds = message.member?.roles?.cache ? [...message.member.roles.cache.keys()] : [];
    if (!roleIds.length) return false;
    const roleResult = await query(
      `SELECT 1 FROM counting_game_ignored_roles WHERE guild_id = $1 AND role_id = ANY($2) LIMIT 1`,
      [message.guild.id, roleIds]
    );
    return Boolean(roleResult.rows.length);
  }

  async handleCountingMessage(message, logger, preloadedConfig = null) {
    if (!message.guild || message.author?.bot) return { handled: false };
    const config = preloadedConfig || await this.getActiveCountingConfigForChannel(message.guild.id, message.channelId).catch(() => null);
    if (!config || config.enabled === false || !config.channel_id || config.channel_id !== message.channelId) return { handled: false };
    if (await this.isCountingParticipantIgnored(message).catch(() => false)) return { handled: false, inCountingChannel: true };

    const parsed = parseIntegerOrExpression(message.content, Boolean(config.allow_expressions));
    if (parsed == null && config.ignore_non_number_messages !== false) {
      return { handled: false, inCountingChannel: true, ignoredNonNumber: true };
    }

    const client = await pool.connect();
    let outcome;
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT c.*, g.enabled
         FROM counting_game_configs c
         INNER JOIN community_game_configs g ON g.guild_id = c.guild_id AND g.game_key = 'COUNTING'
         WHERE c.guild_id = $1
         FOR UPDATE OF c`,
        [message.guild.id]
      );
      const live = locked.rows[0];
      if (!live || live.enabled === false || live.channel_id !== message.channelId) {
        await client.query('ROLLBACK');
        return { handled: false };
      }

      const current = BigInt(live.current_number || 0);
      const expected = current + 1n;
      const consecutive = Boolean(live.prevent_consecutive && live.last_user_id === message.author.id);
      const correct = parsed != null && parsed === expected && !consecutive;

      if (correct) {
        const record = BigInt(live.record_number || 0);
        const newRecord = parsed > record ? parsed : record;
        await client.query(
          `UPDATE counting_game_configs
           SET current_number = $2,
               record_number = $3,
               last_user_id = $4,
               updated_at = NOW()
           WHERE guild_id = $1`,
          [message.guild.id, parsed.toString(), newRecord.toString(), message.author.id]
        );
        await client.query(
          `INSERT INTO counting_game_entries (message_id, guild_id, channel_id, user_id, number_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [message.id, message.guild.id, message.channelId, message.author.id, parsed.toString()]
        );
        await client.query(
          `INSERT INTO counting_game_stats (guild_id, user_id, valid_counts, highest_number, updated_at)
           VALUES ($1, $2, 1, $3, NOW())
           ON CONFLICT (guild_id, user_id)
           DO UPDATE SET valid_counts = counting_game_stats.valid_counts + 1,
                         highest_number = GREATEST(counting_game_stats.highest_number, EXCLUDED.highest_number),
                         updated_at = NOW()`,
          [message.guild.id, message.author.id, parsed.toString()]
        );
        await client.query('COMMIT');
        outcome = {
          handled: true,
          correct: true,
          number: parsed,
          record: newRecord,
          config: live,
          suppressNormalXp: live.normal_message_xp !== true
        };
      } else {
        const shouldReset = live.reset_on_incorrect !== false;
        if (shouldReset) {
          const resetCurrent = BigInt(live.starting_number || 1) - 1n;
          await client.query(`DELETE FROM counting_game_entries WHERE guild_id = $1`, [message.guild.id]);
          await client.query(
            `UPDATE counting_game_configs
             SET current_number = $2,
                 last_user_id = NULL,
                 updated_at = NOW()
             WHERE guild_id = $1`,
            [message.guild.id, resetCurrent.toString()]
          );
          await client.query(
            `INSERT INTO counting_game_stats (guild_id, user_id, resets_caused, updated_at)
             VALUES ($1, $2, 1, NOW())
             ON CONFLICT (guild_id, user_id)
             DO UPDATE SET resets_caused = counting_game_stats.resets_caused + 1,
                           updated_at = NOW()`,
            [message.guild.id, message.author.id]
          );
        }
        await client.query('COMMIT');
        outcome = {
          handled: true,
          correct: false,
          consecutive,
          parsed,
          expected,
          shouldReset,
          config: live,
          suppressNormalXp: live.normal_message_xp !== true
        };
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    if (outcome.correct) {
      await reactToCountingMessage(message, outcome.config.accepted_reaction_emoji, DEFAULT_COUNTING_ACCEPTED_REACTION);
      const interval = Number(outcome.config.milestone_interval || 0);
      const isMilestone = interval > 0 && outcome.number % BigInt(interval) === 0n;
      if (isMilestone) {
        const milestoneText = replaceTemplate(outcome.config.milestone_message || DEFAULT_MILESTONE_MESSAGE, {
          user: `<@${message.author.id}>`,
          username: message.author.username,
          number: outcome.number.toString(),
          record: outcome.record.toString(),
          channel: message.channelId,
          server: message.guild.name
        });
        await message.channel.send({ content: milestoneText, allowedMentions: { parse: [], users: [message.author.id] } }).catch(() => {});
        const milestoneXp = Number(outcome.config.milestone_xp || 0);
        if (milestoneXp > 0) {
          await this.leveling.awardBonusXp(message, milestoneXp, logger, 'Counting milestone').catch(() => {});
        }
        await logger?.log?.({
          guildId: message.guild.id,
          eventKey: 'community-game-milestone',
          title: 'Counting Milestone Reached',
          body: `Member: <@${message.author.id}>\nNumber: **${outcome.number.toString()}**\nRecord: **${outcome.record.toString()}**`,
          actorUserId: message.author.id,
          metadata: { game: GAME_KEYS.COUNTING, number: outcome.number.toString() }
        }).catch(() => {});
      }
      return outcome;
    }

    await reactToCountingMessage(message, outcome.config.failed_reaction_emoji, DEFAULT_COUNTING_FAILED_REACTION);
    if (outcome.config.delete_invalid_messages) await message.delete().catch(() => {});
    if (outcome.shouldReset) {
      const next = BigInt(outcome.config.starting_number || 1);
      const resetText = replaceTemplate(outcome.config.reset_message || DEFAULT_RESET_MESSAGE, {
        user: `<@${message.author.id}>`,
        username: message.author.username,
        number: outcome.parsed == null ? message.content : outcome.parsed.toString(),
        expected: outcome.expected.toString(),
        next: next.toString(),
        record: String(outcome.config.record_number || 0),
        channel: message.channelId,
        server: message.guild.name,
        reason: outcome.consecutive ? 'consecutive turn' : 'incorrect number'
      });
      await message.channel.send({ content: resetText, allowedMentions: { parse: [], users: [message.author.id] } }).catch(() => {});
      await logger?.log?.({
        guildId: message.guild.id,
        eventKey: 'community-game-reset',
        title: 'Counting Game Reset',
        body: `Member: <@${message.author.id}>\nExpected: **${outcome.expected.toString()}**\nReason: **${outcome.consecutive ? 'Consecutive turn' : outcome.parsed == null ? 'Non-counting message' : 'Incorrect number'}**`,
        actorUserId: message.author.id,
        metadata: { game: GAME_KEYS.COUNTING, expected: outcome.expected.toString() }
      }).catch(() => {});
    } else {
      const feedback = `That entry was not accepted. The next number is **${outcome.expected.toString()}**.`;
      if (outcome.config.delete_invalid_messages) {
        await message.channel.send({ content: feedback, allowedMentions: { parse: [] } }).catch(() => {});
      } else {
        await message.reply({ content: feedback, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
      }
    }
    return outcome;
  }

  async handleCountingMessageMutation(message, mutationType, logger) {
    const messageId = message?.id;
    const guildId = message?.guildId || message?.guild?.id;
    if (!messageId || !guildId || !['EDITED', 'DELETED'].includes(mutationType)) return { handled: false };

    const client = await pool.connect();
    let outcome = null;
    try {
      await client.query('BEGIN');
      const configResult = await client.query(
        `SELECT config.*, games.enabled
         FROM counting_game_configs config
         INNER JOIN community_game_configs games ON games.guild_id = config.guild_id AND games.game_key = 'COUNTING'
         WHERE config.guild_id = $1
         FOR UPDATE OF config`,
        [guildId]
      );
      const config = configResult.rows[0];
      const entryResult = await client.query(
        `SELECT * FROM counting_game_entries
         WHERE message_id = $1 AND guild_id = $2
         FOR UPDATE`,
        [messageId, guildId]
      );
      const entryRow = entryResult.rows[0];
      const entry = entryRow && config ? { ...entryRow, ...config, user_id: entryRow.user_id, channel_id: entryRow.channel_id, number_value: entryRow.number_value } : null;
      const shouldReset = entry
        && entry.enabled !== false
        && (mutationType === 'EDITED' ? entry.reset_on_edit !== false : entry.reset_on_delete !== false);
      if (!shouldReset) {
        await client.query('ROLLBACK');
        return { handled: false };
      }

      const next = BigInt(entry.starting_number || 1);
      await client.query(
        `UPDATE counting_game_configs
         SET current_number = $2, last_user_id = NULL, updated_at = NOW()
         WHERE guild_id = $1`,
        [guildId, (next - 1n).toString()]
      );
      await client.query(`DELETE FROM counting_game_entries WHERE guild_id = $1`, [guildId]);
      if (mutationType === 'EDITED') {
        await client.query(
          `INSERT INTO counting_game_stats (guild_id, user_id, resets_caused, updated_at)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (guild_id, user_id)
           DO UPDATE SET resets_caused = counting_game_stats.resets_caused + 1,
                         updated_at = NOW()`,
          [guildId, entry.user_id]
        );
      }
      await client.query('COMMIT');
      outcome = { handled: true, entry, next };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    let channel = message.channel || null;
    if (!channel && message.guild) channel = await message.guild.channels.fetch(outcome.entry.channel_id).catch(() => null);
    if (channel?.isTextBased?.()) {
      const verb = mutationType === 'EDITED' ? 'edited' : 'deleted';
      await channel.send({
        content: `An accepted counting message from <@${outcome.entry.user_id}> was ${verb}. The count has reset. The next number is **${outcome.next.toString()}**.`,
        allowedMentions: { parse: [], users: [outcome.entry.user_id] }
      }).catch(() => {});
    }
    await logger?.log?.({
      guildId,
      eventKey: 'community-game-reset',
      title: 'Counting Game Reset',
      body: `Accepted Message: **${mutationType === 'EDITED' ? 'Edited' : 'Deleted'}**
Member: <@${outcome.entry.user_id}>
Number: **${outcome.entry.number_value}**
Next Number: **${outcome.next.toString()}**`,
      actorUserId: mutationType === 'EDITED' ? outcome.entry.user_id : null,
      metadata: { game: GAME_KEYS.COUNTING, messageId, mutationType, number: String(outcome.entry.number_value) }
    }).catch(() => {});
    return outcome;
  }

  async getCountingLeaderboard(guildId, limit = 10) {
    const result = await query(
      `SELECT * FROM counting_game_stats
       WHERE guild_id = $1
       ORDER BY valid_counts DESC, highest_number DESC, updated_at ASC
       LIMIT $2`,
      [guildId, limit]
    );
    return result.rows;
  }

  async getGameStats(guildId, userId, gameKey) {
    const result = await query(
      `SELECT * FROM community_game_stats
       WHERE guild_id = $1 AND user_id = $2 AND game_key = $3
       LIMIT 1`,
      [guildId, userId, gameKey]
    );
    return result.rows[0] || null;
  }

  async createChallenge({ interaction, gameKey, opponent }) {
    const config = await this.getGameConfig(interaction.guildId, gameKey);
    if (!config?.enabled) return { ok: false, reason: `${gameLabel(gameKey)} is disabled in this server.` };
    if (config.channel_id && config.channel_id !== interaction.channelId) {
      return { ok: false, reason: `${gameLabel(gameKey)} challenges must be started in <#${config.channel_id}>.` };
    }
    if (opponent.bot) return { ok: false, reason: 'Bots cannot join community game challenges.' };
    if (opponent.id === interaction.user.id) return { ok: false, reason: 'Choose another server member as your opponent.' };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`${interaction.guildId}:${gameKey}`]);
      await client.query(
        `UPDATE community_game_sessions
         SET status = 'EXPIRED', updated_at = NOW()
         WHERE guild_id = $1 AND game_key = $2 AND status IN ('PENDING', 'ACTIVE') AND expires_at <= NOW()`,
        [interaction.guildId, gameKey]
      );

      const active = await client.query(
        `SELECT 1 FROM community_game_sessions
         WHERE guild_id = $1
           AND game_key = $2
           AND status IN ('PENDING', 'ACTIVE')
           AND expires_at > NOW()
           AND (player_one_id = ANY($3::text[]) OR player_two_id = ANY($3::text[]))
         LIMIT 1`,
        [interaction.guildId, gameKey, [interaction.user.id, opponent.id]]
      );
      if (active.rows.length) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'One of these players already has a pending or active game of this type.' };
      }

      const board = gameKey === GAME_KEYS.TIC_TAC_TOE ? Array(9).fill(0) : Array(42).fill(0);
      const result = await client.query(
        `INSERT INTO community_game_sessions
         (guild_id, game_key, channel_id, player_one_id, player_two_id, current_player_id, board, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $4, $6::jsonb, 'PENDING', NOW() + INTERVAL '10 minutes')
         RETURNING *`,
        [interaction.guildId, gameKey, interaction.channelId, interaction.user.id, opponent.id, JSON.stringify(board)]
      );
      await client.query('COMMIT');
      return { ok: true, session: result.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async attachSessionMessage(sessionId, messageId) {
    const result = await query(
      `UPDATE community_game_sessions SET message_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [sessionId, messageId]
    );
    return result.rows[0] || null;
  }

  async getSession(sessionId) {
    const result = await query(`SELECT * FROM community_game_sessions WHERE id = $1 LIMIT 1`, [sessionId]);
    return result.rows[0] || null;
  }

  async handleChallengeDecision({ sessionId, userId, accept }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT * FROM community_game_sessions WHERE id = $1 FOR UPDATE`, [sessionId]);
      const session = result.rows[0];
      if (!session) throw new Error('This game challenge could not be found.');
      if (session.status !== SESSION_STATUS.PENDING) throw new Error('This challenge is no longer pending.');
      if (sessionExpired(session)) {
        await client.query(`UPDATE community_game_sessions SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`, [sessionId]);
        await client.query('COMMIT');
        return { session: { ...session, status: SESSION_STATUS.EXPIRED }, expired: true };
      }

      if (accept) {
        if (userId !== session.player_two_id) throw new Error('Only the challenged player can accept this game.');
        const updated = await client.query(
          `UPDATE community_game_sessions
           SET status = 'ACTIVE',
               current_player_id = player_one_id,
               expires_at = NOW() + INTERVAL '30 minutes',
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [sessionId]
        );
        await client.query('COMMIT');
        return { session: updated.rows[0], accepted: true };
      }

      if (![session.player_one_id, session.player_two_id].includes(userId)) throw new Error('Only a player in this challenge can decline or cancel it.');
      const updated = await client.query(
        `UPDATE community_game_sessions SET status = 'DECLINED', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [sessionId]
      );
      await client.query('COMMIT');
      return { session: updated.rows[0], declined: true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async makeTicTacToeMove({ sessionId, userId, cell }) {
    return this.makeBoardMove({ sessionId, userId, move: cell, gameKey: GAME_KEYS.TIC_TAC_TOE });
  }

  async makeConnectFourMove({ sessionId, userId, column }) {
    return this.makeBoardMove({ sessionId, userId, move: column, gameKey: GAME_KEYS.CONNECT_FOUR });
  }

  async makeBoardMove({ sessionId, userId, move, gameKey }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT * FROM community_game_sessions WHERE id = $1 FOR UPDATE`, [sessionId]);
      const session = result.rows[0];
      if (!session || session.game_key !== gameKey) throw new Error('This game session could not be found.');
      if (session.status !== SESSION_STATUS.ACTIVE) throw new Error('This game is no longer active.');
      if (sessionExpired(session)) {
        const expired = await client.query(`UPDATE community_game_sessions SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1 RETURNING *`, [sessionId]);
        await client.query('COMMIT');
        return { session: expired.rows[0], expired: true };
      }
      if (session.current_player_id !== userId) throw new Error('It is not your turn.');

      const playerNumber = userId === session.player_one_id ? 1 : 2;
      const board = normalizeBoard(session.board, gameKey === GAME_KEYS.TIC_TAC_TOE ? 9 : 42);
      let placedIndex;
      if (gameKey === GAME_KEYS.TIC_TAC_TOE) {
        const cell = Number(move);
        if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new Error('That board space is invalid.');
        if (board[cell] !== 0) throw new Error('That board space is already occupied.');
        board[cell] = playerNumber;
        placedIndex = cell;
      } else {
        const column = Number(move);
        if (!Number.isInteger(column) || column < 0 || column > 6) throw new Error('That column is invalid.');
        for (let row = 5; row >= 0; row -= 1) {
          const index = row * 7 + column;
          if (board[index] === 0) {
            board[index] = playerNumber;
            placedIndex = index;
            break;
          }
        }
        if (placedIndex == null) throw new Error('That Connect Four column is full.');
      }

      const won = gameKey === GAME_KEYS.TIC_TAC_TOE
        ? hasTicTacToeWin(board, playerNumber)
        : hasConnectFourWin(board, playerNumber, placedIndex);
      const draw = !won && board.every((cellValue) => cellValue !== 0);
      const nextPlayerId = userId === session.player_one_id ? session.player_two_id : session.player_one_id;
      const status = won ? SESSION_STATUS.WON : draw ? SESSION_STATUS.DRAW : SESSION_STATUS.ACTIVE;
      const updated = await client.query(
        `UPDATE community_game_sessions
         SET board = $2::jsonb,
             status = $3,
             current_player_id = $4,
             winner_user_id = $5,
             expires_at = CASE WHEN $3 = 'ACTIVE' THEN NOW() + INTERVAL '30 minutes' ELSE expires_at END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [sessionId, JSON.stringify(board), status, status === SESSION_STATUS.ACTIVE ? nextPlayerId : userId, won ? userId : null]
      );

      if (won || draw) {
        await recordGameStats(client, updated.rows[0], won ? userId : null, draw);
      }
      await client.query('COMMIT');
      return { session: updated.rows[0], won, draw };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async awardBoardGameCompletionXp({ guild, channel, session, draw, logger }) {
    if (!guild || !session || ![GAME_KEYS.TIC_TAC_TOE, GAME_KEYS.CONNECT_FOUR].includes(session.game_key)) return [];
    const config = await this.getGameConfig(session.guild_id || guild.id, session.game_key).catch(() => null);
    const winXp = Math.max(0, Number(config?.win_xp ?? DEFAULT_BOARD_GAME_WIN_XP));
    if (!winXp) return [];

    const awards = [];
    if (draw) {
      const drawXp = Math.floor(winXp / 2);
      if (drawXp <= 0) return [];
      for (const userId of [session.player_one_id, session.player_two_id]) {
        const result = await this.leveling.awardBonusXpToUser({
          guild,
          channel,
          userId,
          amount: drawXp,
          logger,
          reason: `${gameLabel(session.game_key)} draw`
        }).catch(() => null);
        awards.push({ userId, amount: drawXp, awarded: Boolean(result?.awarded), leveledUp: Boolean(result?.leveledUp) });
      }
      return awards;
    }

    if (!session.winner_user_id) return [];
    const result = await this.leveling.awardBonusXpToUser({
      guild,
      channel,
      userId: session.winner_user_id,
      amount: winXp,
      logger,
      reason: `${gameLabel(session.game_key)} win`
    }).catch(() => null);
    awards.push({ userId: session.winner_user_id, amount: winXp, awarded: Boolean(result?.awarded), leveledUp: Boolean(result?.leveledUp) });
    return awards;
  }

  buildChallengePayload(session) {
    const expires = Math.floor(new Date(session.expires_at).getTime() / 1000);
    const embed = createBaseEmbed({
      title: `${gameLabel(session.game_key)} Challenge`,
      description: [
        `<@${session.player_one_id}> challenged <@${session.player_two_id}>.`,
        '',
        `The challenged player must accept before <t:${expires}:R>.`,
        'Only the two listed players can accept, decline, or cancel this challenge.'
      ].join('\n'),
      color: SlickBotColors.INFO,
      footer: 'SlickBot Community Games'
    });
    const row = new ActionRowBuilder().addComponents(
      makeSessionButton(`${CustomIds.GameChallengeAcceptPrefix}${session.id}`, 'Accept', ButtonStyle.Success),
      makeSessionButton(`${CustomIds.GameChallengeDeclinePrefix}${session.id}`, 'Decline / Cancel', ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row], allowedMentions: { parse: [], users: [session.player_one_id, session.player_two_id] } };
  }

  buildSessionPayload(session) {
    if (session.game_key === GAME_KEYS.TIC_TAC_TOE) return this.buildTicTacToePayload(session);
    return this.buildConnectFourPayload(session);
  }

  buildTicTacToePayload(session) {
    const board = normalizeBoard(session.board, 9);
    const finished = ![SESSION_STATUS.PENDING, SESSION_STATUS.ACTIVE].includes(session.status);
    const description = [
      `<@${session.player_one_id}>: **X**`,
      `<@${session.player_two_id}>: **O**`,
      '',
      session.status === SESSION_STATUS.ACTIVE ? `Turn: <@${session.current_player_id}>` : sessionResultLine(session)
    ].join('\n');
    const embed = createBaseEmbed({
      title: 'Tic-Tac-Toe',
      description,
      color: session.status === SESSION_STATUS.WON ? SlickBotColors.SUCCESS : session.status === SESSION_STATUS.DRAW ? SlickBotColors.WARNING : SlickBotColors.PRIMARY,
      footer: 'SlickBot Community Games'
    });
    const components = [];
    for (let row = 0; row < 3; row += 1) {
      const actionRow = new ActionRowBuilder();
      for (let column = 0; column < 3; column += 1) {
        const index = row * 3 + column;
        const value = board[index];
        actionRow.addComponents(makeSessionButton(
          `${CustomIds.GameTicTacToeMovePrefix}${session.id}:${index}`,
          value === 1 ? 'X' : value === 2 ? 'O' : String(index + 1),
          value === 1 ? ButtonStyle.Primary : value === 2 ? ButtonStyle.Danger : ButtonStyle.Secondary,
          finished || value !== 0
        ));
      }
      components.push(actionRow);
    }
    return { embeds: [embed], components, allowedMentions: { parse: [], users: [session.player_one_id, session.player_two_id] } };
  }

  buildConnectFourPayload(session) {
    const board = normalizeBoard(session.board, 42);
    const finished = ![SESSION_STATUS.PENDING, SESSION_STATUS.ACTIVE].includes(session.status);
    const symbols = ['⚫', '🔵', '🟠'];
    const rows = [];
    for (let row = 0; row < 6; row += 1) {
      rows.push(board.slice(row * 7, row * 7 + 7).map((cell) => symbols[cell] || symbols[0]).join(''));
    }
    rows.push('1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣');
    const embed = createBaseEmbed({
      title: 'Connect Four',
      description: [
        `<@${session.player_one_id}>: **Blue**`,
        `<@${session.player_two_id}>: **Orange**`,
        '',
        ...rows,
        '',
        session.status === SESSION_STATUS.ACTIVE ? `Turn: <@${session.current_player_id}>` : sessionResultLine(session)
      ].join('\n'),
      color: session.status === SESSION_STATUS.WON ? SlickBotColors.SUCCESS : session.status === SESSION_STATUS.DRAW ? SlickBotColors.WARNING : SlickBotColors.PRIMARY,
      footer: 'SlickBot Community Games'
    });
    const columnFull = (column) => board[column] !== 0;
    const rowOne = new ActionRowBuilder();
    const rowTwo = new ActionRowBuilder();
    for (let column = 0; column < 7; column += 1) {
      const button = makeSessionButton(
        `${CustomIds.GameConnectFourMovePrefix}${session.id}:${column}`,
        String(column + 1),
        ButtonStyle.Secondary,
        finished || columnFull(column)
      );
      if (column < 5) rowOne.addComponents(button); else rowTwo.addComponents(button);
    }
    return { embeds: [embed], components: [rowOne, rowTwo], allowedMentions: { parse: [], users: [session.player_one_id, session.player_two_id] } };
  }

  buildClosedChallengePayload(session) {
    const embed = createBaseEmbed({
      title: `${gameLabel(session.game_key)} Challenge`,
      description: session.status === SESSION_STATUS.DECLINED
        ? 'The game challenge was declined or cancelled.'
        : 'The game challenge expired before it was accepted.',
      color: SlickBotColors.MUTED,
      footer: 'SlickBot Community Games'
    });
    return { embeds: [embed], components: [] };
  }

  async expireStaleSessions(discordClient) {
    const stale = await query(
      `SELECT * FROM community_game_sessions
       WHERE status IN ('PENDING', 'ACTIVE') AND expires_at <= NOW()`
    );
    if (!stale.rows.length) return 0;
    const updated = await query(
      `UPDATE community_game_sessions
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE id = ANY($1::text[])
         AND status IN ('PENDING', 'ACTIVE')
         AND expires_at <= NOW()
       RETURNING id`,
      [stale.rows.map((session) => session.id)]
    );
    const updatedIds = new Set(updated.rows.map((row) => row.id));
    for (const previous of stale.rows) {
      if (!updatedIds.has(previous.id)) continue;
      const session = { ...previous, status: SESSION_STATUS.EXPIRED };
      if (!session.channel_id || !session.message_id) continue;
      const channel = await discordClient.channels.fetch(session.channel_id).catch(() => null);
      if (!channel?.isTextBased?.()) continue;
      const message = await channel.messages.fetch(session.message_id).catch(() => null);
      if (!message) continue;
      const payload = previous.status === SESSION_STATUS.PENDING
        ? this.buildClosedChallengePayload(session)
        : this.buildSessionPayload(session);
      await message.edit(payload).catch(() => {});
    }
    return updated.rows.length;
  }

  async buildManagerPanel(guildId) {
    const [configs, counting, sessions] = await Promise.all([
      this.getAllGameConfigs(guildId),
      this.getCountingConfig(guildId),
      query(`SELECT game_key,
                    COUNT(*) FILTER (WHERE status IN ('PENDING','ACTIVE') AND expires_at > NOW())::int AS active_count,
                    COUNT(*) FILTER (WHERE status IN ('WON','DRAW'))::int AS completed_count
             FROM community_game_sessions
             WHERE guild_id = $1
             GROUP BY game_key`, [guildId])
    ]);
    const byKey = new Map(configs.map((config) => [config.game_key, config]));
    const activeByKey = new Map(sessions.rows.map((row) => [row.game_key, Number(row.active_count || 0)]));
    const playedByKey = new Map(sessions.rows.map((row) => [row.game_key, Number(row.completed_count || 0)]));
    const lines = [
      gameSummaryLine(byKey.get(GAME_KEYS.COUNTING), `Channel: ${countingChannelLabel(counting?.channel_id)} · Current: **${counting?.current_number || 0}** · Record: **${counting?.record_number || 0}**`),
      gameSummaryLine(byKey.get(GAME_KEYS.TIC_TAC_TOE), `Channel: ${channelLabel(byKey.get(GAME_KEYS.TIC_TAC_TOE)?.channel_id)} · Active: **${activeByKey.get(GAME_KEYS.TIC_TAC_TOE) || 0}** · Played: **${playedByKey.get(GAME_KEYS.TIC_TAC_TOE) || 0}** · Win XP: **${Number(byKey.get(GAME_KEYS.TIC_TAC_TOE)?.win_xp ?? DEFAULT_BOARD_GAME_WIN_XP)}**`),
      gameSummaryLine(byKey.get(GAME_KEYS.CONNECT_FOUR), `Channel: ${channelLabel(byKey.get(GAME_KEYS.CONNECT_FOUR)?.channel_id)} · Active: **${activeByKey.get(GAME_KEYS.CONNECT_FOUR) || 0}** · Played: **${playedByKey.get(GAME_KEYS.CONNECT_FOUR) || 0}** · Win XP: **${Number(byKey.get(GAME_KEYS.CONNECT_FOUR)?.win_xp ?? DEFAULT_BOARD_GAME_WIN_XP)}**`)
    ];
    const embed = createBaseEmbed({
      title: 'SlickBot Community Center',
      description: [
        '**Viewing:** Community Games',
        '',
        '**Game Configurations**',
        ...lines,
        '',
        'Use the buttons below to view a specific game. Configuration changes are made with `/games` commands.'
      ].join('\n'),
      color: SlickBotColors.INFO
    });
    const row = createButtonRow([
      createPanelButton(CustomIds.GamesCounting, 'Counting', ButtonStyle.Secondary),
      createPanelButton(CustomIds.GamesTicTacToe, 'Tic-Tac-Toe', ButtonStyle.Secondary),
      createPanelButton(CustomIds.GamesConnectFour, 'Connect Four', ButtonStyle.Secondary),
      createPanelButton(CustomIds.SetupCommunity, 'Community', ButtonStyle.Secondary),
      createPanelButton(CustomIds.SetupRefresh, 'Return to Setup', ButtonStyle.Primary)
    ]);
    return { embeds: [embed], components: [row] };
  }

  async buildCountingPanel(guildId) {
    const config = await this.getCountingConfig(guildId);
    const [roles, users, stats] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM counting_game_ignored_roles WHERE guild_id = $1`, [guildId]),
      query(`SELECT COUNT(*)::int AS count FROM counting_game_ignored_users WHERE guild_id = $1`, [guildId]),
      query(`SELECT COALESCE(SUM(valid_counts), 0)::bigint AS counts, COALESCE(SUM(resets_caused), 0)::bigint AS resets FROM counting_game_stats WHERE guild_id = $1`, [guildId])
    ]);
    const embed = createBaseEmbed({
      title: 'SlickBot Community Center',
      description: [
        '**Viewing:** Community Games — Counting',
        '',
        `Status: **${config?.enabled ? 'Enabled' : 'Disabled'}**`,
        `Channel: ${countingChannelLabel(config?.channel_id)}`,
        `Starting Number: **${config?.starting_number || 1}**`,
        `Current Number: **${config?.current_number || 0}**`,
        `Next Number: **${(BigInt(config?.current_number || 0) + 1n).toString()}**`,
        `Highest Record: **${config?.record_number || 0}**`,
        '',
        '**Rules**',
        `Reset on Incorrect Entry: **${boolLabel(config?.reset_on_incorrect !== false)}**`,
        `Prevent Consecutive Turns: **${boolLabel(config?.prevent_consecutive !== false)}**`,
        `Reset if Accepted Message Is Edited: **${boolLabel(config?.reset_on_edit !== false)}**`,
        `Reset if Accepted Message Is Deleted: **${boolLabel(config?.reset_on_delete !== false)}**`,
        `Ignore Non-Counting Messages: **${boolLabel(config?.ignore_non_number_messages !== false)}**`,
        `Allow Math Expressions: **${boolLabel(Boolean(config?.allow_expressions))}**`,
        `Delete Invalid Messages: **${boolLabel(Boolean(config?.delete_invalid_messages))}**`,
        `Accepted Count Reaction: **${config?.accepted_reaction_emoji || DEFAULT_COUNTING_ACCEPTED_REACTION}**`,
        `Failed Count Reaction: **${config?.failed_reaction_emoji || DEFAULT_COUNTING_FAILED_REACTION}**`,
        `Normal Message XP: **${boolLabel(Boolean(config?.normal_message_xp))}**`,
        '',
        '**Milestones and Participation**',
        `Milestone Interval: **${Number(config?.milestone_interval || 0) || 'Disabled'}**`,
        `Milestone XP: **${Number(config?.milestone_xp || 0) || 'Disabled'}**`,
        `Ignored Roles: **${roles.rows[0]?.count || 0}**`,
        `Ignored Users: **${users.rows[0]?.count || 0}**`,
        `Accepted Counts: **${stats.rows[0]?.counts || 0}**`,
        `Recorded Resets: **${stats.rows[0]?.resets || 0}**`,
        '',
        'Primary setup: `/games counting setup`'
      ].join('\n'),
      color: config?.enabled ? SlickBotColors.SUCCESS : SlickBotColors.MUTED
    });
    return { embeds: [embed], components: [this.buildGameNavigationRow()] };
  }

  async buildBoardGamePanel(guildId, gameKey) {
    const config = await this.getGameConfig(guildId, gameKey);
    const [active, totals] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM community_game_sessions WHERE guild_id = $1 AND game_key = $2 AND status IN ('PENDING','ACTIVE') AND expires_at > NOW()`, [guildId, gameKey]),
      query(`SELECT COALESCE(SUM(games_played), 0)::int AS games, COALESCE(SUM(wins), 0)::int AS wins, COALESCE(SUM(draws), 0)::int AS draws FROM community_game_stats WHERE guild_id = $1 AND game_key = $2`, [guildId, gameKey])
    ]);
    const commandGroup = gameKey === GAME_KEYS.TIC_TAC_TOE ? 'tic-tac-toe' : 'connect-four';
    const embed = createBaseEmbed({
      title: 'SlickBot Community Center',
      description: [
        `**Viewing:** Community Games — ${gameLabel(gameKey)}`,
        '',
        `Status: **${config?.enabled ? 'Enabled' : 'Disabled'}**`,
        `Allowed Channel: ${channelLabel(config?.channel_id)}`,
        `Pending / Active Games: **${active.rows[0]?.count || 0}**`,
        `Total Player Results: **${totals.rows[0]?.games || 0}**`,
        `Recorded Wins: **${totals.rows[0]?.wins || 0}**`,
        `Recorded Draws: **${totals.rows[0]?.draws || 0}**`,
        `Win XP: **${Number(config?.win_xp ?? DEFAULT_BOARD_GAME_WIN_XP)}**`,
        `Draw XP: **${Math.floor(Number(config?.win_xp ?? DEFAULT_BOARD_GAME_WIN_XP) / 2)}** each`,
        '',
        `Members start a challenge with \`/games ${commandGroup} challenge\`.`,
        `Primary setup: \`/games ${commandGroup} setup\``
      ].join('\n'),
      color: config?.enabled ? SlickBotColors.SUCCESS : SlickBotColors.MUTED
    });
    return { embeds: [embed], components: [this.buildGameNavigationRow()] };
  }

  buildGameNavigationRow() {
    return createButtonRow([
      createPanelButton(CustomIds.GamesRefresh, 'Return to Games', ButtonStyle.Primary),
      createPanelButton(CustomIds.SetupCommunity, 'Community', ButtonStyle.Secondary),
      createPanelButton(CustomIds.SetupRefresh, 'Return to Setup', ButtonStyle.Secondary)
    ]);
  }
}

function gameSummaryLine(config, detail) {
  return `${config?.enabled ? '✅' : '⏸️'} **${gameLabel(config?.game_key)}** — ${config?.enabled ? 'Enabled' : 'Disabled'}\n${detail}`;
}

function sessionResultLine(session) {
  if (session.status === SESSION_STATUS.WON) return `Winner: <@${session.winner_user_id}>`;
  if (session.status === SESSION_STATUS.DRAW) return 'Result: **Draw**';
  if (session.status === SESSION_STATUS.EXPIRED) return 'Result: **Expired**';
  if (session.status === SESSION_STATUS.DECLINED) return 'Result: **Declined / Cancelled**';
  return `Status: **${session.status || 'Closed'}**`;
}

function hasTicTacToeWin(board, player) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  return lines.some((line) => line.every((index) => board[index] === player));
}

function hasConnectFourWin(board, player, placedIndex) {
  const row = Math.floor(placedIndex / 7);
  const column = placedIndex % 7;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  return directions.some(([rowDelta, columnDelta]) => {
    let count = 1;
    for (const direction of [-1, 1]) {
      let nextRow = row + rowDelta * direction;
      let nextColumn = column + columnDelta * direction;
      while (nextRow >= 0 && nextRow < 6 && nextColumn >= 0 && nextColumn < 7 && board[nextRow * 7 + nextColumn] === player) {
        count += 1;
        nextRow += rowDelta * direction;
        nextColumn += columnDelta * direction;
      }
    }
    return count >= 4;
  });
}

async function recordGameStats(client, session, winnerUserId, draw) {
  const playerIds = [session.player_one_id, session.player_two_id];
  for (const userId of playerIds) {
    const won = winnerUserId === userId;
    const lost = Boolean(winnerUserId && winnerUserId !== userId);
    await client.query(
      `INSERT INTO community_game_stats
       (guild_id, user_id, game_key, games_played, wins, losses, draws, updated_at)
       VALUES ($1, $2, $3, 1, $4, $5, $6, NOW())
       ON CONFLICT (guild_id, user_id, game_key)
       DO UPDATE SET games_played = community_game_stats.games_played + 1,
                     wins = community_game_stats.wins + EXCLUDED.wins,
                     losses = community_game_stats.losses + EXCLUDED.losses,
                     draws = community_game_stats.draws + EXCLUDED.draws,
                     updated_at = NOW()`,
      [session.guild_id, userId, session.game_key, won ? 1 : 0, lost ? 1 : 0, draw ? 1 : 0]
    );
  }
}

function buildCountingStatusEmbed(config) {
  return createBaseEmbed({
    title: 'Counting Game Status',
    description: [
      `Status: **${config?.enabled ? 'Enabled' : 'Disabled'}**`,
      `Channel: ${countingChannelLabel(config?.channel_id)}`,
      `Current Number: **${config?.current_number || 0}**`,
      `Next Number: **${(BigInt(config?.current_number || 0) + 1n).toString()}**`,
      `Record: **${config?.record_number || 0}**`,
      `Ignore Non-Counting Messages: **${boolLabel(config?.ignore_non_number_messages !== false)}**`,
      `Prevent Consecutive Turns: **${boolLabel(config?.prevent_consecutive !== false)}**`,
      `Reset on Accepted-Message Edit: **${boolLabel(config?.reset_on_edit !== false)}**`,
      `Reset on Accepted-Message Delete: **${boolLabel(config?.reset_on_delete !== false)}**`,
      `Accepted Count Reaction: **${config?.accepted_reaction_emoji || DEFAULT_COUNTING_ACCEPTED_REACTION}**`,
      `Failed Count Reaction: **${config?.failed_reaction_emoji || DEFAULT_COUNTING_FAILED_REACTION}**`,
      `Allow Math Expressions: **${boolLabel(Boolean(config?.allow_expressions))}**`
    ].join('\n'),
    color: config?.enabled ? SlickBotColors.SUCCESS : SlickBotColors.MUTED,
    footer: 'SlickBot Community Games'
  });
}

function buildCountingLeaderboardEmbed(rows) {
  const description = rows.length
    ? rows.map((row, index) => `${index + 1}. <@${row.user_id}> — **${BigInt(row.valid_counts || 0).toLocaleString()}** count(s) · Highest **${row.highest_number || 0}** · Resets **${row.resets_caused || 0}**`).join('\n')
    : 'No counting statistics have been recorded yet.';
  return createBaseEmbed({
    title: 'Counting Leaderboard',
    description,
    color: rows.length ? SlickBotColors.INFO : SlickBotColors.MUTED,
    footer: 'SlickBot Community Games'
  });
}

function buildGameStatsEmbed(user, gameKey, stats) {
  return createBaseEmbed({
    title: `${gameLabel(gameKey)} Statistics`,
    description: [
      `Player: <@${user.id}>`,
      `Games Played: **${stats?.games_played || 0}**`,
      `Wins: **${stats?.wins || 0}**`,
      `Losses: **${stats?.losses || 0}**`,
      `Draws: **${stats?.draws || 0}**`
    ].join('\n'),
    color: SlickBotColors.INFO,
    footer: 'SlickBot Community Games'
  });
}

module.exports = {
  CommunityGameService,
  GAME_KEYS,
  GAME_LABELS,
  SESSION_STATUS,
  buildCountingStatusEmbed,
  buildCountingLeaderboardEmbed,
  buildGameStatsEmbed,
  parseIntegerOrExpression,
  hasTicTacToeWin,
  hasConnectFourWin
};
