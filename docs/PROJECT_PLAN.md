# SlickBot Project Plan

## Goal

Build SlickBot as a bot-only all-in-one Discord server management system for the SlickPickleNick Discord server.

The initial goal is not to build a public SaaS bot or dashboard. The first version should be stable, easy to deploy on Railway, and configurable through Discord slash commands.

## Foundation Principles

- Use a TitanBot-style JavaScript runtime foundation to avoid TypeScript build failures during early development.
- Keep the code modular so features can be added one module at a time.
- Use PostgreSQL for durable storage.
- Use ephemeral responses for configuration and sensitive command output.
- Use Permission Teams for command/module access.
- Use batched logs to reduce log-channel spam.

## Core Systems

- Permission Teams
- Module registry
- Logging system
- Batched log queue
- Audit logs
- Slash command deployment
- Railway health endpoint

## Future Modules

- Moderation
- User notes
- Case management
- Tickets
- Ticket transcripts
- Applications
- Appeals
- Scheduled messages
- Welcome system
- Auto roles
- Reaction/button roles
- Giveaways
- Birthdays
- Leveling
- Server stats
- Join-to-create voice
- Custom commands
- Utility tools
