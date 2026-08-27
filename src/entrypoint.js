require('dotenv').config();

const role = (
  process.env.SERVICE_ROLE ||
  process.env.SERVICE_TYPE ||
  process.env.APP_ROLE ||
  process.env.APP_MODE ||
  process.env.ROLE ||
  ''
).toLowerCase().trim();

const hasDiscordToken = Boolean(process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN.trim());

// Determine if we should run in standalone dashboard mode
const isDashboardMode =
  role === 'dashboard' ||
  role === 'web' ||
  role === 'website' ||
  role === 'api' ||
  (!hasDiscordToken && Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL));

if (isDashboardMode) {
  console.log('[SlickBot Entrypoint] Launching in STANDALONE WEB DASHBOARD mode (No Discord Gateway connection).');
  const { server } = require('../dashboard/server');
  const PORT = process.env.DASHBOARD_PORT || process.env.PORT || 3000;
  const HOST = process.env.DASHBOARD_HOST || process.env.WEB_HOST || '0.0.0.0';
  if (!server.listening) {
    server.listen(PORT, HOST, () => {
      console.log(`[Dashboard] SlickBot web dashboard listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    });
  }
} else {
  console.log('[SlickBot Entrypoint] Launching in FULL DISCORD BOT GATEWAY mode.');
  require('./index.js');
}
