# SlickBot AI Agent Information Hub & Architectural Guide

Welcome to the **SlickBot** codebase. This document serves as the single source of truth and architectural contract for AI pair-programming assistants across **macOS, Windows, and Linux** environments.

---

## 1. Project Overview & Tech Stack

SlickBot is a comprehensive Discord bot and web management platform featuring support workflows, multi-category moderation, auto-moderation, custom commands, leveling, role panels, reaction roles, social feeds, voice channels, tickets, appeals, applications, and automated task scheduling.

- **Runtime**: Node.js `>= 22.12.0` (as specified in `package.json`, `.node-version`, and `.nvmrc`).
- **Discord API**: `discord.js ^14.22.1` (REST API & Gateway).
- **Database**: PostgreSQL with `pg ^8.13.3` (connection pooling, parameterized SQL, and safe transactions).
- **Dashboard**: Express.js server in `dashboard/` with OAuth2 authentication and REST endpoints.
- **Testing**: Native Node.js test runner (`node --test` in `test/unit/`).
- **Deployment**: Dual-mode entrypoint (`src/entrypoint.js`) supporting full bot gateway mode and standalone dashboard mode (configured via `SERVICE_ROLE` / `APP_MODE` environment variables).

---

## 2. Directory Layout & Architecture Map

```text
SlickBot/
├── AGENTS.md                  # Master Agent Guide & Architecture Hub (this file)
├── .agents/
│   ├── rules/                 # Specialized domain rules loaded dynamically
│   │   ├── commands_and_interactions.md
│   │   ├── modules_and_services.md
│   │   ├── database_and_migrations.md
│   │   ├── task_scheduler_and_events.md
│   │   └── testing_and_verification.md
│   └── skills/                # Procedural runbooks & workflows
│       └── create-bot-module/ # Workflow for creating new bot modules
├── dashboard/                 # Standalone Express web dashboard
│   ├── public/                # Static CSS, JS, images, templates
│   ├── server.js              # Express server & API routes
│   └── package.json           # Dashboard dependencies
├── docs/                      # Architectural specifications and roadmap plans
├── prisma/                    # Optional / reference Prisma schema
├── src/
│   ├── commands/              # Slash commands, context menus, and registry
│   │   ├── index.js           # Central commands list & commandMap
│   │   └── *.js               # Individual slash/context command definitions
│   ├── config/
│   │   └── env.js             # Environment variable parsing & validation
│   ├── modules/               # Domain feature modules
│   │   ├── moduleRegistry.js  # Module keys, default states, & core module registry
│   │   ├── automation/        # Scheduled messages, feeds, and triggers
│   │   ├── community/         # Leveling, games, birthdays, giveaways, starboard, etc.
│   │   ├── custom/            # Custom commands engine
│   │   ├── help/              # Dynamic help system & documentation browser
│   │   ├── logging/           # Audit logging & event dispatch
│   │   ├── moderation/        # Moderation actions, auto-moderation, temp roles
│   │   ├── onboarding/        # Server setup wizard & one-click install
│   │   ├── panels/            # Dynamic interactive management panels
│   │   ├── permissions/       # Bot permission system & team role assignments
│   │   ├── safety/            # Lockdown & security enforcement
│   │   ├── status/            # System status & component health
│   │   ├── support/           # Tickets, appeals, applications, and reports
│   │   ├── ui/                # Shared UI builders, customIds, and panels
│   │   ├── utility/           # Utility features (reminders, polls, snipes, AFK)
│   │   └── voice/             # Dynamic voice channels & join-to-create
│   ├── scripts/               # Operational CLI scripts (purge commands, validate payloads)
│   ├── services/              # Core infrastructure services
│   │   ├── db.js              # PostgreSQL client, pool, and transaction helpers
│   │   ├── healthServer.js    # Liveness/readiness HTTP health check server
│   │   ├── initDatabase.js    # Idempotent DDL schema initializations & migrations
│   │   ├── interactionRouter.js # Central dispatcher for all Discord interactions
│   │   └── taskScheduler.js   # Background cron scheduler for periodic tasks
│   ├── utils/                 # Utility libraries
│   │   ├── commandValidation.js # Command builder options validator
│   │   ├── format.js          # String formatting, truncation, code blocks
│   │   ├── reply.js           # Ephemeral reply handlers & auto-delete routines
│   │   └── time.js            # Duration parser & Discord timestamp formatters
│   ├── deployCommands.js      # Discord REST command deployment script
│   ├── entrypoint.js          # Dual-service runtime switcher (Bot vs. Dashboard)
│   └── index.js               # Bot client initialization, gateway events, login
└── test/
    ├── helpers/               # Test harness, mock interactions, and DB stubbing
    └── unit/                  # Unit test suites executed via node --test
```

