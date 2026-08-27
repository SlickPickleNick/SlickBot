const http = require('node:http');
const { env } = require('../config/env');
const { handleDashboardRequest } = require('../../dashboard/server');

function startHealthServer(client) {
  const server = http.createServer(async (request, response) => {
    try {
      await handleDashboardRequest(request, response, client);
    } catch (err) {
      console.error('Web server error:', err);
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'text/plain' });
        response.end('Internal Server Error\n');
      }
    }
  });

  server.listen(env.PORT, env.WEB_HOST, () => {
    console.log(`Health & Dashboard server listening on ${env.WEB_HOST}:${env.PORT}.`);
  });

  return server;
}

module.exports = { startHealthServer };
