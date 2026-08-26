import type { LogEntryDto } from '../shared/contracts.js';

export function classifyContainerLog(line: string): LogEntryDto {
  const separator = line.indexOf('|');
  const payload = separator >= 0 ? line.slice(separator + 1) : line;
  const timestamp = line.match(/^\[compose\]\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/)?.[1];
  return { source: /^\s*\d+\.\d+\s/.test(payload) ? 'game' : 'container', level: classifyLogLevel(payload), line, ...(timestamp ? { timestamp } : {}) };
}

function classifyLogLevel(line: string): LogEntryDto['level'] {
  if (/\b(error|failed|fatal|exception)\b/i.test(line)) return 'error';
  if (/\b(warn|warning|interrupted)\b/i.test(line)) return 'warning';
  if (/\b(completed|verified|activated|started|pulled|created|ready)\b/i.test(line)) return 'success';
  return 'info';
}
