// Pure validation helpers used by config loading. Extracted so they can be
// unit tested without invoking dotenv or reading the environment.

// Allowed characters for vcontrold command names. vcontrold accepts only
// command identifiers; anything else (whitespace, control chars, newlines)
// could be used to smuggle additional commands over the same TCP connection.
export const COMMAND_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

// Allowed characters for MQTT topic segments. Excludes MQTT wildcards (#, +),
// the topic separator (/), and any control / non-ASCII characters that could
// produce malformed topics or unintended subscriptions.
export const TOPIC_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function validateCommand(command: string): string {
  if (typeof command !== "string" || !COMMAND_PATTERN.test(command)) {
    throw new Error(
      `Invalid vcontrold command "${command}": must match ${COMMAND_PATTERN}`,
    );
  }
  return command;
}

export function validateTopicSegment(name: string, value: string): string {
  if (!TOPIC_SEGMENT_PATTERN.test(value)) {
    throw new Error(
      `Invalid value for ${name}: "${value}" must match ${TOPIC_SEGMENT_PATTERN} (no MQTT wildcards or separators)`,
    );
  }
  return value;
}

export function parsePositiveInt(name: string, raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid value for ${name}: "${raw}" must be a positive integer`,
    );
  }
  return value;
}

export function parsePort(name: string, raw: string): number {
  const value = parsePositiveInt(name, raw);
  if (value > 65535) {
    throw new Error(`Invalid value for ${name}: "${raw}" exceeds 65535`);
  }
  return value;
}
