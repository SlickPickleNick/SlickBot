const pingCommand = require('./ping');
const botCommand = require('./bot');
const helpCommand = require('./help');
const setupCommand = require('./setup');
const teamCommand = require('./team');
const modulesCommand = require('./modules');
const loggingCommand = require('./logging');
const statusCommand = require('./status');
const modCommand = require('./mod');
const lockdownCommand = require('./lockdown');
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
const birthdayCommand = require('./birthday');
const scheduleCommand = require('./schedule');
const statsCommand = require('./stats');
const levelCommand = require('./level');
const botUpdatesCommand = require('./botUpdates');
const customCommand = require('./customCommand');
const joinCreateCommand = require('./joinCreate');
const gamesCommand = require('./games');
const faqCommand = require('./faq');
const faqReplyCommand = require('./faqReply');
const suggestionCommand = require('./suggestion');
const referralCommand = require('./referral');
const tempRoleCommand = require('./tempRole');
const achievementCommand = require('./achievement');
const feedCommand = require('./feed');
const utilityCommand = require('./utility');
const purgeCommand = require('./purge');
const userinfoCommand = require('./userinfo');
const serverinfoCommand = require('./serverinfo');
const roleinfoCommand = require('./roleinfo');
const channelinfoCommand = require('./channelinfo');
const avatarCommand = require('./avatar');
const bannerCommand = require('./banner');
const pollCommand = require('./poll');
const remindCommand = require('./remind');
const embedCommand = require('./embed');
const afkCommand = require('./afk');
const snipeCommand = require('./snipe');
const emojisCommand = require('./emojis');
const stickersCommand = require('./stickers');
const automodCommand = require('./automod');
const userInfoContextCommand = require('./userInfoContext');
const avatarContextCommand = require('./avatarContext');

const commands = [
  pingCommand,
  botCommand,
  helpCommand,
  setupCommand,
  teamCommand,
  modulesCommand,
  loggingCommand,
  statusCommand,
  modCommand,
  lockdownCommand,
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
  giveawayCommand,
  birthdayCommand,
  scheduleCommand,
  statsCommand,
  levelCommand,
  botUpdatesCommand,
  customCommand,
  joinCreateCommand,
  gamesCommand,
  faqCommand,
  faqReplyCommand,
  suggestionCommand,
  referralCommand,
  tempRoleCommand,
  achievementCommand,
  feedCommand,
  utilityCommand,
  purgeCommand,
  userinfoCommand,
  serverinfoCommand,
  roleinfoCommand,
  channelinfoCommand,
  avatarCommand,
  bannerCommand,
  pollCommand,
  remindCommand,
  embedCommand,
  afkCommand,
  snipeCommand,
  emojisCommand,
  stickersCommand,
  automodCommand,
  userInfoContextCommand,
  avatarContextCommand
];

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

module.exports = {
  commands,
  commandMap
};
