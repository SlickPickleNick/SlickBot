const pingCommand = require('./ping');
const setupCommand = require('./setup');
const teamCommand = require('./team');
const modulesCommand = require('./modules');
const loggingCommand = require('./logging');
const statusCommand = require('./status');

const commands = [
  pingCommand,
  setupCommand,
  teamCommand,
  modulesCommand,
  loggingCommand,
  statusCommand
];

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

module.exports = {
  commands,
  commandMap
};
