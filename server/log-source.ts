import type { LogEntryDto } from '../shared/contracts.js';

export function classifyContainerLog(line: string): LogEntryDto {
  const separator = line.indexOf('|');
  const payload = separator >= 0 ? line.slice(separator + 1) : line;
  return { source: /^\s*\d+\.\d+\s/.test(payload) ? 'game' : 'container', line };
}
