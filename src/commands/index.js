const pingCommand = require('./ping');
const setupCommand = require('./setup');
const teamCommand = require('./team');
const modulesCommand = require('./modules');
const loggingCommand = require('./logging');
const statusCommand = require('./status');
const modCommand = require('./mod');
const caseCommand = require('./case');
const noteCommand = require('./note');
const ticketCommand = require('./ticket');
const reportCommand = require('./report');
const applicationCommand = require('./application');
const appealCommand = require('./appeal');
const permissionsCommand = require('./permissions');
const resetCommand = require('./reset');
const welcomeCommand = require('./welcome');
const rolesCommand = require('./roles');
const panelCommand = require('./panel');
const giveawayCommand = require('./giveaway');

const commands = [
  pingCommand,
  setupCommand,
  teamCommand,
  modulesCommand,
  loggingCommand,
  statusCommand,
  modCommand,
  caseCommand,
  noteCommand,
  ticketCommand,
  reportCommand,
  applicationCommand,
  appealCommand,
  permissionsCommand,
  resetCommand,
  welcomeCommand,
  rolesCommand,
  panelCommand,
  giveawayCommand
];

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

module.exports = {
  commands,
  commandMap
};
