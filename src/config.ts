import dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

// Load environment variables
dotenv.config();

export interface SensorDefinition {
  command: string;
  name?: string;
  enabled: boolean;
}

function loadSensors(): SensorDefinition[] {
  try {
    const configPath = path.join(process.cwd(), "sensors.json");
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      const sensors = JSON.parse(content) as SensorDefinition[];
      return sensors.filter((s) => s.enabled !== false);
    }
  } catch (error) {
    console.warn(
      "Could not load sensors.json, falling back to environment variable",
    );
  }

  // Fallback to environment variable if JSON file doesn't exist
  const envSensors = process.env.VCONTROLD_SENSORS;
  if (envSensors) {
    return envSensors.split(",").map((cmd) => ({
      command: cmd.trim(),
      enabled: true,
    }));
  }

  // Default sensors if nothing is configured
  return [
    { command: "getTempA", name: "Air Temperature", enabled: true },
    { command: "getTempWW", name: "DHW Temperature", enabled: true },
  ];
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
    clientId: getEnvOrDefault("MQTT_CLIENT_ID", "vcontrold-adapter"),
    discoveryPrefix: getEnvOrDefault("MQTT_DISCOVERY_PREFIX", "homeassistant"),
    stateTopicPrefix: getEnvOrDefault("MQTT_STATE_TOPIC_PREFIX", "vcontrold"),
  },
  vcontrold: {
    host: getEnvOrThrow("VCONTROLD_HOST"),
    port: parseInt(getEnvOrDefault("VCONTROLD_PORT", "3002"), 10),
    reconnectInterval: parseInt(
      getEnvOrDefault("VCONTROLD_RECONNECT_INTERVAL", "5000"),
      10,
    ),
    commandTimeout: parseInt(
      getEnvOrDefault("VCONTROLD_COMMAND_TIMEOUT", "25000"),
      10,
    ),
  },
  sensors: loadSensors(),
  pollInterval: parseInt(
    getEnvOrDefault("VCONTROLD_POLL_INTERVAL", "60000"),
    10,
  ),
  logLevel: getEnvOrDefault("LOG_LEVEL", "info"),
  homeAssistant: {
    deviceName: getEnvOrDefault("HA_DEVICE_NAME", "Vcontrold Adapter"),
    deviceManufacturer: getEnvOrDefault("HA_DEVICE_MANUFACTURER", "Viessmann"),
    deviceModel: getEnvOrDefault("HA_DEVICE_MODEL", "vcontrold"),
  },
};
