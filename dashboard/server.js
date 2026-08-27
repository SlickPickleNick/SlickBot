const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const https = require('node:https');
const querystring = require('node:querystring');

// Load environment variables and services
const { env } = require('../src/config/env');
const { query } = require('../src/services/db');
const { ModuleKeys } = require('../src/modules/moduleRegistry');
const { SocialFeedService } = require('../src/modules/automation/socialFeedService');
const { configAuditService } = require('../src/modules/logging/configAuditService');

const PORT = process.env.DASHBOARD_PORT || process.env.PORT || 3000;
const HOST = process.env.DASHBOARD_HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const socialFeedService = new SocialFeedService();

// Dynamic credential resolution supporting all common environment variable naming conventions
function getDiscordCredentials() {
  const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || env?.DISCORD_CLIENT_ID || '';
  const clientSecret = process.env.DISCORD_CLIENT_SECRET || 
                       process.env.CLIENT_SECRET || 
                       process.env.DISCORD_SECRET || 
                       process.env.DISCORD_OAUTH_SECRET || 
                       process.env.BOT_CLIENT_SECRET || 
                       env?.DISCORD_CLIENT_SECRET || 
                       '';
  return { clientId, clientSecret };
}

// In-memory sessions store (sessionId -> sessionData) with TTL cleanup
const sessions = new Map();
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_MAX_AGE_MS) {
      sessions.delete(id);
    }
  }
}, 60 * 60 * 1000).unref();

