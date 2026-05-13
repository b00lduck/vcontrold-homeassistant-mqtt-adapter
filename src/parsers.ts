// Pure helper functions used by the adapter. Extracted into their own module
// so they can be unit tested without spinning up MQTT, vcontrold or the
// config singleton (which reads the environment at import time).

export interface PlausibilityRange {
  min?: number;
  max?: number;
}

/**
 * Convert a vcontrold command name like "getTempA" into a human-readable
 * sensor name like "Temp A".
 */
export function commandToName(command: string): string {
  return command
    .replace(/^get/, "")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
}

/**
 * Convert a vcontrold command name into a snake_case unique id suitable for
 * use in MQTT topics and Home Assistant entity ids.
 */
export function commandToUniqueId(command: string): string {
  return command
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Parse a vcontrold response. vcontrold typically returns responses like
 * "value unit" or just "value". Returns the first numeric token as a number,
 * the trimmed string if no numeric token is found, or null for empty input.
 */
export function parseResponse(response: string): string | number | null {
  const trimmed = response.trim();

  const match = trimmed.match(/(-?\d+\.?\d*)/);
  if (match) {
    const numValue = Number.parseFloat(match[1]);
    return Number.isNaN(numValue) ? trimmed : numValue;
  }

  return trimmed || null;
}

/**
 * Check whether a numeric value falls within an optional inclusive range.
 * Used to drop implausible sensor readings (e.g. Viessmann sentinel values
 * like 128.5 °C for "sensor disconnected", or stray values caused by
 * vcontrold response/command desynchronisation).
 */
export function isPlausible(range: PlausibilityRange, value: number): boolean {
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}
