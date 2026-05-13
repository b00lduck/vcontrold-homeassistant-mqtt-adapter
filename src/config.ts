import dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

// Load environment variables
dotenv.config();

// Allowed characters for vcontrold command names. vcontrold accepts only
// command identifiers; anything else (whitespace, control chars, newlines)
// could be used to smuggle additional commands over the same TCP connection.
const COMMAND_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

// Allowed characters for MQTT topic segments. Excludes MQTT wildcards (#, +),
// the topic separator (/), and any control / non-ASCII characters that could
// produce malformed topics or unintended subscriptions.
const TOPIC_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function validateCommand(command: string): string {
  if (typeof command !== "string" || !COMMAND_PATTERN.test(command)) {
    throw new Error(
      `Invalid vcontrold command "${command}": must match ${COMMAND_PATTERN}`,
    );
  }
  return command;
}

function validateTopicSegment(name: string, value: string): string {
  if (!TOPIC_SEGMENT_PATTERN.test(value)) {
    throw new Error(
      `Invalid value for ${name}: "${value}" must match ${TOPIC_SEGMENT_PATTERN} (no MQTT wildcards or separators)`,
    );
  }
  return value;
}

function parsePositiveInt(name: string, raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid value for ${name}: "${raw}" must be a positive integer`,
    );
  }
  return value;
}

function parsePort(name: string, raw: string): number {
  const value = parsePositiveInt(name, raw);
  if (value > 65535) {
    throw new Error(`Invalid value for ${name}: "${raw}" exceeds 65535`);
  }
  return value;
}

export interface SensorDefinition {
  command: string;
  name?: string;
  enabled: boolean;
}

function loadSensors(): SensorDefinition[] {
  let sensors: SensorDefinition[] | null = null;

  const configPath = path.join(process.cwd(), "sensors.json");
  if (fs.existsSync(configPath)) {
    // Fail loudly on a corrupt file rather than silently falling back.
    const content = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error("sensors.json must contain a JSON array");
    }
    sensors = (parsed as SensorDefinition[]).filter((s) => s.enabled !== false);
  } else {
    const envSensors = process.env.VCONTROLD_SENSORS;
    if (envSensors) {
      sensors = envSensors.split(",").map((cmd) => ({
        command: cmd.trim(),
        enabled: true,
      }));
    }
  }

  if (!sensors) {
    sensors = [
      { command: "getTempA", name: "Air Temperature", enabled: true },
      { command: "getTempWW", name: "DHW Temperature", enabled: true },
    ];
  }

  // Validate each command at config load so bad input fails fast and cannot
  // be smuggled into the vcontrold protocol stream.
  for (const sensor of sensors) {
    validateCommand(sensor.command);
  }

  return sensors;
}

export interface Config {
  mqtt: {
    brokerUrl: string;
    username?: string;
    password?: string;
    clientId: string;
    discoveryPrefix: string;
    stateTopicPrefix: string;
  };
  vcontrold: {
    host: string;
    port: number;
    reconnectInterval: number;
    commandTimeout: number;
  };
  sensors: SensorDefinition[];
  pollInterval: number;
  logLevel: string;
  homeAssistant: {
    deviceName: string;
    deviceManufacturer: string;
    deviceModel: string;
  };
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config: Config = {
  mqtt: {
    brokerUrl: getEnvOrThrow("MQTT_BROKER_URL"),
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: validateTopicSegment(
      "MQTT_CLIENT_ID",
      getEnvOrDefault("MQTT_CLIENT_ID", "vcontrold-adapter"),
    ),
    discoveryPrefix: validateTopicSegment(
      "MQTT_DISCOVERY_PREFIX",
      getEnvOrDefault("MQTT_DISCOVERY_PREFIX", "homeassistant"),
    ),
    stateTopicPrefix: validateTopicSegment(
      "MQTT_STATE_TOPIC_PREFIX",
      getEnvOrDefault("MQTT_STATE_TOPIC_PREFIX", "vcontrold"),
    ),
  },
  vcontrold: {
    host: getEnvOrThrow("VCONTROLD_HOST"),
    port: parsePort(
      "VCONTROLD_PORT",
      getEnvOrDefault("VCONTROLD_PORT", "3002"),
    ),
    reconnectInterval: parsePositiveInt(
      "VCONTROLD_RECONNECT_INTERVAL",
      getEnvOrDefault("VCONTROLD_RECONNECT_INTERVAL", "5000"),
    ),
    commandTimeout: parsePositiveInt(
      "VCONTROLD_COMMAND_TIMEOUT",
      getEnvOrDefault("VCONTROLD_COMMAND_TIMEOUT", "25000"),
    ),
  },
  sensors: loadSensors(),
  pollInterval: parsePositiveInt(
    "VCONTROLD_POLL_INTERVAL",
    getEnvOrDefault("VCONTROLD_POLL_INTERVAL", "60000"),
  ),
  logLevel: getEnvOrDefault("LOG_LEVEL", "info"),
  homeAssistant: {
    deviceName: getEnvOrDefault("HA_DEVICE_NAME", "Vcontrold Adapter"),
    deviceManufacturer: getEnvOrDefault("HA_DEVICE_MANUFACTURER", "Viessmann"),
    deviceModel: getEnvOrDefault("HA_DEVICE_MODEL", "vcontrold"),
  },
};
