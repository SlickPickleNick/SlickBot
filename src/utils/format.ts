export function asCodeBlock(value: string): string {
  return `\`\`\`text\n${value}\n\`\`\``;
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
