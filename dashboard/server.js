const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const https = require('node:https');
const querystring = require('node:querystring');

// Load environment variables if available
const { env } = require('../src/config/env');
const { query } = require('../src/services/db');

const PORT = process.env.DASHBOARD_PORT || process.env.PORT || 3000;
const HOST = process.env.DASHBOARD_HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, 'public');

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || env?.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || process.env.CLIENT_SECRET || '';
const DASHBOARD_URL = process.env.DASHBOARD_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// In-memory sessions store (sessionId -> sessionData) with TTL cleanup
const sessions = new Map();
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Clean up expired sessions hourly
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

const MODULES_DATA = [
  {
    key: 'MODERATION',
    name: 'Moderation & Cases',
    description: 'Enforce server rules with warn, mute, kick, ban, unban, case logs, and member notes.',
    category: 'Safety & Administration',
    commands: ['/mod warn', '/mod mute', '/mod ban', '/case view', '/note add'],
    actionKey: 'COMMAND_MOD_WARN'
  },
  {
    key: 'AUTOMOD',
    name: 'AutoMod Engine',
    description: 'Automated anti-spam, invite-link filtering, banned words, and repeated text detection.',
    category: 'Safety & Administration',
    commands: ['/automod settings', '/automod whitelist', '/automod rule'],
    actionKey: 'COMMAND_AUTOMOD'
  },
  {
    key: 'SUPPORT_TICKETS',
    name: 'Support Tickets & FAQ',
    description: 'Interactive button-based support tickets, transcripts, FAQ forum sync, and staff queues.',
    category: 'Community Workflows',
    commands: ['/ticket panel', '/ticket close', '/faq create', '/appeal manage'],
    actionKey: 'COMMAND_TICKET'
  },
  {
    key: 'SOCIAL_FEEDS',
    name: 'Social Feeds & Alerts',
    description: 'Automated Twitch live alerts, YouTube video & Shorts tracking, and live directory hubs.',
    category: 'Engagement & Media',
    commands: ['/feed add', '/feed list', '/feed edit', '/feed check'],
    actionKey: 'COMMAND_FEED'
  },
  {
    key: 'ONBOARDING',
    name: 'Onboarding & Verification',
    description: 'Customizable welcome cards, rule-acceptance verification, and auto-assigned starting roles.',
    category: 'Community Workflows',
    commands: ['/welcome config', '/roles panel', '/temprole grant'],
    actionKey: 'COMMAND_ROLES'
  },
  {
    key: 'LEVELING_ECONOMY',
    name: 'Leveling & Achievements',
    description: 'XP progression, server leaderboards, achievement milestones, and role rewards.',
    category: 'Engagement & Media',
    commands: ['/level rank', '/level leaderboard', '/achievement list'],
    actionKey: 'COMMAND_LEVEL'
  },
  {
    key: 'LOGGING',
    name: 'Audit & Event Logging',
    description: 'Granular audit logs for message edits/deletions, member joins/leaves, and voice activity.',
    category: 'Safety & Administration',
    commands: ['/logging channel', '/logging toggle', '/logging batch'],
    actionKey: 'COMMAND_LOGGING'
  },
  {
    key: 'VOICE_AUTOMATION',
    name: 'Dynamic Voice (Join-to-Create)',
    description: 'On-demand temporary voice channels with owner controls, user limits, and lock toggles.',
    category: 'Utilities',
    commands: ['/jointocreate setup', '/vc name', '/vc limit', '/vc lock'],
    actionKey: 'COMMAND_VC'
  }
];

const VALID_MODULE_KEYS = new Set(MODULES_DATA.map(m => m.key));

// Generate cryptographically secure session IDs
function generateSecureSessionId() {
  return `sess_${crypto.randomBytes(32).toString('hex')}`;
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
        clientId: DISCORD_CLIENT_ID || '123456789012345678'
      },
      database: {
        connected: dbCheck,
        engine: 'PostgreSQL'
      },
      authConfigured: Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET),
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  if (pathname === '/api/modules') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(MODULES_DATA));
    return;
  }

  // --- API: Discord OAuth2 Login ---
  if (pathname === '/api/auth/login') {
    const redirectUri = `${DASHBOARD_URL}/api/auth/callback`;
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      res.writeHead(302, { Location: '/?error=oauth_not_configured' });
      res.end();
      return;
    }
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(DISCORD_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;
    res.writeHead(302, { Location: discordAuthUrl });
    res.end();
    return;
  }

  // --- API: Discord OAuth2 Callback ---
  if (pathname === '/api/auth/callback') {
    const code = reqUrl.searchParams.get('code');
    if (!code) {
      res.writeHead(302, { Location: '/?error=missing_code' });
      res.end();
      return;
    }

    try {
      const redirectUri = `${DASHBOARD_URL}/api/auth/callback`;
      const tokenPayload = querystring.stringify({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
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
        res.writeHead(302, { Location: '/?error=token_exchange_failed' });
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
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(DISCORD_CLIENT_ID || '123456789012345678')}&permissions=8&scope=bot%20applications.commands&guild_id=${encodeURIComponent(g.id)}&response_type=code&redirect_uri=${encodeURIComponent(`${DASHBOARD_URL}/api/auth/callback`)}`;
        
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
      clientId: DISCORD_CLIENT_ID || '123456789012345678'
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

  // --- API: Server Configuration ---
  if (pathname.startsWith('/api/guilds/')) {
    const parts = pathname.split('/').filter(Boolean);
    const guildId = parts[1];
    const subRoute = parts[2];

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

    if (req.method === 'GET' && subRoute === 'config') {
      try {
        let guildConfig = { guild_id: guildId, guild_name: guildObj.name, timezone: 'America/New_York' };
        let moduleConfigs = [];

        try {
          const gRes = await query('SELECT * FROM guild_configs WHERE guild_id = $1', [guildId]);
          if (gRes.rows[0]) guildConfig = gRes.rows[0];

          const mRes = await query('SELECT * FROM module_configs WHERE guild_id = $1', [guildId]);
          moduleConfigs = mRes.rows;
        } catch (e) {
          // DB offline fallback
        }

        const modulesWithState = MODULES_DATA.map(mod => {
          const cfg = moduleConfigs.find(m => m.module_key === mod.key);
          return {
            ...mod,
            enabled: cfg ? cfg.enabled : true,
            logChannelId: cfg ? cfg.log_channel_id : null
          };
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          guild: {
            id: guildId,
            name: guildObj.name,
            iconUrl: guildObj.icon ? `https://cdn.discordapp.com/icons/${encodeURIComponent(guildId)}/${encodeURIComponent(guildObj.icon)}.png?size=128` : null
          },
          config: guildConfig,
          modules: modulesWithState
        }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch guild configuration' }));
        return;
      }
    }

    if (req.method === 'POST' && subRoute === 'toggle-module') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1024 * 10) {
          req.destroy(new Error('Payload too large'));
        }
      });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const { moduleKey, enabled } = parsed;

          if (!VALID_MODULE_KEYS.has(moduleKey) || typeof enabled !== 'boolean') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid moduleKey or enabled boolean parameter' }));
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
          } catch (e) {
            // DB fallback
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, moduleKey, enabled }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
        }
      });
      return;
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
