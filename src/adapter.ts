import { VcontroldClient } from "./vcontrold-client";
import { MqttAdapter, SensorConfig } from "./mqtt-adapter";
import { logger } from "./logger";
import { config } from "./config";

export class Adapter {
  private readonly vcontrold: VcontroldClient;
  private readonly mqtt: MqttAdapter;
  private sensors: SensorConfig[] = [];
  private shuttingDown = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.vcontrold = new VcontroldClient();
    this.mqtt = new MqttAdapter();
    this.setupSensors();
    this.setupEventHandlers();
  }

  private setupSensors(): void {
    // Parse sensor commands and create configurations
    this.sensors = config.sensors.map((sensorDef) => {
      const command = sensorDef.command;
      const lowerCmd = command.toLowerCase();
      const customName = sensorDef.name;
      const sensorConfig: SensorConfig = {
        command: command,
        name: customName || this.commandToName(command),
        uniqueId: this.commandToUniqueId(command),
        component: "sensor", // default to sensor
      };

      // Detect binary sensors (status/flag readings)
      if (
        lowerCmd.includes("status") ||
        lowerCmd.includes("pumpe") ||
        lowerCmd.includes("flag")
      ) {
        sensorConfig.component = "binary_sensor";
        sensorConfig.payloadOn = "1";
        sensorConfig.payloadOff = "0";

        // Set device class for pumps/motors
        if (lowerCmd.includes("pumpe") || lowerCmd.includes("pump")) {
          sensorConfig.deviceClass = "running";
        }
      }
      // Temperature sensors
      else if (lowerCmd.includes("temp")) {
        sensorConfig.deviceClass = "temperature";
        sensorConfig.unitOfMeasurement = "°C";
        sensorConfig.stateClass = "measurement";
      }
      // Percent sensors (throttle, mixer, power)
      else if (
        lowerCmd.includes("position") ||
        lowerCmd.includes("leistung") ||
        lowerCmd.includes("percent")
      ) {
        sensorConfig.unitOfMeasurement = "%";
        sensorConfig.stateClass = "measurement";

        if (lowerCmd.includes("leistung") || lowerCmd.includes("power")) {
          sensorConfig.deviceClass = "power_factor";
        }
      }
      // Pressure sensors
      else if (lowerCmd.includes("pressure") || lowerCmd.includes("druck")) {
        sensorConfig.deviceClass = "pressure";
        sensorConfig.unitOfMeasurement = "bar";
        sensorConfig.stateClass = "measurement";
      }
      // Energy sensors
      else if (lowerCmd.includes("energy") || lowerCmd.includes("energie")) {
        sensorConfig.deviceClass = "energy";
        sensorConfig.unitOfMeasurement = "kWh";
        sensorConfig.stateClass = "total_increasing";
      }

      return sensorConfig;
    });

    logger.info(
      `Configured ${this.sensors.length} sensors: ${this.sensors.map((s) => s.name).join(", ")}`,
    );
  }

  private commandToName(command: string): string {
    // Convert command like "getTempA" to "Temperature A"
    return command
      .replace(/^get/, "")
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/^./, (str) => str.toUpperCase());
  }

  private commandToUniqueId(command: string): string {
    // Convert to snake_case for unique ID
    return command
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, "");
  }

  private setupEventHandlers(): void {
    this.vcontrold.on("connected", () => {
      logger.info("vcontrold connected event");
      this.mqtt.publishAvailability(true);
      this.startPolling();
    });

    this.vcontrold.on("disconnected", () => {
      logger.info("vcontrold disconnected event");
      this.mqtt.publishAvailability(false);
      this.stopPolling();
    });

    this.vcontrold.on("error", (error: Error) => {
      logger.error("vcontrold error:", error);
    });
  }

  public async start(): Promise<void> {
    try {
      logger.info("Starting vcontrold-ha-mqtt-adapter");

      // Connect to MQTT first
      await this.mqtt.connect();

      // Publish discovery messages for all sensors
      this.sensors.forEach((sensor) => {
        this.mqtt.publishDiscovery(sensor);
      });

      // Connect to vcontrold
      this.vcontrold.connect();

      logger.info("Adapter started successfully");
    } catch (error) {
      logger.error("Failed to start adapter:", error);
      throw error;
    }
  }

  private startPolling(): void {
    if (this.pollTimer || this.shuttingDown) {
      return;
    }

    logger.info(`Starting sensor polling every ${config.pollInterval}ms`);

    // Poll immediately
    this.pollSensors();

    // Then poll at intervals
    this.pollTimer = setInterval(() => {
      this.pollSensors();
    }, config.pollInterval);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      logger.info("Stopped sensor polling");
    }
  }

  private async pollSensors(): Promise<void> {
    if (!this.vcontrold.isConnected()) {
      logger.debug("Skipping poll: vcontrold not connected");
      return;
    }

    logger.debug("Polling sensors");

    for (const sensor of this.sensors) {
      try {
        const response = await this.vcontrold.sendCommand(sensor.command);
        const value = this.parseResponse(response);

        if (value !== null) {
          logger.debug(`${sensor.name}: ${value}`);
          this.mqtt.publishState(sensor.uniqueId, value);
        } else {
          logger.warn(
            `Failed to parse response for ${sensor.command}: ${response}`,
          );
        }
      } catch (error) {
        logger.error(`Error polling sensor ${sensor.command}:`, error);
      }
    }
  }

  private parseResponse(response: string): string | number | null {
    // vcontrold typically returns responses like "value unit" or just "value"
    // This is a basic parser - adjust based on your actual vcontrold response format

    const trimmed = response.trim();

    // Try to extract numeric value
    const match = trimmed.match(/(-?\d+\.?\d*)/);
    if (match) {
      const numValue = parseFloat(match[1]);
      return isNaN(numValue) ? trimmed : numValue;
    }

    return trimmed || null;
  }

  public async stop(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;
    logger.info("Stopping adapter");

    this.stopPolling();
    this.mqtt.publishAvailability(false);

    this.vcontrold.disconnect();
    await this.mqtt.disconnect();

    logger.info("Adapter stopped");
  }
}
