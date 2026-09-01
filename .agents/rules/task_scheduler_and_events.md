# Task Scheduler, Gateway Events & Runtime Architecture

This rule covers the background task scheduler, Discord gateway event handling, health server checks, and dual-mode runtime entrypoints in SlickBot.

---

## 1. Background Task Scheduler (`src/services/taskScheduler.js`)

SlickBot uses a robust, built-in task scheduler to handle periodic background jobs (e.g., expiring temporary roles, sending scheduled messages, checking birthday announcements, updating server stats, polling social feeds, and firing reminders).

### Adding a Scheduled Task:
```javascript
const { taskScheduler } = require('./services/taskScheduler');

taskScheduler.registerTask({
  name: 'myPeriodicTask',
  intervalMs: 60 * 1000, // Every 60 seconds
  handler: async (client) => {
    // Process periodic work across guilds
  }
});
```

### Safety Features Built-in:
1. **Concurrency Lock**: Prevents the same task from overlapping if a previous run takes longer than the interval.
2. **Crash Prevention**: All task handlers are wrapped with try/catch blocks; uncaught errors in tasks are recorded in telemetry and will never crash the bot process.
3. **Telemetry Tracking**: Records last run time, run count, error count, and last execution duration.

---

## 2. Gateway Event Handling (`src/index.js`)

Discord gateway events are registered in `src/index.js`. When adding or handling new gateway events:
- Ensure the required `GatewayIntentBits` and `Partials` are included in the `Client` constructor in `src/index.js`.
- Always check if the relevant feature module is enabled for that guild before executing event logic (e.g., using `moduleRegistry.js` and guild module settings).
- Wrap event handlers in error-safe routines to prevent single guild issues from impacting the entire client.

---

## 3. Dual Runtime Entrypoint (`src/entrypoint.js`)

SlickBot supports running as a unified application or as separated microservices on platforms like Railway:
- **Full Bot Gateway Mode**: Runs `src/index.js` (default if `DISCORD_TOKEN` is present).
- **Standalone Web Dashboard Mode**: Runs `dashboard/server.js` (activated if `SERVICE_ROLE=dashboard` or `SERVICE_TYPE=web` or no `DISCORD_TOKEN` is provided).

---

## 4. HTTP Health Server (`src/services/healthServer.js`)

To satisfy cloud platform liveness/readiness probes:
- A lightweight HTTP health server starts automatically on port `PORT` or `8080`.
- Provides `/health` and `/ready` endpoints returning status `200 OK`.