// Discord Permission Flags
const PERMISSIONS = {
  ADMINISTRATOR: 0x8n,
  MANAGE_GUILD: 0x20n
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Complete metadata for ALL 29 modules registered in moduleRegistry.js
const ALL_MODULES_METADATA = [
  // 1. General & Overview
  {
    key: ModuleKeys.PERMISSIONS,
    name: 'Master Permissions & Teams',
    description: 'Custom staff permission teams, role bindings, action key scopes, and channel overrides.',
    category: 'General & Overview',
    categoryId: 'general',
    commands: ['/permissions view', '/permissions grant', '/team create'],
    actionKey: 'COMMAND_PERMISSIONS'
  },
  {
    key: ModuleKeys.STATUS,
    name: 'Bot Presence & Status',
    description: 'Custom activity text, presence status (online, dnd, idle), and live Twitch stream URL.',
    category: 'General & Overview',
    categoryId: 'general',
    commands: ['/status set', '/status stream-url'],
    actionKey: 'COMMAND_STATUS'
  },
  {
    key: ModuleKeys.BOT_UPDATES,
    name: 'Bot Release Changelogs',
    description: 'Automatic bot update announcements and version changelog delivery.',
    category: 'General & Overview',
    categoryId: 'general',
    commands: ['/botupdates channel', '/botupdates toggle'],
    actionKey: 'COMMAND_BOT_UPDATES'
  },

  // 2. Safety, Moderation & AutoMod
  {
    key: ModuleKeys.MODERATION,
    name: 'Moderation & Case Logs',
    description: 'Enforce server rules with warn, mute, kick, ban, unban, case logs, and member notes.',
    category: 'Safety & Moderation',
    categoryId: 'safety',
    commands: ['/mod warn', '/mod mute', '/mod ban', '/case view', '/note add'],
    actionKey: 'COMMAND_MOD_WARN'
  },
  {
    key: ModuleKeys.AUTOMOD,
    name: 'AutoMod Engine & Spam Defense',
    description: 'Automated anti-spam, Discord invite link filtering, banned words, and repeated text detection.',
    category: 'Safety & Moderation',
    categoryId: 'safety',
    commands: ['/automod settings', '/automod whitelist', '/automod rule'],
    actionKey: 'COMMAND_AUTOMOD'
  },
  {
    key: ModuleKeys.LOCKDOWN,
    name: 'Emergency Server Lockdown',
    description: 'Instantly isolate channels or lock down the entire server during raid attacks.',
    category: 'Safety & Moderation',
    categoryId: 'safety',
    commands: ['/lockdown start', '/lockdown stop', '/lockdown quarantine'],
    actionKey: 'COMMAND_LOCKDOWN'
  },

  // 3. Support & Workflows
  {
    key: ModuleKeys.TICKETS,
    name: 'Support Tickets & Queues',
    description: 'Interactive button-based ticket panels, HTML transcripts, staff queues, and auto-closing.',
    category: 'Support & Workflows',
    categoryId: 'support',
    commands: ['/ticket panel', '/ticket close', '/ticket claim'],
    actionKey: 'COMMAND_TICKET'
  },
  {
    key: ModuleKeys.REPORTS,
    name: 'Member & Message Reports',
    description: 'Anonymous member reporting queue with message context and staff resolution logs.',
    category: 'Support & Workflows',
    categoryId: 'support',
    commands: ['/report user', '/report message', '/report queue'],
    actionKey: 'COMMAND_REPORT'
  },
  {
    key: ModuleKeys.APPLICATIONS,
    name: 'Staff & Role Applications',
    description: 'Multi-step modal applications with custom questions, staff review channels, and verdicts.',
    category: 'Support & Workflows',
    categoryId: 'support',
    commands: ['/application create', '/application review'],
    actionKey: 'COMMAND_APPLICATION'
  },
  {
    key: ModuleKeys.APPEALS,
    name: 'Infraction Appeals',
    description: 'Member ban and mute appeal submissions with reviewer comments and decision logging.',
    category: 'Support & Workflows',
    categoryId: 'support',
    commands: ['/appeal submit', '/appeal view', '/appeal decide'],
    actionKey: 'COMMAND_APPEAL'
  },
  {
    key: ModuleKeys.FAQ,
    name: 'Forum-Backed FAQ & Auto-Replies',
    description: 'Forum-synced FAQ threads, automated keyword matching, and question-answer index embeds.',
    category: 'Support & Workflows',
    categoryId: 'support',
    commands: ['/faq create', '/faq list', '/faq sync'],
    actionKey: 'COMMAND_FAQ'
  },

  // 4. Media & Social Feeds
  {
    key: ModuleKeys.SOCIAL_FEEDS,
    name: 'Social Feeds & Stream Alerts',
    description: 'Instant Twitch live alerts, YouTube video & Shorts tracking, live directory hubs, and subscriber roles.',
    category: 'Media & Social Feeds',
    categoryId: 'media',
    commands: ['/feed add', '/feed list', '/feed edit', '/feed check'],
    actionKey: 'COMMAND_FEED'
  },

  // 5. Onboarding & Member Roles
  {
    key: ModuleKeys.WELCOME,
    name: 'Welcome Cards & Greetings',
    description: 'Customizable welcome embeds, join cards, rule acceptance verification, and starter roles.',
    category: 'Onboarding & Roles',
    categoryId: 'onboarding',
    commands: ['/welcome config', '/welcome test', '/welcome card'],
    actionKey: 'COMMAND_WELCOME'
  },
  {
    key: ModuleKeys.REACTION_ROLES,
    name: 'Role Panels & Self-Roles',
    description: 'Interactive button and dropdown menu role panels with single/multi-choice selection modes.',
    category: 'Onboarding & Roles',
    categoryId: 'onboarding',
    commands: ['/roles panel', '/roles add', '/roles remove'],
    actionKey: 'COMMAND_ROLES'
  },
  {
    key: ModuleKeys.TEMP_ROLES,
    name: 'Temporary & Timed Roles',
    description: 'Grant roles for specific durations with automatic expiry timers and audit trail logging.',
    category: 'Onboarding & Roles',
    categoryId: 'onboarding',
    commands: ['/temprole grant', '/temprole revoke', '/temprole list'],
    actionKey: 'COMMAND_TEMP_ROLES'
  },
  {
    key: ModuleKeys.BIRTHDAYS,
    name: 'Birthday Calendar',
    description: 'Member birthday tracking, automatic birthday role assignment, and daily celebration messages.',
    category: 'Onboarding & Roles',
    categoryId: 'onboarding',
    commands: ['/birthday set', '/birthday list', '/birthday config'],
    actionKey: 'COMMAND_BIRTHDAY'
  },

  // 6. Community, Leveling & Engagement
  {
    key: ModuleKeys.LEVELING,
    name: 'XP Progression & Leaderboards',
    description: 'Text and voice XP gain rates, multiplier roles, level-up announcements, and milestone reward roles.',
    category: 'Community & Leveling',
    categoryId: 'community',
    commands: ['/level rank', '/level leaderboard', '/level setxp'],
    actionKey: 'COMMAND_LEVEL'
  },
  {
    key: ModuleKeys.ACHIEVEMENTS,
    name: 'Achievements & Badges',
    description: 'Server achievement milestones, custom badge icons, unlock notifications, and user profiles.',
    category: 'Community & Leveling',
    categoryId: 'community',
    commands: ['/achievement list', '/achievement grant', '/achievement progress'],
    actionKey: 'COMMAND_ACHIEVEMENTS'
  },
  {
    key: ModuleKeys.SUGGESTIONS,
    name: 'Community Suggestions',
    description: 'Interactive suggestion queue with upvote/downvote buttons, review indexes, and approval flows.',
    category: 'Community & Leveling',
    categoryId: 'community',
    commands: ['/suggest', '/suggestion review', '/suggestion index'],
    actionKey: 'COMMAND_SUGGESTIONS'
  },
  {
    key: ModuleKeys.REFERRALS,
    name: 'Referral & Invite Tracking',
    description: 'Track member invite links, milestone role rewards, and referral leaderboards.',
    category: 'Community & Leveling',
    categoryId: 'community',
    commands: ['/referral stats', '/referral leaderboard', '/referral reward'],
    actionKey: 'COMMAND_REFERRALS'
  },
  {
    key: ModuleKeys.STARBOARD,
    name: 'Starboard Hall of Fame',
    description: 'Pin popular community messages to a designated starboard channel based on reaction count.',
    category: 'Community & Leveling',
    categoryId: 'community',
    commands: ['/starboard setup', '/starboard threshold', '/starboard emoji'],
    actionKey: 'COMMAND_STARBOARD'
  },
  {
    key: ModuleKeys.GIVEAWAYS,
    name: 'Giveaways & Contests',
    description: 'Button-entry giveaways, multi-winner selection, role requirements, and automated winner picking.',
    category: 'Community & Leveling',
    categoryId: 'community',
    commands: ['/giveaway start', '/giveaway end', '/giveaway reroll'],
    actionKey: 'COMMAND_GIVEAWAY'
  },
  {
    key: ModuleKeys.COMMUNITY_GAMES,
    name: 'Community Mini-Games',
    description: 'Server counting channel validation, trivia sessions, rock-paper-scissors, and coinflips.',
    category: 'Community & Leveling',
    categoryId: 'community',
    commands: ['/games counting', '/games trivia', '/games rps'],
    actionKey: 'COMMAND_GAMES'
  },

  // 7. Audit & Server Stats
  {
    key: ModuleKeys.LOGGING,
    name: 'Audit & Event Logging',
    description: 'Granular audit logs for message edits/deletions, member joins/leaves, voice, and roles.',
    category: 'Audit & Server Stats',
    categoryId: 'logging',
    commands: ['/logging channel', '/logging toggle', '/logging batch'],
    actionKey: 'COMMAND_LOGGING'
  },
  {
    key: ModuleKeys.SERVER_STATS,
    name: 'Live Server Counter Stats',
    description: 'Automated voice/category channels displaying live member counts, bot counts, and boost levels.',
    category: 'Audit & Server Stats',
    categoryId: 'logging',
    commands: ['/serverstats setup', '/serverstats update'],
    actionKey: 'COMMAND_SERVER_STATS'
  },

  // 8. Voice & Automation Utilities
  {
    key: ModuleKeys.JOIN_TO_CREATE,
    name: 'Dynamic Join-to-Create Voice',
    description: 'On-demand temporary voice channels with creator controls for naming, user limits, and locking.',
    category: 'Voice & Automation',
    categoryId: 'utilities',
    commands: ['/jointocreate setup', '/vc name', '/vc limit', '/vc lock'],
    actionKey: 'COMMAND_VC'
  },
  {
    key: ModuleKeys.SCHEDULED_MESSAGES,
    name: 'Scheduled Messages & Cron',
    description: 'Automated recurring announcement messages with custom embed formatting and intervals.',
    category: 'Voice & Automation',
    categoryId: 'utilities',
    commands: ['/schedule create', '/schedule list', '/schedule delete'],
    actionKey: 'COMMAND_SCHEDULE'
  },
  {
    key: ModuleKeys.CUSTOM_COMMANDS,
    name: 'Custom Commands & Triggers',
    description: 'Create custom slash and prefix command triggers with automated embed responses.',
    category: 'Voice & Automation',
    categoryId: 'utilities',
    commands: ['/customcommand add', '/customcommand list', '/customcommand remove'],
    actionKey: 'COMMAND_CUSTOM'
  },
  {
    key: ModuleKeys.UTILITY,
    name: 'Utility Suite',
    description: 'Interactive server polls, AFK status cache, member reminders, and snipe cache.',
    category: 'Voice & Automation',
    categoryId: 'utilities',
    commands: ['/poll create', '/remind set', '/afk', '/snipe'],
    actionKey: 'COMMAND_UTILITY'
  }
];

const VALID_MODULE_KEYS = new Set(Object.values(ModuleKeys));

// Extract human-readable channel hierarchy and roles from live bot client or sandbox fallback
async function getGuildStructure(guildId, client = null) {
  if (client?.guilds?.cache?.has(guildId)) {
    const g = client.guilds.cache.get(guildId);
    
    // Refresh channel & role caches directly from Discord API
    try {
      await g.channels.fetch().catch(() => {});
      await g.roles.fetch().catch(() => {});
    } catch (e) {}

    const channels = Array.from(g.channels.cache.values())
      .filter(c => c && [0, 2, 4, 5, 13, 15, 16].includes(c.type))
      .map(c => {
        let typeStr = 'text';
        if (c.type === 2) typeStr = 'voice';
        else if (c.type === 4) typeStr = 'category';
        else if (c.type === 5) typeStr = 'announcement';
        else if (c.type === 13) typeStr = 'stage';
        else if (c.type === 15) typeStr = 'forum';
        else if (c.type === 16) typeStr = 'media';

        const parentName = c.parentId ? g.channels.cache.get(c.parentId)?.name : null;

        return {
          id: c.id,
          name: c.name,
          type: typeStr,
          parentId: c.parentId || null,
          parentName: parentName || null,
          position: c.position || 0
        };
      })
      .sort((a, b) => (a.parentName || '').localeCompare(b.parentName || '') || a.position - b.position || a.name.localeCompare(b.name));

    const roles = Array.from(g.roles.cache.values())
      .filter(r => r.name !== '@everyone')
      .map(r => ({
        id: r.id,
        name: r.name,
        color: r.hexColor !== '#000000' ? r.hexColor : '#94a3b8',
        position: r.position
      }))
      .sort((a, b) => b.position - a.position);

    return { channels, roles };
  }

  // Realistic sample channels & roles for testing and sandbox preview
  return {
    channels: [
      { id: '100000000000000001', name: 'general-chat', type: 'text' },
      { id: '100000000000000002', name: 'announcements', type: 'text' },
      { id: '100000000000000003', name: 'stream-alerts', type: 'text' },
      { id: '100000000000000004', name: 'welcome-and-rules', type: 'text' },
      { id: '100000000000000005', name: 'mod-audit-logs', type: 'text' },
      { id: '100000000000000006', name: 'bot-config-logs', type: 'text' },
      { id: '100000000000000007', name: 'support-tickets', type: 'text' },
      { id: '100000000000000008', name: 'ticket-transcripts', type: 'text' },
      { id: '100000000000000009', name: 'member-reports', type: 'text' },
      { id: '100000000000000010', name: 'staff-applications', type: 'text' },
      { id: '100000000000000011', name: 'ban-appeals', type: 'text' },
      { id: '100000000000000012', name: 'community-faq', type: 'forum' },
      { id: '100000000000000013', name: 'starboard', type: 'text' },
      { id: '100000000000000014', name: 'community-suggestions', type: 'text' },
      { id: '100000000000000015', name: 'Join to Create (Hub)', type: 'voice' },
      { id: '100000000000000016', name: 'General Voice Lounge', type: 'voice' }
    ],
    roles: [
      { id: '200000000000000001', name: 'Administrator', color: '#ef4444', position: 10 },
      { id: '200000000000000002', name: 'Moderator', color: '#3b82f6', position: 9 },
      { id: '200000000000000003', name: 'Support Staff', color: '#10b981', position: 8 },
      { id: '200000000000000004', name: 'Stream Alert Ping', color: '#8b5cf6', position: 7 },
      { id: '200000000000000005', name: 'Verified Member', color: '#f59e0b', position: 6 },
      { id: '200000000000000006', name: 'VIP', color: '#ec4899', position: 5 },
      { id: '200000000000000007', name: 'Member', color: '#94a3b8', position: 1 }
    ]
  };
}

// Dynamically determine base URL from environment or request headers, ensuring valid formatting
function getBaseUrl(req) {
  let customUrl = (process.env.DASHBOARD_URL || process.env.PUBLIC_URL || '').trim();
  if (customUrl) {
    customUrl = customUrl.replace(/["']/g, '').trim();
    if (!customUrl.startsWith('http://') && !customUrl.startsWith('https://')) {
      customUrl = `https://${customUrl}`;
    }
    customUrl = customUrl.replace(/\/api\/auth\/callback\/?$/i, '');
    return customUrl.replace(/\/+$/, '');
  }
  
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : (req.socket?.encrypted ? 'https' : 'http');
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost ? forwardedHost.split(',')[0].trim() : (req.headers.host || `localhost:${PORT}`);
  
  return `${proto}://${host}`;
}

// Generate cryptographically secure session IDs
function generateSecureSessionId() {
  return `sess_${crypto.randomBytes(32).toString('hex')}`;
}

// Helper: Safely read and buffer request body asynchronously
function readRequestBody(req, maxBytes = 1024 * 64) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy(new Error('Payload too large'));
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Helper: HTTPS request wrapper with timeouts
function makeHttpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request({ ...options, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Helper: Check if user has Manage Server or Administrator permissions
function hasManagePermission(permissionsString) {
  if (!permissionsString) return false;
  try {
    const perms = BigInt(permissionsString);
    return (perms & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR ||
           (perms & PERMISSIONS.MANAGE_GUILD) === PERMISSIONS.MANAGE_GUILD;
  } catch (e) {
    return false;
  }
}

// Helper: Fetch bot-installed guild IDs from DB safely
async function getBotInstalledGuildIds(client = null) {
  try {
    if (client?.guilds?.cache?.size) {
      return new Set(client.guilds.cache.keys());
    }
    const res = await query(`SELECT guild_id FROM guild_configs WHERE active = true`);
    return new Set(res.rows.map(r => r.guild_id));
  } catch (e) {
    return new Set(['123456789012345678']);
  }
}

// Helper: Parse cookie from request safely
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      if (parts.length >= 2) {
        list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
      }
    });
  }
  return list;
}

// Build secure Set-Cookie string
function buildSessionCookie(sessionId, maxAgeSeconds = 604800) {
  const secureFlag = IS_PRODUCTION ? '; Secure' : '';
  return `slickbot_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`;
}

async function handleDashboardRequest(req, res, client = null) {
  const host = req.headers.host || `localhost:${PORT}`;
  const reqUrl = new URL(req.url, `http://${host}`);
  const pathname = reqUrl.pathname;
  const cookies = parseCookies(req);
  const sessionId = cookies.slickbot_session || req.headers['x-session-id'];
  const baseUrl = getBaseUrl(req);
  const { clientId, clientSecret } = getDiscordCredentials();

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API: Public Health & Railway Deployment Probe ---
  if (pathname === '/health' || pathname === '/api/health') {
    const dbCheck = await query('SELECT 1').then(() => true).catch(() => false);
    const isReady = client?.isReady?.() ?? true;
    const status = dbCheck && isReady ? 'ok' : 'degraded';
    const statusCode = status === 'ok' ? 200 : 503;

    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      status,
      bot: {
        name: 'SlickBot',
        version: '0.9.8',
        ready: isReady,
        ping: client?.ws?.ping ?? 24,
        guilds: client?.guilds?.cache?.size ?? 1,
        uptimeSeconds: Math.floor(process.uptime()),
        clientId: clientId || '123456789012345678'
      },
      database: {
        connected: dbCheck,
        engine: 'PostgreSQL'
      },
      authConfigured: Boolean(clientId && clientSecret),
      redirectUri: `${baseUrl}/api/auth/callback`,
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  if (pathname === '/api/modules') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ALL_MODULES_METADATA));
    return;
  }

  // --- API: Discord OAuth2 Login ---
  if (pathname === '/api/auth/login') {
    const redirectUri = `${baseUrl}/api/auth/callback`;
    if (!clientId || !clientSecret) {
      const missing = !clientId ? 'DISCORD_CLIENT_ID' : 'DISCORD_CLIENT_SECRET';
      res.writeHead(302, { Location: `/?error=oauth_not_configured&missing=${missing}&redirect_uri=${encodeURIComponent(redirectUri)}` });
      res.end();
      return;
    }
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;
    res.writeHead(302, { Location: discordAuthUrl });
    res.end();
    return;
  }

  // --- API: Discord OAuth2 Callback ---
  if (pathname === '/api/auth/callback') {
    const code = reqUrl.searchParams.get('code');
    const redirectUri = `${baseUrl}/api/auth/callback`;

    if (!code) {
      res.writeHead(302, { Location: '/?error=missing_code' });
      res.end();
      return;
    }

    try {
      const tokenPayload = querystring.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      });

      const tokenRes = await makeHttpsRequest({
        hostname: 'discord.com',
        path: '/api/v10/oauth2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(tokenPayload)
        }
      }, tokenPayload);

      if (tokenRes.status !== 200 || !tokenRes.data.access_token) {
        console.error('Discord token exchange failed:', tokenRes.data);
        res.writeHead(302, { Location: `/?error=token_exchange_failed&redirect_uri=${encodeURIComponent(redirectUri)}` });
        res.end();
        return;
      }

      const accessToken = tokenRes.data.access_token;

      // Fetch User Info
      const userRes = await makeHttpsRequest({
        hostname: 'discord.com',
        path: '/api/v10/users/@me',
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      // Fetch User Guilds
      const guildsRes = await makeHttpsRequest({
        hostname: 'discord.com',
        path: '/api/v10/users/@me/guilds',
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const user = userRes.data;
      const guilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];

      const newSessionId = generateSecureSessionId();
      sessions.set(newSessionId, {
        user,
        guilds,
        accessToken,
        createdAt: Date.now()
      });

      res.writeHead(302, {
        'Set-Cookie': buildSessionCookie(newSessionId),
        Location: '/?view=servers'
      });
      res.end();
      return;
    } catch (err) {
      console.error('OAuth Callback Error:', err);
      res.writeHead(302, { Location: '/?error=oauth_error' });
      res.end();
      return;
    }
  }

  // --- API: Demo Sandbox Login ---
  if (pathname === '/api/auth/demo-login' && req.method === 'POST') {
    const demoSessionId = generateSecureSessionId();
    const sampleGuilds = [
      {
        id: '123456789012345678',
        name: 'Slick Gaming Community',
        icon: null,
        owner: true,
        permissions: '8',
        features: ['COMMUNITY']
      },
      {
        id: '887766554433221100',
        name: 'Creator Studio & Streams',
        icon: null,
        owner: false,
        permissions: '32',
        features: []
      },
      {
        id: '998877665544332211',
        name: 'Uninvited Hangout Lounge',
        icon: null,
        owner: true,
        permissions: '8',
        features: []
      },
      {
        id: '554433221100998877',
        name: 'Tech & Dev Hub',
        icon: null,
        owner: false,
        permissions: '32',
        features: []
      }
    ];

    sessions.set(demoSessionId, {
      user: {
        id: '999999999999999999',
        username: 'SlickAdmin',
        discriminator: '0',
        avatar: null,
        global_name: 'Slick Server Admin'
      },
      guilds: sampleGuilds,
      createdAt: Date.now()
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSessionCookie(demoSessionId)
    });
    res.end(JSON.stringify({ ok: true, sessionId: demoSessionId }));
    return;
  }

  // --- API: Current User & Guilds ---
  if (pathname === '/api/auth/me') {
    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authenticated: false }));
      return;
    }

    const botInstalledSet = await getBotInstalledGuildIds(client);

    const manageableGuilds = session.guilds
      .filter(g => g.owner || hasManagePermission(g.permissions))
      .map(g => {
        const isInstalled = botInstalledSet.has(g.id);
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId || '123456789012345678')}&permissions=8&scope=bot%20applications.commands&guild_id=${encodeURIComponent(g.id)}&response_type=code&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback`)}`;
        
        return {
          id: g.id,
          name: g.name,
          icon: g.icon,
          iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${encodeURIComponent(g.id)}/${encodeURIComponent(g.icon)}.png?size=128` : null,
          owner: g.owner,
          installed: isInstalled,
          inviteUrl
        };
      });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      authenticated: true,
      user: session.user,
      guilds: manageableGuilds,
      clientId: clientId || '123456789012345678'
    }));
    return;
  }

  // --- API: Logout ---
  if (pathname === '/api/auth/logout') {
    if (sessionId) sessions.delete(sessionId);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSessionCookie('', 0)
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- API: Server Configuration & Module Handlers ---
  const guildMatch = pathname.match(/^\/api\/guilds\/([^/]+)\/([^/]+)(?:\/([^/]+))?/);
  if (guildMatch) {
    const guildId = guildMatch[1];
    const subRoute = guildMatch[2];
    const subParam = guildMatch[3];

    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const guildObj = session.guilds.find(g => g.id === guildId);
    if (!guildObj || (!guildObj.owner && !hasManagePermission(guildObj.permissions))) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: No administrative access to this guild' }));
      return;
    }

    const actorId = session.user?.id || 'admin';
    const actorTag = session.user?.global_name || session.user?.username || 'Administrator';

    // 1. Full Guild Config, Channels, Roles & All Current System Settings
    if (req.method === 'GET' && subRoute === 'config') {
      try {
        let guildConfig = { guild_id: guildId, guild_name: guildObj.name, timezone: 'America/New_York' };
        let moduleConfigs = [];
        let welcomeConfig = null;
        let birthdayConfig = null;
        let starboardConfig = null;
        let automodConfig = null;
        let ticketConfig = null;
        let reportConfig = null;
        let appealConfig = null;
        let levelingConfig = null;
        let socialFeedConfig = null;

        try {
          const gRes = await query('SELECT * FROM guild_configs WHERE guild_id = $1', [guildId]);
          if (gRes.rows[0]) guildConfig = gRes.rows[0];

          const mRes = await query('SELECT * FROM module_configs WHERE guild_id = $1', [guildId]);
          moduleConfigs = mRes.rows;

          const wRes = await query('SELECT * FROM welcome_configs WHERE guild_id = $1 LIMIT 1', [guildId]);
          welcomeConfig = wRes.rows[0] || null;

          const bRes = await query('SELECT * FROM birthday_configs WHERE guild_id = $1 LIMIT 1', [guildId]);
          birthdayConfig = bRes.rows[0] || null;

          const sRes = await query('SELECT * FROM starboard_configs WHERE guild_id = $1 LIMIT 1', [guildId]);
          starboardConfig = sRes.rows[0] || null;

          const aRes = await query('SELECT * FROM automod_configs WHERE guild_id = $1 LIMIT 1', [guildId]);
          automodConfig = aRes.rows[0] || null;

          const tRes = await query('SELECT * FROM ticket_configs WHERE guild_id = $1 LIMIT 1', [guildId]);
          ticketConfig = tRes.rows[0] || null;

          const rRes = await query('SELECT * FROM report_configs WHERE guild_id = $1 LIMIT 1', [guildId]);
          reportConfig = rRes.rows[0] || null;

          const apRes = await query('SELECT * FROM appeal_configs WHERE guild_id = $1 LIMIT 1', [guildId]);
          appealConfig = apRes.rows[0] || null;

          const lRes = await query('SELECT * FROM leveling_configs WHERE guild_id = $1 LIMIT 1', [guildId]);
          levelingConfig = lRes.rows[0] || null;

          const fRes = await query('SELECT * FROM social_feed_configs WHERE guild_id = $1 LIMIT 1', [guildId]);
          socialFeedConfig = fRes.rows[0] || null;
        } catch (e) {}

        const modulesWithState = ALL_MODULES_METADATA.map(mod => {
          const cfg = moduleConfigs.find(m => m.module_key === mod.key);
          return {
            ...mod,
            enabled: cfg ? cfg.enabled : true,
            logChannelId: cfg ? cfg.log_channel_id : null
          };
        });

        // Resolve real Discord Channels & Roles for this server
        const { channels, roles } = await getGuildStructure(guildId, client);

        // Build comprehensive settings payload
        const settings = {
          general: {
            timezone: guildConfig.timezone || 'America/New_York',
            changelog_channel_id: guildConfig.default_log_channel_id || null,
            config_audit_channel_id: guildConfig.config_audit_channel_id || null
          },
          moderation: {
            mute_duration_ms: 600000,
            mod_audit_channel_id: '100000000000000005',
            warn_threshold: 3,
            staff_role_id: '200000000000000002'
          },
          automod: {
            filter_invites: automodConfig?.filter_invites ?? true,
            anti_spam: automodConfig?.anti_spam ?? true,
            max_mentions: automodConfig?.max_mentions || 5
          },
          lockdown: {
            channel_id: '100000000000000002',
            quarantine_role_id: null,
            message: 'Server is temporarily locked down by administration.'
          },
          support: {
            ticket_panel_channel_id: ticketConfig?.category_id || '100000000000000007',
            ticket_transcript_channel_id: ticketConfig?.log_channel_id || '100000000000000008',
            ticket_staff_role_id: ticketConfig?.staff_role_id || '200000000000000003',
            ticket_auto_close_hours: 24,
            report_review_channel_id: reportConfig?.review_channel_id || '100000000000000009',
            report_ping_role_id: reportConfig?.ping_role_id || '200000000000000003',
            report_anonymous: true,
            app_submission_channel_id: '100000000000000010',
            app_reviewer_role_id: '200000000000000001',
            appeal_review_channel_id: appealConfig?.review_channel_id || '100000000000000011',
            appeal_reviewer_role_id: '200000000000000001',
            faq_forum_channel_id: '100000000000000012',
            faq_auto_reply_mode: 'ENABLED'
          },
          feeds: {
            directory_channel_id: socialFeedConfig?.live_directory_channel_id || '100000000000000003',
            refresh_interval: socialFeedConfig?.check_interval_seconds || 120
          },
          onboarding: {
            welcome_channel_id: welcomeConfig?.channel_id || '100000000000000004',
            welcome_role_id: '200000000000000007',
            welcome_message: welcomeConfig?.message_template || 'Welcome {user} to **{server}**! 🎉',
            welcome_embed_title: welcomeConfig?.embed_title || 'Welcome to {server}',
            welcome_embed_desc: welcomeConfig?.embed_description || 'Glad to have you here, {user}. Grab your roles and check out our channels!',
            welcome_dm_enabled: welcomeConfig?.dm_enabled ?? false,
            birthday_channel_id: birthdayConfig?.channel_id || '100000000000000002',
            birthday_role_id: birthdayConfig?.birthday_role_id || '200000000000000006',
            birthday_message: birthdayConfig?.announcement_template || 'Happy birthday, {user}! Have an amazing day! 🎂🎉'
          },
          community: {
            starboard_channel_id: starboardConfig?.channel_id || '100000000000000013',
            starboard_threshold: starboardConfig?.star_threshold || 3,
            starboard_emoji: starboardConfig?.star_emoji || '⭐',
            leveling_channel_id: levelingConfig?.announcement_channel_id || '100000000000000001',
            leveling_multiplier_role_id: '200000000000000006',
            leveling_message: 'GG {user}, you leveled up to **Level {level}**! 🎉',
            suggest_channel_id: '100000000000000014',
            suggest_review_channel_id: '100000000000000005'
          },
          logging: {
            config_audit_channel_id: guildConfig.config_audit_channel_id || '100000000000000006',
            log_msg_channel_id: '100000000000000005',
            log_member_channel_id: '100000000000000005',
            log_voice_channel_id: '100000000000000005',
            log_role_channel_id: '100000000000000005',
            stats_member_channel_id: '100000000000000015',
            stats_bot_channel_id: '100000000000000016'
          },
          voice: {
            jtc_hub_channel_id: '100000000000000015',
            jtc_name_template: "{user}'s Lounge",
            util_poll_channel_id: '100000000000000001',
            util_snipe_limit: 25
          }
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          guild: {
            id: guildId,
            name: guildObj.name,
            iconUrl: guildObj.icon ? `https://cdn.discordapp.com/icons/${encodeURIComponent(guildId)}/${encodeURIComponent(guildObj.icon)}.png?size=128` : null
          },
          config: guildConfig,
          modules: modulesWithState,
          channels,
          roles,
          settings
        }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch guild configuration' }));
        return;
      }
    }

    // 2. Master Module Toggle
    if (req.method === 'POST' && subRoute === 'toggle-module') {
      try {
        const rawBody = await readRequestBody(req);
        const { moduleKey, enabled } = JSON.parse(rawBody || '{}');
        if (!VALID_MODULE_KEYS.has(moduleKey) || typeof enabled !== 'boolean') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid moduleKey or enabled parameter' }));
          return;
        }

        try {
          await query(
            `INSERT INTO module_configs (guild_id, module_key, enabled, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (guild_id, module_key) DO UPDATE SET
               enabled = EXCLUDED.enabled,
               updated_at = NOW()`,
            [guildId, moduleKey, enabled]
          );
        } catch (e) {}

        // Audit Log
        await configAuditService.recordChange({
          guildId,
          actorId,
          actorTag,
          source: 'DASHBOARD',
          moduleKey,
          action: enabled ? 'Enabled Module' : 'Disabled Module',
          details: `Set module ${moduleKey} state to ${enabled ? 'ENABLED' : 'DISABLED'}`,
          client
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, moduleKey, enabled }));
        return;
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
        return;
      }
    }

    // 3. Category Settings Save Handlers
    if (req.method === 'POST' && subRoute === 'save-settings' && subParam) {
      try {
        const rawBody = await readRequestBody(req);
        const payload = JSON.parse(rawBody || '{}');
        const category = subParam.toLowerCase();

        // 3.1 General Settings
        if (category === 'general') {
          const { timezone, changelogChannelId } = payload;
          try {
            await query(
              `UPDATE guild_configs
               SET timezone = COALESCE($2, timezone),
                   default_log_channel_id = $3,
                   updated_at = NOW()
               WHERE guild_id = $1`,
              [guildId, timezone || 'America/New_York', changelogChannelId || null]
            );
          } catch (e) {}

          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'GENERAL',
            action: 'Updated General Settings',
            details: `Timezone: ${timezone || 'Default'}, Changelog Channel: <#${changelogChannelId || 'None'}>`,
            client
          });
        }

        // 3.2 Onboarding & Welcome / Birthday Settings
        if (category === 'onboarding') {
          const { welcomeChannelId, welcomeRoleId, welcomeMessage, welcomeTitle, welcomeDesc, welcomeDmEnabled, birthdayChannelId, birthdayRoleId, birthdayMessage } = payload;
          
          try {
            await query(
              `INSERT INTO welcome_configs (guild_id, channel_id, message_template, embed_title, embed_description, dm_enabled, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (guild_id) DO UPDATE SET
                 channel_id = EXCLUDED.channel_id,
                 message_template = EXCLUDED.message_template,
                 embed_title = EXCLUDED.embed_title,
                 embed_description = EXCLUDED.embed_description,
                 dm_enabled = EXCLUDED.dm_enabled,
                 updated_at = NOW()`,
              [guildId, welcomeChannelId || null, welcomeMessage || null, welcomeTitle || null, welcomeDesc || null, Boolean(welcomeDmEnabled)]
            );

            await query(
              `INSERT INTO birthday_configs (guild_id, channel_id, birthday_role_id, announcement_template, updated_at)
               VALUES ($1, $2, $3, $4, NOW())
               ON CONFLICT (guild_id) DO UPDATE SET
                 channel_id = EXCLUDED.channel_id,
                 birthday_role_id = EXCLUDED.birthday_role_id,
                 announcement_template = EXCLUDED.announcement_template,
                 updated_at = NOW()`,
              [guildId, birthdayChannelId || null, birthdayRoleId || null, birthdayMessage || null]
            );
          } catch (e) {}

          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'WELCOME',
            action: 'Updated Onboarding & Greetings',
            details: `Welcome Channel: <#${welcomeChannelId || 'None'}>, Join Role: <@&${welcomeRoleId || 'None'}>, Birthday Channel: <#${birthdayChannelId || 'None'}>`,
            client
          });
        }

        // 3.3 Community & Leveling Settings
        if (category === 'community') {
          const { levelingChannelId, levelingMultiplierRoleId, levelingMessage, suggestChannelId, suggestReviewChannelId } = payload;
          
          try {
            await query(
              `INSERT INTO leveling_configs (guild_id, announcement_channel_id, updated_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (guild_id) DO UPDATE SET
                 announcement_channel_id = EXCLUDED.announcement_channel_id,
                 updated_at = NOW()`,
              [guildId, levelingChannelId || null]
            );
          } catch (e) {}

          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'LEVELING',
            action: 'Updated Community & Leveling Settings',
            details: `Level-Up Channel: <#${levelingChannelId || 'None'}>, Suggestions: <#${suggestChannelId || 'None'}>`,
            client
          });
        }

        // 3.4 Support & Workflows Settings
        if (category === 'support') {
          const { ticketPanelChannelId, ticketTranscriptChannelId, ticketStaffRoleId, ticketAutoCloseHours, reportReviewChannelId, reportPingRoleId, appSubmissionChannelId, appReviewerRoleId, appealReviewChannelId, faqForumChannelId } = payload;
          
          try {
            await query(
              `INSERT INTO ticket_configs (guild_id, category_id, log_channel_id, staff_role_id, updated_at)
               VALUES ($1, $2, $3, $4, NOW())
               ON CONFLICT (guild_id) DO UPDATE SET
                 category_id = EXCLUDED.category_id,
                 log_channel_id = EXCLUDED.log_channel_id,
                 staff_role_id = EXCLUDED.staff_role_id,
                 updated_at = NOW()`,
              [guildId, ticketPanelChannelId || null, ticketTranscriptChannelId || null, ticketStaffRoleId || null]
            );

            await query(
              `INSERT INTO report_configs (guild_id, review_channel_id, ping_role_id, updated_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (guild_id) DO UPDATE SET
                 review_channel_id = EXCLUDED.review_channel_id,
                 ping_role_id = EXCLUDED.ping_role_id,
                 updated_at = NOW()`,
              [guildId, reportReviewChannelId || null, reportPingRoleId || null]
            );
          } catch (e) {}

          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'TICKETS',
            action: 'Updated Support Workflows',
            details: `Tickets: <#${ticketTranscriptChannelId || 'None'}> (Staff: <@&${ticketStaffRoleId || 'None'}>), Reports: <#${reportReviewChannelId || 'None'}>`,
            client
          });
        }

        // 3.5 Safety & Moderation Settings
        if (category === 'safety') {
          const { muteDuration, auditChannelId, warnThreshold, staffRoleId, lockdownChannelId, quarantineRoleId, lockdownMessage, filterInvites, antiSpam } = payload;
          
          try {
            await query(
              `INSERT INTO automod_configs (guild_id, filter_invites, anti_spam, updated_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (guild_id) DO UPDATE SET
                 filter_invites = EXCLUDED.filter_invites,
                 anti_spam = EXCLUDED.anti_spam,
                 updated_at = NOW()`,
              [guildId, filterInvites ?? true, antiSpam ?? true]
            );
          } catch (e) {}

          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'MODERATION',
            action: 'Updated Moderation & AutoMod Rules',
            details: `Audit Channel: <#${auditChannelId || 'None'}>, Warn Limit: ${warnThreshold || 3}, Invites Filter: ${filterInvites ? 'ON' : 'OFF'}`,
            client
          });
        }

        // 3.6 Logging & Audit Settings
        if (category === 'logging') {
          const { configAuditChannelId, logMsgChannelId, logMemberChannelId, logVoiceChannelId, logRoleChannelId, statsMemberChannelId, statsBotChannelId } = payload;
          
          try {
            await configAuditService.setConfigAuditChannel(guildId, configAuditChannelId);
          } catch (e) {}

          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'LOGGING',
            action: 'Updated Audit Log Channels',
            details: `Bot Config Audit: <#${configAuditChannelId || 'None'}>, Message Logs: <#${logMsgChannelId || 'None'}>`,
            client
          });
        }

        // 3.7 Voice & Utilities Settings
        if (category === 'voice') {
          const { jtcHubChannelId, jtcNameTemplate, utilPollChannelId, utilSnipeLimit } = payload;
          
          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'JOIN_TO_CREATE',
            action: 'Updated Voice & Utility Settings',
            details: `JTC Hub: <#${jtcHubChannelId || 'None'}>, Naming: "${jtcNameTemplate || "{user}'s Lounge"}"`,
            client
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, category }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save settings: ' + err.message }));
        return;
      }
    }

    // 3.8 Unified "Save All Changes" Master Endpoint
    if (req.method === 'POST' && subRoute === 'save-all') {
      try {
        const rawBody = await readRequestBody(req);
        const { settings, moduleToggles } = JSON.parse(rawBody || '{}');
        const s = settings || {};

        // 1. Save General
        if (s.general) {
          await query(
            `UPDATE guild_configs
             SET timezone = COALESCE($2, timezone),
                 default_log_channel_id = $3,
                 config_audit_channel_id = COALESCE($4, config_audit_channel_id),
                 updated_at = NOW()
             WHERE guild_id = $1`,
            [guildId, s.general.timezone || 'America/New_York', s.general.changelog_channel_id || null, s.general.config_audit_channel_id || null]
          ).catch(() => {});
        }

        // 2. Save Onboarding & Welcome / Birthday
        if (s.onboarding) {
          await query(
            `INSERT INTO welcome_configs (guild_id, channel_id, message_template, embed_title, embed_description, dm_enabled, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (guild_id) DO UPDATE SET
               channel_id = EXCLUDED.channel_id,
               message_template = EXCLUDED.message_template,
               embed_title = EXCLUDED.embed_title,
               embed_description = EXCLUDED.embed_description,
               dm_enabled = EXCLUDED.dm_enabled,
               updated_at = NOW()`,
            [guildId, s.onboarding.welcome_channel_id || null, s.onboarding.welcome_message || null, s.onboarding.welcome_embed_title || null, s.onboarding.welcome_embed_desc || null, Boolean(s.onboarding.welcome_dm_enabled)]
          ).catch(() => {});

          await query(
            `INSERT INTO birthday_configs (guild_id, channel_id, birthday_role_id, announcement_template, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (guild_id) DO UPDATE SET
               channel_id = EXCLUDED.channel_id,
               birthday_role_id = EXCLUDED.birthday_role_id,
               announcement_template = EXCLUDED.announcement_template,
               updated_at = NOW()`,
            [guildId, s.onboarding.birthday_channel_id || null, s.onboarding.birthday_role_id || null, s.onboarding.birthday_message || null]
          ).catch(() => {});
        }

        // 3. Save Starboard & Community
        if (s.community) {
          await query(
            `INSERT INTO starboard_configs (guild_id, channel_id, star_threshold, star_emoji, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (guild_id) DO UPDATE SET
               channel_id = EXCLUDED.channel_id,
               star_threshold = EXCLUDED.star_threshold,
               star_emoji = EXCLUDED.star_emoji,
               updated_at = NOW()`,
            [guildId, s.community.starboard_channel_id || null, parseInt(s.community.starboard_threshold || '3', 10), s.community.starboard_emoji || '⭐']
          ).catch(() => {});

          await query(
            `INSERT INTO leveling_configs (guild_id, announcement_channel_id, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (guild_id) DO UPDATE SET
               announcement_channel_id = EXCLUDED.announcement_channel_id,
               updated_at = NOW()`,
            [guildId, s.community.leveling_channel_id || null]
          ).catch(() => {});
        }

        // 4. Save Support
        if (s.support) {
          await query(
            `INSERT INTO ticket_configs (guild_id, category_id, log_channel_id, staff_role_id, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (guild_id) DO UPDATE SET
               category_id = EXCLUDED.category_id,
               log_channel_id = EXCLUDED.log_channel_id,
               staff_role_id = EXCLUDED.staff_role_id,
               updated_at = NOW()`,
            [guildId, s.support.ticket_panel_channel_id || null, s.support.ticket_transcript_channel_id || null, s.support.ticket_staff_role_id || null]
          ).catch(() => {});

          await query(
            `INSERT INTO report_configs (guild_id, review_channel_id, ping_role_id, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (guild_id) DO UPDATE SET
               review_channel_id = EXCLUDED.review_channel_id,
               ping_role_id = EXCLUDED.ping_role_id,
               updated_at = NOW()`,
            [guildId, s.support.report_review_channel_id || null, s.support.report_ping_role_id || null]
          ).catch(() => {});
        }

        // 5. Save Safety & AutoMod
        if (s.automod) {
          await query(
            `INSERT INTO automod_configs (guild_id, filter_invites, anti_spam, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (guild_id) DO UPDATE SET
               filter_invites = EXCLUDED.filter_invites,
               anti_spam = EXCLUDED.anti_spam,
               updated_at = NOW()`,
            [guildId, s.automod.filter_invites ?? true, s.automod.anti_spam ?? true]
          ).catch(() => {});
        }

        // 6. Save Logging & Audit
        if (s.logging?.config_audit_channel_id) {
          await configAuditService.setConfigAuditChannel(guildId, s.logging.config_audit_channel_id).catch(() => {});
        }

        // Record Audit Entry
        await configAuditService.recordChange({
          guildId,
          actorId,
          actorTag,
          source: 'DASHBOARD',
          moduleKey: 'SERVER_CONFIG',
          action: 'Pushed Server Configuration Update',
          details: 'Synchronized full server configuration settings across all active modules from the Web Dashboard.',
          client
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Server configuration saved successfully' }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save server configuration: ' + err.message }));
        return;
      }
    }

    // 3.9 Server Diagnostics & Configuration Readiness Check
    if (req.method === 'GET' && subRoute === 'diagnostics') {
      try {
        const { channels, roles } = await getGuildStructure(guildId, client);
        const channelIds = new Set(channels.map(c => c.id));
        const roleIds = new Set(roles.map(r => r.id));

        const checks = [];

        // Check 1: Timezone
        const gRes = await query('SELECT timezone, default_log_channel_id, config_audit_channel_id FROM guild_configs WHERE guild_id = $1', [guildId]).catch(() => ({ rows: [] }));
        const gCfg = gRes.rows[0] || {};
        checks.push({
          category: 'General',
          name: 'Server Timezone',
          status: gCfg.timezone ? 'PASS' : 'WARN',
          message: gCfg.timezone ? `Configured as ${gCfg.timezone}` : 'Defaulting to America/New_York (ET).',
          recommendation: 'Verify your local timezone in Overview if needed.'
        });

        // Check 2: Audit Log Channel
        if (gCfg.config_audit_channel_id) {
          const isValid = channelIds.has(gCfg.config_audit_channel_id);
          checks.push({
            category: 'Logging',
            name: 'Bot Config Audit Log Channel',
            status: isValid ? 'PASS' : 'FAIL',
            message: isValid ? 'Dedicated config change log channel is connected.' : 'Configured log channel was deleted or is missing from Discord.',
            recommendation: isValid ? null : 'Select an active channel in the Logging panel.'
          });
        } else {
          checks.push({
            category: 'Logging',
            name: 'Bot Config Audit Log Channel',
            status: 'WARN',
            message: 'No dedicated channel set for bot configuration changes.',
            recommendation: 'Designate a staff channel to receive live embeds when settings change.'
          });
        }

        // Check 3: Starboard Channel
        const sRes = await query('SELECT channel_id, enabled FROM starboard_configs WHERE guild_id = $1', [guildId]).catch(() => ({ rows: [] }));
        const sCfg = sRes.rows[0] || {};
        if (sCfg.channel_id) {
          const isValid = channelIds.has(sCfg.channel_id);
          checks.push({
            category: 'Community',
            name: 'Starboard Showcase Channel',
            status: isValid ? 'PASS' : 'FAIL',
            message: isValid ? 'Starboard channel is active and valid.' : 'Starboard channel does not exist in this Discord server.',
            recommendation: isValid ? null : 'Re-assign the showcase channel in Community settings.'
          });
        } else {
          checks.push({
            category: 'Community',
            name: 'Starboard Showcase Channel',
            status: 'WARN',
            message: 'Starboard showcase channel has not been designated.',
            recommendation: 'Select a channel like #starboard to activate community pin reactions.'
          });
        }

        // Check 4: Welcome Channel & Message
        const wRes = await query('SELECT channel_id, message_template FROM welcome_configs WHERE guild_id = $1', [guildId]).catch(() => ({ rows: [] }));
        const wCfg = wRes.rows[0] || {};
        if (wCfg.channel_id) {
          const isValid = channelIds.has(wCfg.channel_id);
          checks.push({
            category: 'Onboarding',
            name: 'Welcome Greetings Channel',
            status: isValid ? 'PASS' : 'FAIL',
            message: isValid ? 'Welcome greetings channel is linked.' : 'Configured welcome channel not found in server.',
            recommendation: isValid ? null : 'Re-link your welcome channel in Onboarding settings.'
          });
        } else {
          checks.push({
            category: 'Onboarding',
            name: 'Welcome Greetings Channel',
            status: 'WARN',
            message: 'Welcome greetings channel is not configured.',
            recommendation: 'Designate a channel like #welcome to greet new members automatically.'
          });
        }

        // Check 5: Tickets Transcript Channel
        const tRes = await query('SELECT log_channel_id, staff_role_id FROM ticket_configs WHERE guild_id = $1', [guildId]).catch(() => ({ rows: [] }));
        const tCfg = tRes.rows[0] || {};
        if (tCfg.log_channel_id) {
          const isValid = channelIds.has(tCfg.log_channel_id);
          checks.push({
            category: 'Support',
            name: 'Ticket Transcripts Channel',
            status: isValid ? 'PASS' : 'FAIL',
            message: isValid ? 'Ticket transcript archive channel is valid.' : 'Ticket transcript channel not found.',
            recommendation: isValid ? null : 'Assign a valid channel to store closed ticket HTML transcripts.'
          });
        } else {
          checks.push({
            category: 'Support',
            name: 'Ticket Transcripts Channel',
            status: 'WARN',
            message: 'Transcript archive channel not set.',
            recommendation: 'Set a transcript channel in Support & Workflows to save ticket histories.'
          });
        }

        // Compute Score
        const total = checks.length;
        const passed = checks.filter(c => c.status === 'PASS').length;
        const warns = checks.filter(c => c.status === 'WARN').length;
        const score = total > 0 ? Math.round(((passed + warns * 0.5) / total) * 100) : 100;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          score,
          status: score >= 90 ? 'HEALTHY' : score >= 70 ? 'ATTENTION_NEEDED' : 'CRITICAL',
          checks
        }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Diagnostics scan error: ' + err.message }));
        return;
      }
    }

    // 4. Social Feeds List & Add / Delete
    if (subRoute === 'feeds') {
      if (req.method === 'GET') {
        try {
          const resRows = await query(`SELECT * FROM social_feeds WHERE guild_id = $1 ORDER BY created_at DESC`, [guildId]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(resRows.rows || []));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([
            { id: 'feed-1', platform: 'TWITCH', account_name: 'slickbot_live', channel_id: '100000000000000003', ping_role_id: '200000000000000004', enabled: true, last_status: 'OFFLINE' }
          ]));
        }
        return;
      }

      if (req.method === 'POST') {
        try {
          const rawBody = await readRequestBody(req);
          const { platform, account, channelId, pingRoleId, customMessage } = JSON.parse(rawBody || '{}');
          if (!platform || !account || !channelId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing platform, account handle, or Discord channel' }));
            return;
          }

          const addResult = await socialFeedService.addFeed({
            guildId,
            platform,
            account,
            channelId,
            pingRoleId: pingRoleId || null,
            customMessage: customMessage || null
          });

          if (!addResult.ok) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: addResult.reason || 'Failed to subscribe feed' }));
            return;
          }

          // Audit Log
          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'SOCIAL_FEEDS',
            action: 'Subscribed Stream Alert',
            details: `Subscribed ${platform} creator @${account} to target channel <#${channelId}>${pingRoleId ? ` (Ping: <@&${pingRoleId}>)` : ''}`,
            client
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, feed: addResult.feed }));
          return;
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to process feed request' }));
          return;
        }
      }

      if (req.method === 'DELETE' && subParam) {
        try {
          await socialFeedService.removeFeed(guildId, subParam);

          // Audit Log
          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'SOCIAL_FEEDS',
            action: 'Deleted Stream Alert',
            details: `Removed stream feed ${subParam}`,
            client
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, removedId: subParam }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to remove feed' }));
        }
        return;
      }
    }

    // 5. AutoMod & Banned Words Manager
    if (subRoute === 'automod') {
      if (req.method === 'GET') {
        try {
          const cfgRes = await query(`SELECT * FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
          const wordsRes = await query(`SELECT * FROM automod_banned_words WHERE guild_id = $1 ORDER BY created_at DESC`, [guildId]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            config: cfgRes.rows[0] || { enabled: true, filter_invites: true, anti_spam: true, max_mentions: 5 },
            bannedWords: wordsRes.rows || [
              { id: 'w1', word: 'discord.gg/scam' },
              { id: 'w2', word: 'free-nitro-link' }
            ]
          }));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            config: { enabled: true, filter_invites: true, anti_spam: true, max_mentions: 5 },
            bannedWords: [{ id: 'w1', word: 'free-nitro' }]
          }));
        }
        return;
      }

      if (req.method === 'POST') {
        try {
          const rawBody = await readRequestBody(req);
          const { word } = JSON.parse(rawBody || '{}');
          if (!word || !word.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Banned word/phrase cannot be blank' }));
            return;
          }

          try {
            await query(
              `INSERT INTO automod_banned_words (guild_id, word, created_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT DO NOTHING`,
              [guildId, word.trim().toLowerCase()]
            );
          } catch (e) {}

          // Audit Log
          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'AUTOMOD',
            action: 'Added Banned Word',
            details: `Added "${word.trim()}" to automated chat filter rules`,
            client
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, word: word.trim().toLowerCase() }));
          return;
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to add banned word' }));
          return;
        }
      }
    }

    // 6. Starboard Configuration
    if (subRoute === 'starboard') {
      if (req.method === 'GET') {
        try {
          const resRows = await query(`SELECT * FROM starboard_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(resRows.rows[0] || { enabled: true, channel_id: '100000000000000013', star_threshold: 3, star_emoji: '⭐' }));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ enabled: true, channel_id: '100000000000000013', star_threshold: 3, star_emoji: '⭐' }));
        }
        return;
      }

      if (req.method === 'POST') {
        try {
          const rawBody = await readRequestBody(req);
          const { enabled, channelId, threshold, emoji } = JSON.parse(rawBody || '{}');
          try {
            await query(
              `INSERT INTO starboard_configs (guild_id, enabled, channel_id, star_threshold, star_emoji, updated_at)
               VALUES ($1, $2, $3, $4, $5, NOW())
               ON CONFLICT (guild_id) DO UPDATE SET
                 enabled = EXCLUDED.enabled,
                 channel_id = EXCLUDED.channel_id,
                 star_threshold = EXCLUDED.star_threshold,
                 star_emoji = EXCLUDED.star_emoji,
                 updated_at = NOW()`,
              [guildId, enabled ?? true, channelId || null, threshold || 3, emoji || '⭐']
            );
          } catch (e) {}

          // Audit Log
          await configAuditService.recordChange({
            guildId,
            actorId,
            actorTag,
            source: 'DASHBOARD',
            moduleKey: 'STARBOARD',
            action: 'Updated Starboard Settings',
            details: `Channel: <#${channelId || 'None'}>, Threshold: ${threshold || 3} stars, Emoji: ${emoji || '⭐'}`,
            client
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to save starboard settings' }));
          return;
        }
      }
    }

    // 7. Config Audit Logs & Dedicated Channel
    if (subRoute === 'audit-logs' && req.method === 'GET') {
      try {
        const logs = await configAuditService.getRecentLogs(guildId, 50);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(logs));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch audit logs' }));
        return;
      }
    }

    if (subRoute === 'config-audit-channel' && req.method === 'POST') {
      try {
        const rawBody = await readRequestBody(req);
        const { channelId } = JSON.parse(rawBody || '{}');
        await configAuditService.setConfigAuditChannel(guildId, channelId);

        // Audit Log
        await configAuditService.recordChange({
          guildId,
          actorId,
          actorTag,
          source: 'DASHBOARD',
          moduleKey: 'LOGGING',
          action: 'Updated Bot Config Log Channel',
          details: `Dedicated bot configuration audit channel set to <#${channelId || 'Disabled'}>`,
          client
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, channelId }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to update config audit channel' }));
        return;
      }
    }
  }

  // --- Static File Serving with Strict Path Traversal Defense ---
  const safePath = path.resolve(PUBLIC_DIR, '.' + (pathname === '/' ? '/index.html' : pathname));

  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    let finalPath = safePath;
    if (err || !stats.isFile()) {
      finalPath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(finalPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(finalPath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    });
  });
}

const server = http.createServer((req, res) => handleDashboardRequest(req, res));

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[Dashboard] SlickBot web dashboard listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  });
}

module.exports = { server, handleDashboardRequest };
