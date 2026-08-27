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

## 🛠️ Step-by-Step Fix in Railway

Choose either **Option 1 (Recommended if you want separate services)** or **Option 2 (Simpler All-in-One)**.

---

### Option 1: Two Separate Railway Services (Microservices Architecture)

If you have two services in your Railway project (e.g. **Service 1: Bot Gateway** and **Service 2: Web Dashboard / API**):

#### 1. Root Directory Setting (Both Services)
* **Leave the Root Directory at `/` (default/unchanged) for BOTH services.**
* ⚠️ **Do NOT change Root Directory to `/dashboard`.** The dashboard imports shared modules (`src/config/env`, `src/services/db`, `src/modules/moduleRegistry`) and requires dependencies from the root `package.json`.

---

#### 2. Service 1: Discord Bot (`SlickBot`) Configuration
* **Service Name:** `SlickBot` (or your primary bot service)
* **Root Directory:** `/`
* **Custom Start Command:** `npm start` *(or leave blank / default `node src/index.js`)*
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
* **Custom Start Command:** *(Go to **Settings** ➔ **Deploy** ➔ **Custom Start Command**)*:
  ```bash
  node dashboard/server.js
  ```
  *(or `npm run dashboard`)*
* **Variables to REMOVE / EXCLUDE:**
  - ❌ **REMOVE `DISCORD_TOKEN`** from this service.
    > The standalone dashboard only needs database access and OAuth2 REST credentials. Removing `DISCORD_TOKEN` ensures this service **cannot** connect to the Discord Gateway.
* **Variables to KEEP in Dashboard Service:**
  ```env
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
| **Start Command Override** | Check second service start command. | Must be `node dashboard/server.js`, NOT `npm start` or `node src/index.js`. |

---

## ✅ How to Verify the Fix

1. **Check Railway Logs:**
   - In the Bot service logs, you should see:
     ```text
     SlickBot logged in as SlickBot#0000.
     Health & Dashboard server listening on 0.0.0.0:3000.
     ```
   - In the Dashboard service logs (if using Option 1), you should see:
     ```text
     [Dashboard] SlickBot web dashboard listening on http://0.0.0.0:3000
     ```
     *(Notice: It will NOT log in to Discord as a bot client).*

2. **Test Counting in Discord:**
   - Type the next consecutive number in your server's `#counting` channel.
   - The bot should react with ✅ without double-triggering or resetting.

3. **Test Slash Commands:**
   - Run `/ping` or `/help`.
   - The response should appear instantly without "Interaction failed" or "already acknowledged" errors.
