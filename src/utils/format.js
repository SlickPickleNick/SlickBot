function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) return value || '';
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function asCodeBlock(value) {
  return `\`\`\`text\n${value}\n\`\`\``;
}

module.exports = { truncate, asCodeBlock };
