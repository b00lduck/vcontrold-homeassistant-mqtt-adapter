import mqtt, { MqttClient } from "mqtt";
import { logger } from "./logger";
import { config } from "./config";

export interface SensorConfig {
  command: string;
  name: string;
  uniqueId: string;
  component: "sensor" | "binary_sensor";
  deviceClass?: string;
  unitOfMeasurement?: string;
  stateClass?: string;
  payloadOn?: string;
  payloadOff?: string;
}

export class MqttAdapter {
  private client: MqttClient | null = null;
  private readonly deviceId: string;

  constructor() {
    this.deviceId = config.mqtt.clientId.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: mqtt.IClientOptions = {
        clientId: config.mqtt.clientId,
        clean: true,
        reconnectPeriod: 5000,
      };

      if (config.mqtt.username) {
        options.username = config.mqtt.username;
        options.password = config.mqtt.password;
      }

      logger.info(`Connecting to MQTT broker: ${config.mqtt.brokerUrl}`);

      this.client = mqtt.connect(config.mqtt.brokerUrl, options);

      this.client.on("connect", () => {
        logger.info("Connected to MQTT broker");
        resolve();
      });

      this.client.on("error", (error: Error) => {
        logger.error("MQTT error:", error.message);
        reject(error);
      });

      this.client.on("reconnect", () => {
        logger.info("Reconnecting to MQTT broker");
      });

      this.client.on("offline", () => {
        logger.warn("MQTT client offline");
      });
    });
  }

  public publishDiscovery(sensor: SensorConfig): void {
    if (!this.client?.connected) {
      logger.warn("Cannot publish discovery: MQTT not connected");
      return;
    }

    const component = sensor.component || "sensor";
    const discoveryTopic = `${config.mqtt.discoveryPrefix}/${component}/${this.deviceId}/${sensor.uniqueId}/config`;
    const stateTopic = `${config.mqtt.stateTopicPrefix}/${sensor.uniqueId}/state`;

    const discoveryPayload: any = {
      name: sensor.name,
      unique_id: `${this.deviceId}_${sensor.uniqueId}`,
      state_topic: stateTopic,
      device: {
        identifiers: [this.deviceId],
        name: config.homeAssistant.deviceName,
        manufacturer: config.homeAssistant.deviceManufacturer,
        model: config.homeAssistant.deviceModel,
      },
      ...(sensor.deviceClass && { device_class: sensor.deviceClass }),
      ...(sensor.unitOfMeasurement && {
        unit_of_measurement: sensor.unitOfMeasurement,
      }),
      ...(sensor.stateClass && { state_class: sensor.stateClass }),
    };

    // Add binary sensor specific fields
    if (component === "binary_sensor") {
      discoveryPayload.payload_on = sensor.payloadOn || "1";
      discoveryPayload.payload_off = sensor.payloadOff || "0";
    }

    logger.info(`Publishing discovery for ${component}: ${sensor.name}`);
    logger.debug(`Discovery topic: ${discoveryTopic}`);
    logger.debug(
      `Discovery payload: ${JSON.stringify(discoveryPayload, null, 2)}`,
    );

    this.client.publish(discoveryTopic, JSON.stringify(discoveryPayload), {
      retain: true,
      qos: 1,
    });
  }

  public publishState(sensorUniqueId: string, value: string | number): void {
    if (!this.client?.connected) {
      logger.warn("Cannot publish state: MQTT not connected");
      return;
    }

    const stateTopic = `${config.mqtt.stateTopicPrefix}/${sensorUniqueId}/state`;

    logger.debug(`Publishing state to ${stateTopic}: ${value}`);

    this.client.publish(stateTopic, value.toString(), {
      retain: true,
      qos: 1,
    });
  }

  public publishAvailability(available: boolean): void {
    if (!this.client?.connected) {
      return;
    }

    const availabilityTopic = `${config.mqtt.stateTopicPrefix}/availability`;
    const payload = available ? "online" : "offline";

    logger.info(`Publishing availability: ${payload}`);

    this.client.publish(availabilityTopic, payload, {
      retain: true,
      qos: 1,
    });
  }

  public disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve();
        return;
      }

      this.publishAvailability(false);

      this.client.end(false, {}, () => {
        logger.info("Disconnected from MQTT broker");
        resolve();
      });
    });
  }

  public isConnected(): boolean {
    return this.client?.connected || false;
  }
}
