const { commands } = require('../commands');
const { validateCommandPayloads } = require('../utils/commandValidation');
try {
  const payload = commands.map((command) => command.data.toJSON());
  const errors = validateCommandPayloads(payload);
  if (errors.length) throw new Error(`Command validation failed:\n- ${errors.join('\n- ')}`);
  console.log(`Validated ${payload.length} SlickBot slash commands.`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
