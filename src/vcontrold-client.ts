import * as net from "node:net";
import { EventEmitter } from "node:events";
import { logger } from "./logger";
import { config } from "./config";

export interface VcontroldResponse {
  command: string;
  value: string;
  error?: string;
}

interface QueuedRequest {
  command: string;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class VcontroldClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private responseBuffer = "";
  private requestQueue: QueuedRequest[] = [];
  private currentRequest: QueuedRequest | null = null;
  private isProcessingQueue = false;

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

        // Deliver response to the current waiting request
        if (this.currentRequest) {
          clearTimeout(this.currentRequest.timeout);
          this.currentRequest.resolve(trimmed);
          this.currentRequest = null;

          // Process next request in queue
          this.processNextRequest();
        } else {
          // Fallback to event emission if no request is waiting
          this.emit("response", trimmed);
        }
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
        // Remove from current request if it's this one
        if (this.currentRequest && this.currentRequest.command === command) {
          this.currentRequest = null;
        }
        // Remove from queue if still waiting
        this.requestQueue = this.requestQueue.filter(
          (req) => req.command !== command,
        );
        reject(new Error(`Command timeout: ${command}`));

        // Process next request after timeout
        this.processNextRequest();
      }, 5000);

      const queuedRequest: QueuedRequest = {
        command,
        resolve,
        reject,
        timeout,
      };

      // Add to queue
      this.requestQueue.push(queuedRequest);

      // Start processing if not already processing
      if (!this.isProcessingQueue) {
        this.processNextRequest();
      }
    });
  }

  private processNextRequest(): void {
    // Already processing or no requests to process
    if (this.currentRequest || this.requestQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;

    // Get next request from queue
    this.currentRequest = this.requestQueue.shift()!;

    // Send the command
    logger.debug(
      `Sending command to vcontrold: ${this.currentRequest.command}`,
    );
    this.socket!.write(this.currentRequest.command + "\n");
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clear current request and queue
    if (this.currentRequest) {
      clearTimeout(this.currentRequest.timeout);
      this.currentRequest.reject(new Error("Connection closed"));
      this.currentRequest = null;
    }

    this.requestQueue.forEach((req) => {
      clearTimeout(req.timeout);
      req.reject(new Error("Connection closed"));
    });
    this.requestQueue = [];
    this.isProcessingQueue = false;

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.connected = false;
  }
}
