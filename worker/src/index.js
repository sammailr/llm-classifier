import dotenv from 'dotenv';
import PgBoss from 'pg-boss';
import { classifyWebsite } from './classifier.js';

dotenv.config();

const QUEUE_NAMES = {
  CLASSIFY_WEBSITE: 'classify-website',
};

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '10', 10);

async function startWorker() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const boss = new PgBoss({
    connectionString,
    max: 20, // Max connection pool size (2x concurrency)
    application_name: 'llm-classifier-worker',
    noSupervisor: false, // Enable pg-boss supervisor for auto-recovery
    noScheduling: true, // We don't use scheduled jobs
  });

  boss.on('error', error => console.error('PgBoss error:', error));
  boss.on('wip', jobs => console.log(`Active jobs: ${jobs.length}`));

  await boss.start();

  console.log('Worker started successfully');
  console.log(`Concurrency: ${WORKER_CONCURRENCY}`);
  console.log(`Max connections: 20`);

  // Register job handler
  await boss.work(
    QUEUE_NAMES.CLASSIFY_WEBSITE,
    {
      teamSize: WORKER_CONCURRENCY,
      teamConcurrency: WORKER_CONCURRENCY,
      includeMetadata: true
    },
    async (job) => {
      try {
        console.log(`Processing job ${job.id} for website: ${job.data.url}`);
        await classifyWebsite(job.data);
        console.log(`Completed job ${job.id}`);
      } catch (error) {
        // Log error but don't re-throw
        // classifyWebsite already handles errors and marks websites as failed
        console.error(`Error processing job ${job.id}:`, error.message);
      }
    }
  );

  console.log(`Listening for jobs on queue: ${QUEUE_NAMES.CLASSIFY_WEBSITE}`);

  // Health check interval
  setInterval(async () => {
    try {
      const queueSize = await boss.getQueueSize(QUEUE_NAMES.CLASSIFY_WEBSITE);
      console.log(`Health check - Queue size: ${queueSize}`);
    } catch (err) {
      console.error('Health check failed:', err.message);
    }
  }, 60000); // Every minute

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await boss.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await boss.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    // Don't exit - let supervisor handle it
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    // Don't exit - let supervisor handle it
  });

  return boss;
}

startWorker().catch(error => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