---

## 3. Core Architectural Principles & Golden Rules

### 1. Separation of Concerns (`<domain>Service.js` vs. `<domain>Ui.js`)
- **Service Files** (`*Service.js`): Contain all business logic, database queries, calculations, and data mutations. Never embed raw Discord component formatting logic inside services.
- **UI Files** (`*Ui.js`): Contain embed builders, ActionRows, Buttons, SelectMenus, and Modals. Use predefined colors and formatting helpers from `src/utils/format.js` and `src/modules/ui/customIds.js`.

### 2. Slash Command Required Option Ordering (Discord v14 Strict Rule)
- In all `SlashCommandBuilder` definitions, **all required options must precede optional options** across the root command, subcommands, and subcommand groups.
- Failure to follow this rule will crash Discord API command registration. Always run `npm run validate:commands` after modifying any command file.

### 3. Centralized Interaction Routing & Namespaced Custom IDs
- **Never** add ad-hoc `interactionCreate` listeners in random files.
- All button clicks, select menu selections, modal submissions, and context menus must route through [src/services/interactionRouter.js](file:///Users/nicksilvestro/GitHub%20Repos/SlickBotRepo/SlickBot/src/services/interactionRouter.js).
- All `customId` strings must be namespaced using the format `slickbot:<domain>:<action>` and registered in [src/modules/ui/customIds.js](file:///Users/nicksilvestro/GitHub%20Repos/SlickBotRepo/SlickBot/src/modules/ui/customIds.js).

### 4. Robust Reply Lifecycle & Ephemeral Messages
- Discord interactions expire in 3 seconds unless acknowledged.
- Use [src/utils/reply.js](file:///Users/nicksilvestro/GitHub%20Repos/SlickBotRepo/SlickBot/src/utils/reply.js) (`replyPrivate`, `replySuccess`, `replyError`, `editReplyPrivate`) for consistent error handling, ephemeral responses, and auto-deletion.
- If an operation takes longer than 2.5 seconds, call `await interaction.deferReply({ ephemeral: true })` before performing work, and use `editReply` / `followUp`.

### 5. PostgreSQL Database Patterns & Migrations
- All database queries must use `query` or `withTransaction` from [src/services/db.js](file:///Users/nicksilvestro/GitHub%20Repos/SlickBotRepo/SlickBot/src/services/db.js).
- **Always** use parameterized queries (`$1, $2, ...`) to prevent SQL injection.
- Database table definitions and schema updates must be idempotently added to [src/services/initDatabase.js](file:///Users/nicksilvestro/GitHub%20Repos/SlickBotRepo/SlickBot/src/services/initDatabase.js) using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

### 6. Cross-Platform OS Compatibility (Mac, Windows, Linux)
- Always use `path.join()` or POSIX-compatible path handling; avoid hardcoding OS-specific backslashes (`\`).
- Ensure all npm scripts and code execute seamlessly in both POSIX shells (`bash`/`zsh`) and Windows (`PowerShell`/`CMD`).
- Use LF line endings in version-controlled files.

---

## 4. Verification & Testing Workflow

Before finishing any task, you must run and verify:

```bash
# 1. Validate slash command builder payloads for Discord compliance
npm run validate:commands

# 2. Run the complete unit test suite (300+ tests)
npm test

# 3. Check test coverage (optional / for major refactors)
npm run test:coverage
```

---

## 5. Maintenance Protocol for AI Agents

> [!IMPORTANT]
> **Living Document Rule**: Whenever you introduce a new bot module, add database tables, modify command registration structures, or update core architecture:
> 1. Update this [AGENTS.md](file:///Users/nicksilvestro/GitHub%20Repos/SlickBotRepo/SlickBot/AGENTS.md) to reflect new components and guidelines.
> 2. Update or create corresponding rules in `.agents/rules/`.
> 3. Verify all changes using `npm run validate:commands` and `npm test`.
