import { Adapter } from "./adapter";
import { logger } from "./logger";

async function main() {
  logger.info("vcontrold Home Assistant MQTT Adapter");
  logger.info("======================================");

  const adapter = new Adapter();

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await adapter.stop();
      process.exit(0);
    } catch (error) {
      logger.error(`Error during shutdown: ${error}`);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (error: Error) => {
    logger.error(`Uncaught exception: ${error.message}`, { stack: error.stack });
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason: any) => {
    logger.error(`Unhandled rejection: ${reason}`);
    shutdown("unhandledRejection");
  });

  try {
    await adapter.start();
  } catch (error) {
    logger.error(`Failed to start adapter: ${error}`);
    process.exit(1);
  }
}

main();
