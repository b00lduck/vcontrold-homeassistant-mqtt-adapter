import * as net from "node:net";
import { EventEmitter } from "node:events";
import { logger } from "./logger";
import { config } from "./config";

export interface VcontroldResponse {
  command: string;
  value: string;
  error?: string;
}

export class VcontroldClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private responseBuffer = "";

  constructor() {
    super();
  }

  public connect(): void {
    if (this.socket) {
      this.socket.destroy();
    }

    logger.info(
      `Connecting to vcontrold at ${config.vcontrold.host}:${config.vcontrold.port}`,
    );

    this.socket = new net.Socket();

    this.socket.on("connect", () => {
      logger.info("Connected to vcontrold");
      this.connected = true;
      this.responseBuffer = "";

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      this.emit("connected");
    });

    this.socket.on("data", (data: Buffer) => {
      this.handleData(data.toString());
    });

    this.socket.on("error", (error: Error) => {
      logger.error("vcontrold connection error:", error.message);
      this.emit("error", error);
    });

    this.socket.on("close", () => {
      logger.warn("vcontrold connection closed");
      this.connected = false;
      this.emit("disconnected");
      this.scheduleReconnect();
    });

    this.socket.connect(config.vcontrold.port, config.vcontrold.host);
  }

  private handleData(data: string): void {
    this.responseBuffer += data;

    // vcontrold typically returns responses line by line
    const lines = this.responseBuffer.split("\n");

    // Keep the last incomplete line in the buffer
    this.responseBuffer = lines.pop() || "";

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed) {
        logger.debug(`Received from vcontrold: ${trimmed}`);
        this.emit("response", trimmed);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    logger.info(
      `Scheduling reconnect in ${config.vcontrold.reconnectInterval}ms`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, config.vcontrold.reconnectInterval);
  }

  public async sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.socket) {
        reject(new Error("Not connected to vcontrold"));
        return;
      }

      const timeout = setTimeout(() => {
        responseListener && this.removeListener("response", responseListener);
        reject(new Error(`Command timeout: ${command}`));
      }, 5000);

      const responseListener = (response: string) => {
        clearTimeout(timeout);
        this.removeListener("response", responseListener);
        resolve(response);
      };

      this.once("response", responseListener);

      logger.debug(`Sending command to vcontrold: ${command}`);
      this.socket.write(command + "\n");
    });
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.connected = false;
  }
}
