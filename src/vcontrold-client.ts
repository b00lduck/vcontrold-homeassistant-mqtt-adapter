import * as net from "node:net";
import { EventEmitter } from "node:events";
import { logger } from "./logger";
import { config } from "./config";

// vcontrold protocol constants (from prompt.h)
const PROMPT = "vctrld>";
const ERR_PREFIX = "ERR:";
const BYE = "good bye!";

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
  startTime: number;
}

export class VcontroldClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private responseBuffer = "";
  private requestQueue: QueuedRequest[] = [];
  private currentRequest: QueuedRequest | null = null;
  private isProcessingQueue = false;
  private readyForCommands = false;

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
      logger.info("Connected to vcontrold, waiting for initial prompt");
      this.connected = true;
      this.responseBuffer = "";
      this.readyForCommands = false;

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

    // Check if we have the prompt, which indicates end of response
    const promptIndex = this.responseBuffer.indexOf(PROMPT);
    if (promptIndex === -1) {
      // No prompt yet, wait for more data
      return;
    }

    // Extract response up to the prompt
    const response = this.responseBuffer.substring(0, promptIndex).trim();
    // Keep everything after the prompt for next response
    this.responseBuffer = this.responseBuffer.substring(
      promptIndex + PROMPT.length,
    );

    logger.debug(`Received from vcontrold: ${response}`);

    // Check if this is the initial connection prompt
    if (!this.readyForCommands) {
      this.readyForCommands = true;
      logger.info("Received initial prompt, ready for commands");
      // Start processing queued requests
      this.processNextRequest();
      return;
    }

    // Deliver response to the current waiting request
    if (this.currentRequest) {
      clearTimeout(this.currentRequest.timeout);
      const duration = Date.now() - this.currentRequest.startTime;

      // Check for errors
      if (response.startsWith(ERR_PREFIX)) {
        logger.warn(`vcontrold error: ${response} (took ${duration}ms)`);
        this.currentRequest.reject(new Error(response));
      } else {
        logger.debug(
          `Command '${this.currentRequest.command}' completed in ${duration}ms`,
        );
        this.currentRequest.resolve(response);
      }

      this.currentRequest = null;

      // Process next request in queue
      this.processNextRequest();
    } else {
      // Fallback to event emission if no request is waiting
      this.emit("response", response);
    }
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
      }, config.vcontrold.commandTimeout);

      const queuedRequest: QueuedRequest = {
        command,
        resolve,
        reject,
        timeout,
        startTime: Date.now(),
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
    // Already processing, no requests to process, or not ready yet
    if (
      this.currentRequest ||
      this.requestQueue.length === 0 ||
      !this.readyForCommands
    ) {
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
    this.readyForCommands = false;

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.connected = false;
  }
}
