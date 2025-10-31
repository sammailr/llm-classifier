import PgBoss from 'pg-boss';

let boss = null;

export const QUEUE_NAMES = {
  CLASSIFY_WEBSITE: 'classify-website',
};

export async function initQueue() {
  if (boss) return boss;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  boss = new PgBoss(connectionString);

  boss.on('error', error => console.error('PgBoss error:', error));

  await boss.start();

  console.log('PgBoss queue started');

  return boss;
}

export async function getQueue() {
  if (!boss) {
    await initQueue();
  }
  return boss;
}

export async function enqueueJob(queueName, data, options = {}) {
  const queue = await getQueue();
  const jobId = await queue.send(queueName, data, {
    retryLimit: 3,
    retryDelay: 60, // 1 minute
    retryBackoff: true,
    ...options,
  });
  return jobId;
}

export default { initQueue, getQueue, enqueueJob, QUEUE_NAMES };
