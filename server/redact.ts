const SECRET_QUERY = /([?&](?:token|username)=)[^&\s]+/gi;
const ENV_SECRET = /((?:TOKEN|USERNAME|PASSWORD)\s*[=:]\s*)\S+/gi;

export function redact(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(SECRET_QUERY, '$1[REDACTED]').replace(ENV_SECRET, '$1[REDACTED]');
}
