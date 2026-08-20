const http = require('node:http');
const { URL } = require('node:url');
const { env } = require('../config/env');
const { query } = require('./db');

function renderAuthHtml({ title, message, success = true, username = null }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} · SlickBot</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0f1117;
      color: #e6e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #181b24;
      border: 1px solid ${success ? '#22c55e' : '#ef4444'};
      border-radius: 16px;
      padding: 40px;
      max-width: 480px;
      width: 90%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .icon {
      font-size: 54px;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 24px;
      color: ${success ? '#4ade80' : '#f87171'};
    }
    p {
      color: #9ca3af;
      line-height: 1.6;
      margin: 0 0 24px;
      font-size: 15px;
    }
    .badge {
      display: inline-block;
      background: #232733;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 14px;
      color: #38bdf8;
      margin-bottom: 20px;
      font-weight: 600;
    }
    .btn {
      display: inline-block;
      background: #5865f2;
      color: #ffffff;
      padding: 12px 28px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #4752c4;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '🎉' : '⚠️'}</div>
    <h1>${title}</h1>
    ${username ? `<div class="badge">@${username}</div>` : ''}
    <p>${message}</p>
    <a href="javascript:window.close()" class="btn">Close Window</a>
  </div>
</body>
</html>`;
}

function startHealthServer(client) {
  const server = http.createServer(async (request, response) => {
    const host = request.headers.host || `localhost:${env.PORT}`;
    const reqUrl = new URL(request.url, `http://${host}`);
    const pathname = reqUrl.pathname;

    if (pathname === '/health') {
      const ready = client.isReady();
      const body = JSON.stringify({
        ok: ready,
        service: 'SlickBot',
        discordReady: ready,
        user: ready && client.user ? client.user.tag : null,
        uptime: Math.round(process.uptime())
      });

      response.writeHead(ready ? 200 : 503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      });
      response.end(body);
      return;
    }

    // TikTok OAuth Login Redirect
    if (pathname === '/auth/tiktok/login') {
      const guildId = reqUrl.searchParams.get('guildId') || '';
      const clientKey = env.TIKTOK_CLIENT_KEY;
      const hostUrl = env.PUBLIC_URL || `http://${host}`;
      const redirectUri = `${hostUrl.replace(/\/+$/, '')}/auth/tiktok/callback`;
      const state = Buffer.from(JSON.stringify({ guildId, timestamp: Date.now() })).toString('base64url');

      if (clientKey) {
        const tiktokAuthUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(clientKey)}&scope=user.info.basic,video.list&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
        response.writeHead(302, { Location: tiktokAuthUrl });
        response.end();
        return;
      }

      // If no official developer client key is configured, redirect directly to TikTok login
      response.writeHead(302, { Location: 'https://www.tiktok.com/login' });
      response.end();
      return;
    }

    // TikTok Direct Web Connect Submission
    if (pathname === '/auth/tiktok/connect' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', async () => {
        try {
          const params = new URLSearchParams(body);
          const guildId = params.get('guildId') || '';
          const username = (params.get('username') || '').replace(/^@/, '');
          const sessionToken = params.get('sessionToken') || '';

          if (guildId && sessionToken) {
            await query(
              `INSERT INTO social_feed_configs (guild_id, tiktok_session_token, tiktok_username, tiktok_connected_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (guild_id) DO UPDATE SET
                 tiktok_session_token = EXCLUDED.tiktok_session_token,
                 tiktok_username = EXCLUDED.tiktok_username,
                 tiktok_connected_at = NOW(),
                 updated_at = NOW()`,
              [guildId, sessionToken, username]
            );
          }

          const html = renderAuthHtml({
            title: 'TikTok Connected!',
            message: 'Your TikTok account has been successfully linked to SlickBot. You can now close this window and return to Discord.',
            success: true,
            username
          });
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(html);
        } catch (err) {
          const html = renderAuthHtml({
            title: 'Connection Failed',
            message: `Could not save TikTok credentials: ${err.message}`,
            success: false
          });
          response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(html);
        }
      });
      return;
    }

    // TikTok OAuth Callback Handler
    if (pathname === '/auth/tiktok/callback') {
      const code = reqUrl.searchParams.get('code');
      const stateParam = reqUrl.searchParams.get('state');
      const error = reqUrl.searchParams.get('error');

      if (error || !code) {
        const html = renderAuthHtml({
          title: 'Authorization Cancelled',
          message: error || 'TikTok authorization was cancelled or did not return a valid code.',
          success: false
        });
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(html);
        return;
      }

      let guildId = '';
      try {
        if (stateParam) {
          const parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'));
          guildId = parsed.guildId || '';
        }
      } catch (_stateErr) {}

      try {
        const clientKey = env.TIKTOK_CLIENT_KEY;
        const clientSecret = env.TIKTOK_CLIENT_SECRET;
        const redirectUri = `http://${host}/auth/tiktok/callback`;

        // Exchange code for access token with TikTok OAuth v2
        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: clientKey || '',
            client_secret: clientSecret || '',
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
          }).toString()
        });

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.data?.access_token || tokenData.access_token;
        const openId = tokenData.data?.open_id || tokenData.open_id;

        if (accessToken && guildId) {
          await query(
            `INSERT INTO social_feed_configs (guild_id, tiktok_access_token, tiktok_user_id, tiktok_connected_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (guild_id) DO UPDATE SET
               tiktok_access_token = EXCLUDED.tiktok_access_token,
               tiktok_user_id = EXCLUDED.tiktok_user_id,
               tiktok_connected_at = NOW(),
               updated_at = NOW()`,
            [guildId, accessToken, openId]
          );
        }

        const html = renderAuthHtml({
          title: 'TikTok Authorization Successful!',
          message: 'SlickBot has been authorized with your TikTok account. Live streams and video uploads will now be automatically announced.',
          success: true
        });
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(html);
      } catch (err) {
        const html = renderAuthHtml({
          title: 'Authorization Error',
          message: `Failed to complete TikTok token exchange: ${err.message}`,
          success: false
        });
        response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(html);
      }
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('SlickBot is running. Use /health for deployment health checks.\n');
  });

  server.listen(env.PORT, env.WEB_HOST, () => {
    console.log(`Health & Auth server listening on ${env.WEB_HOST}:${env.PORT}.`);
  });

  return server;
}

module.exports = { startHealthServer };
