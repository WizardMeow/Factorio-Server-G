import type { LogEntryDto } from '../shared/contracts.js';

export function classifyContainerLog(line: string): LogEntryDto {
  const separator = line.indexOf('|');
  const payload = separator >= 0 ? line.slice(separator + 1) : line;
  return { source: /^\s*\d+\.\d+\s/.test(payload) ? 'game' : 'container', level: classifyLogLevel(payload), line };
}

function classifyLogLevel(line: string): LogEntryDto['level'] {
  if (/\b(error|failed|fatal|exception)\b/i.test(line)) return 'error';
  if (/\b(warn|warning|interrupted)\b/i.test(line)) return 'warning';
  if (/\b(completed|verified|activated|started|pulled|created|ready)\b/i.test(line)) return 'success';
  return 'info';
}
