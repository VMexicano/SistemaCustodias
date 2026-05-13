import { buildApp } from './app.js';
import { env } from './config/environment.js';
import { db } from './config/database.js';
import { redis } from './config/redis.js';

async function main() {
  // Connect to Redis before initializing BullMQ queues — workers need an active connection
  await redis.connect();

  const app = await buildApp();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    await db.destroy();
    await redis.quit();
    app.log.info('Server closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server running at http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
