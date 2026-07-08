import { loggingCommand } from "./logging.js";
import { modulesCommand } from "./modules.js";
import { pingCommand } from "./ping.js";
import { setupCommand } from "./setup.js";
import { teamCommand } from "./team.js";
import type { BotCommand } from "./types.js";

export const commands: BotCommand[] = [
  pingCommand,
  setupCommand,
  teamCommand,
  modulesCommand,
  loggingCommand
];

export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
