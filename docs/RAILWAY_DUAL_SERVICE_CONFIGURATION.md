# Railway Dual-Service Configuration & Action Duplication Fix Guide

## 🚨 Problem Summary

When multiple Railway services (or multiple repository deployments) connect to PostgreSQL and run simultaneously, actions and commands (such as **Counting**, **Leveling XP**, **Slash Commands**, and **Scheduled Tasks**) become duplicated or broken.

### Why This Happens
- **PostgreSQL is NOT the cause of duplicate actions.** PostgreSQL is simply a shared database.
- **Discord Gateway WebSocket duplication IS the cause:**
  - When any service runs `node src/index.js` with `DISCORD_TOKEN`, it opens an active WebSocket connection to Discord's Gateway (`wss://gateway.discord.gg`).
  - Discord broadcasts every message, reaction, and interaction to **every open Gateway connection** using that bot token.
  - If two services run `npm start` (or have `DISCORD_TOKEN` set and connect to the gateway), both receive every event at the exact same millisecond:
    - **Counting Breaks:** Bot 1 updates the count in PostgreSQL. Bot 2 sees the count already updated and flags a false "Double Count" or "Wrong Number" error, resetting the game.
    - **Leveling Duplicates:** Both instances grant XP for a single message.
    - **Slash Commands Error Out:** Both instances attempt to acknowledge the interaction, causing Discord `40060: Interaction already acknowledged` or `Unknown interaction` errors.
    - **Scheduled Tasks Double:** Announcements, giveaways, and timers trigger twice.

---

## 💡 Codebase Fix Applied (Smart Entrypoint)

We updated the repository to automatically resolve the `"The value is set in /railway.json"` lock:

1. **Unlocked `railway.json`**: Removed the hardcoded `startCommand: "npm start"` from `railway.json`, which previously prevented Railway UI from allowing per-service custom start commands.
2. **Added Smart Auto-Detect Entrypoint (`src/entrypoint.js`)**:
   - If `SERVICE_ROLE=dashboard` is set **OR** if `DISCORD_TOKEN` is missing, it boots **Standalone Web Dashboard Mode** (`dashboard/server.js`) with **zero** Discord Gateway connections.
   - If `DISCORD_TOKEN` is present (and `SERVICE_ROLE` is not dashboard), it boots **Full Bot Gateway Mode** (`src/index.js`).

---

## 🛠️ Step-by-Step Fix in Railway

Choose either **Option 1 (Two Services)** or **Option 2 (Simpler All-in-One)**.

---

### Option 1: Two Separate Railway Services (Microservices Architecture)

If you have two services in your Railway project (**Service 1: Bot Gateway** and **Service 2: Web Dashboard / API**):

#### 1. Root Directory Setting (Both Services)
* **Leave the Root Directory at `/` (default/unchanged) for BOTH services.**
* ⚠️ **Do NOT change Root Directory to `/dashboard`.** The dashboard imports shared modules (`src/config/env`, `src/services/db`, `src/modules/moduleRegistry`) and requires dependencies from the root `package.json`.

---

#### 2. Service 1: Discord Bot (`SlickBot`) Configuration
* **Service Name:** `SlickBot` (or your primary bot service)
* **Root Directory:** `/`
* **Custom Start Command:** *(Leave blank or default `npm start`)*
* **Replicas:** Ensure **Replicas = 1** *(under Settings ➔ Deploy ➔ Replicas)*
* **Variables to KEEP:**
  ```env
  DATABASE_URL=postgresql://...
  DISCORD_TOKEN=your_bot_token_here
  DISCORD_CLIENT_ID=your_client_id_here
  DISCORD_GUILD_ID=your_guild_id (optional for single-server dev)
  BOT_OWNER_IDS=your_discord_id
  AUTO_DEPLOY_COMMANDS=true
  NODE_ENV=production
  WEB_HOST=0.0.0.0
  PORT=3000
  ```

---

#### 3. Service 2: Web Dashboard / API Configuration
* **Service Name:** `Dashboard` (or your second web service)
* **Root Directory:** `/`
* **Custom Start Command:** You can now enter `node dashboard/server.js` (or leave it blank because the Smart Entrypoint handles it!).
* **Variables to SET:**
  - Add: `SERVICE_ROLE=dashboard`
  - ❌ **REMOVE `DISCORD_TOKEN`** from this service.
* **Variables to KEEP in Dashboard Service:**
  ```env
  SERVICE_ROLE=dashboard
  DATABASE_URL=postgresql://...
  DISCORD_CLIENT_ID=your_client_id_here
  DISCORD_CLIENT_SECRET=your_client_secret_here
  DASHBOARD_URL=https://your-dashboard-domain.up.railway.app
  NODE_ENV=production
  PORT=3000
  ```

---

### Option 2: Single All-in-One Railway Service (Simplest)

SlickBot is already engineered to host **both** the Discord Bot Gateway and the Web Dashboard / Health Server simultaneously in a single container via `src/services/healthServer.js` and `src/index.js`.

If you do not strictly require two separate Railway services:
1. In Railway, click the **Second Service** (duplicate/extra deployment).
2. Go to **Settings** ➔ **Delete Service** (or Pause/Sleep).
3. In your **Main SlickBot Service**, ensure all web variables (`DISCORD_CLIENT_SECRET`, `DASHBOARD_URL`) are present.
4. Generate a public domain under **Settings ➔ Networking ➔ Public Networking** for port `3000`.
5. Your single service will handle both Discord events and the web dashboard without any duplication risk.

---

## 🔍 Extra Checklist for Duplicate Action Prevention

| Checklist Item | What to Check | Expected Setting |
| :--- | :--- | :--- |
| **Railway Replicas** | Check **Settings ➔ Deploy ➔ Replicas** on the bot service. | Must be set to **`1`** (more than 1 replica without custom sharding duplicates all gateway events). |
| **Railway Environments** | Check the top Environment switcher (e.g. `production` vs `staging` / `preview`). | Ensure inactive environments are deleted/paused or use a separate Test Bot Token. |
| **Local Machine Process** | Check your local terminal. | Ensure `npm start` is **not running locally** while Railway is also running with the same bot token. |

---

## ✅ How to Verify the Fix

1. **Check Railway Logs:**
   - In the Bot service logs, you should see:
     ```text
     [SlickBot Entrypoint] Launching in FULL DISCORD BOT GATEWAY mode.
     SlickBot logged in as SlickBot#0000.
     Health & Dashboard server listening on 0.0.0.0:3000.
     ```
   - In the Dashboard service logs (if using Option 1), you should see:
     ```text
     [SlickBot Entrypoint] Launching in STANDALONE WEB DASHBOARD mode (No Discord Gateway connection).
     [Dashboard] SlickBot web dashboard listening on http://0.0.0.0:3000
     ```

2. **Test Counting in Discord:**
   - Type the next consecutive number in your server's `#counting` channel.
   - The bot should react with ✅ without double-triggering or resetting.

3. **Test Slash Commands:**
   - Run `/ping` or `/help`.
   - The response should appear instantly without "Interaction failed" or "already acknowledged" errors.
