const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

const MAX_DURATION_MS = 365 * DAY_MS;

/**
 * Parses duration strings like '30s', '10m', '2h', '1d', '2w', '1d 2h 30m' into milliseconds.
 * Returns null by default if invalid/unmatched, or fallback value if specified.
 */
function parseDurationToMs(input, { maxDurationMs = MAX_DURATION_MS, fallback = null } = {}) {
  if (input === null || input === undefined) return fallback;
  const text = String(input).trim().toLowerCase();
  if (!text) return fallback;

  const tokenRegex = /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|y|yr|years?)/gi;

  let total = 0;
  let matchesCount = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    matchesCount++;
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (unit.startsWith('s')) total += amount * SECOND_MS;
    else if (unit.startsWith('m')) total += amount * MINUTE_MS;
    else if (unit.startsWith('h')) total += amount * HOUR_MS;
    else if (unit.startsWith('d')) total += amount * DAY_MS;
    else if (unit.startsWith('w')) total += amount * WEEK_MS;
    else if (unit.startsWith('y')) total += amount * YEAR_MS;
  }

  if (matchesCount === 0 || total === 0) {
    return fallback;
  }

  return maxDurationMs ? Math.min(total, maxDurationMs) : total;
}

/**
 * Formats milliseconds into human-readable duration strings (e.g. '1d 2h 30m' or '2 hours, 15 minutes').
 */
function formatDuration(ms, { short = true } = {}) {
  const num = Number(ms) || 0;
  if (num <= 0) return short ? '0s' : '0 seconds';

  const seconds = Math.floor((num / 1000) % 60);
  const minutes = Math.floor((num / (1000 * 60)) % 60);
  const hours = Math.floor((num / (1000 * 60 * 60)) % 24);
  const days = Math.floor(num / (1000 * 60 * 60 * 24));

  if (short) {
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 && parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ') || '0s';
  }

  const parts = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  return parts.join(', ') || '0 seconds';
}

function formatDiscordTimestamp(date, style = 'R') {
  if (!date) return 'N/A';
  const ts = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${ts}:${style}>`;
}

module.exports = {
  SECOND_MS,
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  WEEK_MS,
  YEAR_MS,
  MAX_DURATION_MS,
  parseDurationToMs,
  formatDuration,
  formatDiscordTimestamp
};
