---
name: create-bot-module
description: >-
  Step-by-step workflow for creating a new feature module in SlickBot.
  Use this skill whenever the user requests a new bot module, feature domain,
  or complex sub-system.
---

# Creating a New Feature Module in SlickBot

This workflow guides you through creating, registering, wiring, testing, and documenting a new domain module in SlickBot.

---

## Step 1: Declare the Module in `moduleRegistry.js`

1. Open `src/modules/moduleRegistry.js`.
2. Add the new key to `ModuleKeys`:
   ```javascript
   const ModuleKeys = Object.freeze({
     // ...
     MY_FEATURE: 'MY_FEATURE'
   });
   ```
3. Add the default state to `defaultModules` (e.g., `{ key: ModuleKeys.MY_FEATURE, enabled: true }`).
4. Add the key to `implementedModules`.

---

## Step 2: Create the Service and UI Files

Create a new directory `src/modules/myFeature/`:

1. **`src/modules/myFeature/myFeatureService.js`**:
   - Encapsulate data fetching, DB queries (`query`, `withTransaction` from `src/services/db`), and calculations.
2. **`src/modules/myFeature/myFeatureUi.js`**:
   - Encapsulate Discord embeds (`EmbedBuilder`), action rows, buttons, and select menus.

---

## Step 3: Register Database Tables in `initDatabase.js`

1. Open `src/services/initDatabase.js`.
2. Add idempotent SQL statements (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, indexes) to create necessary tables for the new module.
3. Ensure every table includes `guild_id`.

---

## Step 4: Create Slash Commands & Register in `src/commands/`

1. Create `src/commands/myFeature.js`:
   - Use `SlashCommandBuilder`.
   - **Order options**: All required options must precede optional options.
   - Use `replySuccess` / `replyError` from `src/utils/reply.js`.
2. Open `src/commands/index.js`:
   - Import the command.
   - Add it to the `commands` array.

---

## Step 5: Wire Custom IDs & Interaction Router

1. Register all button, select menu, or modal IDs in `src/modules/ui/customIds.js`:
   ```javascript
   CustomIds.MyFeatureAction = 'slickbot:myfeature:action';
   CustomIds.MyFeaturePrefix = 'slickbot:myfeature:prefix:';
   ```
2. Open `src/services/interactionRouter.js` and add routing cases for the new custom IDs.

---

## Step 6: Add Management Panel in `src/modules/ui/panels.js`

1. Create the panel renderer function in `src/modules/ui/panels.js` (or in `src/modules/myFeature/myFeatureUi.js` and export to panels).
2. Wire the panel opener button (`slickbot:setup:openmgr:MY_FEATURE`).

---

## Step 7: Write Unit Tests

1. Create `test/unit/myFeature.test.js`.
2. Use `describe` and `it` from `node:test`, `assert` from `node:assert/strict`.
3. Use `setQueryHandler` and `resetQueryHandler` from `src/services/db` to mock SQL.

---

## Step 8: Validate & Update Living Documentation

1. Run validation:
   ```bash
   npm run validate:commands
   npm test
   ```
2. Update `AGENTS.md` and relevant `.agents/rules/` to document the new module and its capabilities.
