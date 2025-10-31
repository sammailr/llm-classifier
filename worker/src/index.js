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

  const boss = new PgBoss(connectionString);

  boss.on('error', error => console.error('PgBoss error:', error));

  await boss.start();

  console.log('Worker started successfully');
  console.log(`Concurrency: ${WORKER_CONCURRENCY}`);

  // Register job handler
  await boss.work(
    QUEUE_NAMES.CLASSIFY_WEBSITE,
    { teamSize: WORKER_CONCURRENCY, teamConcurrency: WORKER_CONCURRENCY },
    async (job) => {
      try {
        console.log(`Processing job ${job.id} for website: ${job.data.url}`);
        await classifyWebsite(job.data);
        console.log(`Completed job ${job.id}`);
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        throw error; // Re-throw to trigger retry
      }
    }
  );

  console.log(`Listening for jobs on queue: ${QUEUE_NAMES.CLASSIFY_WEBSITE}`);

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
}

startWorker().catch(error => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
