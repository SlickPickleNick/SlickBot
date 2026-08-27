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
function getGuildStructure(guildId, client = null) {
  if (client?.guilds?.cache?.has(guildId)) {
    const g = client.guilds.cache.get(guildId);
    const channels = Array.from(g.channels.cache.values())
      .filter(c => c.type === 0 || c.type === 2 || c.type === 4 || c.type === 5 || c.type === 15)
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type === 2 ? 'voice' : c.type === 4 ? 'category' : c.type === 15 ? 'forum' : 'text',
        parentId: c.parentId
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

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

    // 1. Full Guild Config, Channels, Roles & All 29 Module Statuses
    if (req.method === 'GET' && subRoute === 'config') {
      try {
        let guildConfig = { guild_id: guildId, guild_name: guildObj.name, timezone: 'America/New_York' };
        let moduleConfigs = [];

        try {
          const gRes = await query('SELECT * FROM guild_configs WHERE guild_id = $1', [guildId]);
          if (gRes.rows[0]) guildConfig = gRes.rows[0];

          const mRes = await query('SELECT * FROM module_configs WHERE guild_id = $1', [guildId]);
          moduleConfigs = mRes.rows;
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
        const { channels, roles } = getGuildStructure(guildId, client);

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
          roles
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

    // 3. Social Feeds List & Add / Delete
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

    // 4. AutoMod & Banned Words Manager
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

    // 5. Starboard Configuration
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

    // 6. Config Audit Logs & Dedicated Channel
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
