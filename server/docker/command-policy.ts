const PROJECT = 'factorio-server-g';
const SERVICE = 'factorio';
const DENIED = 'Docker Compose command denied';

export function authorizeComposeCommand(input: unknown): string[] {
  if (!Array.isArray(input) || !input.every(value => typeof value === 'string')) throw new Error(DENIED);
  const command = input as string[];
  if (!isAllowed(command)) throw new Error(DENIED);
  return ['compose', '--project-name', PROJECT, ...command];
}

function isAllowed(command: string[]) {
  if (equals(command, ['ps', '--format', 'json', SERVICE])) return true;
  if (equals(command, ['config', '--format', 'json'])) return true;
  if (equals(command, ['pull', SERVICE])) return true;
  if (equals(command, ['up', '-d', '--no-deps', SERVICE])) return true;
  if (equals(command, ['up', '-d', '--no-deps', '--force-recreate', SERVICE])) return true;
  if (equals(command, ['stop', '-t', '120', SERVICE])) return true;
  if (equals(command, ['restart', '-t', '120', SERVICE])) return true;
  if (command.length === 5 && equals(command.slice(0, 3), ['logs', '--no-color', '--tail']) && command[4] === SERVICE) return validLineCount(command[3]);
  if (command.length === 5 && equals(command.slice(0, 3), ['logs', '--no-color', '--since']) && command[4] === SERVICE) return validIsoDate(command[3]);
  return equals(command, ['logs', '--no-color', '--follow', '--tail', '0', SERVICE]);
}

function equals(left: string[], right: string[]) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function validLineCount(value: string) { const count = Number(value); return Number.isInteger(count) && count >= 0 && count <= 5000 && String(count) === value; }
function validIsoDate(value: string) { try { return new Date(value).toISOString() === value; } catch { return false; } }
