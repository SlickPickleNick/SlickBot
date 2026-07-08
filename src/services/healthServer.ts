import { createServer, type Server } from "node:http";
import type { Client } from "discord.js";
import { env } from "../config/env.js";

export function startHealthServer(client: Client): Server {
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      const ready = client.isReady();
      const body = JSON.stringify({
        ok: ready,
        service: "SlickBot",
        discordReady: ready,
        user: ready ? client.user?.tag : null,
        uptime: Math.round(process.uptime())
      });

      response.writeHead(ready ? 200 : 503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      });
      response.end(body);
      return;
    }

    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("SlickBot is running. Use /health for deployment health checks.\n");
  });

  server.listen(env.PORT, env.WEB_HOST, () => {
    console.log(`Health server listening on ${env.WEB_HOST}:${env.PORT}.`);
  });

  return server;
}
