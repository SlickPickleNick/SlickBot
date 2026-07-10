const { commands } = require('../commands');
const { validateCommandPayloads } = require('../utils/commandValidation');

const payload = commands.map((command) => command.data.toJSON());
const errors = validateCommandPayloads(payload);

if (errors.length > 0) {
  console.error('Invalid command payload:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Validated ${payload.length} command payload(s).`);
