const http = require('node:http');
const { URL } = require('node:url');
const { env } = require('../config/env');
const { query } = require('./db');

function startHealthServer(client) {
  const server = http.createServer(async (request, response) => {
    const host = request.headers.host || `localhost:${env.PORT}`;
    const reqUrl = new URL(request.url, `http://${host}`);
    const pathname = reqUrl.pathname;

    if (pathname === '/health' || pathname === '/api/health') {
      const dbCheck = await query('SELECT 1').then(() => true).catch(() => false);
      const isReady = client?.isReady?.() || false;
      const status = dbCheck && isReady ? 'ok' : 'degraded';
      const statusCode = status === 'ok' ? 200 : 503;

      const body = JSON.stringify({
        status,
        bot: {
          ready: isReady,
          guilds: client?.guilds?.cache?.size || 0,
          ping: client?.ws?.ping || 0
        },
        database: {
          connected: dbCheck
        },
        timestamp: new Date().toISOString()
      }, null, 2);

      response.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      });
      response.end(body);
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('SlickBot is running. Use /health for deployment health checks.\n');
  });

  server.listen(env.PORT, env.WEB_HOST, () => {
    console.log(`Health server listening on ${env.WEB_HOST}:${env.PORT}.`);
  });

  return server;
}

module.exports = { startHealthServer };
