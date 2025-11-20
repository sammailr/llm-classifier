#!/usr/bin/env node

/**
 * Enqueue jobs for an existing batch
 *
 * Usage: node scripts/enqueue-batch-jobs.js <batch-id>
 */

import pg from 'pg';
import PgBoss from 'pg-boss';
import dotenv from 'dotenv';
import path from 'path';

const { Pool } = pg;

dotenv.config({ path: path.join(process.cwd(), 'api', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL in api/.env');
  process.exit(1);
}

async function main() {
  const batchId = process.argv[2];

  if (!batchId) {
    console.error('Usage: node scripts/enqueue-batch-jobs.js <batch-id>');
    console.error('\nTo find batch IDs, check your dashboard or run:');
    console.error('  SELECT id, name, status FROM batches ORDER BY created_at DESC LIMIT 10;');
    process.exit(1);
  }

  console.log(`\n🚀 Enqueueing jobs for batch: ${batchId}\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Get batch info
    const batchResult = await pool.query(
      'SELECT id, name, status, total_count FROM batches WHERE id = $1',
      [batchId]
    );

    if (batchResult.rows.length === 0) {
      console.error(`❌ Batch not found: ${batchId}`);
      process.exit(1);
    }

    const batch = batchResult.rows[0];
    console.log(`📦 Batch: ${batch.name}`);
    console.log(`   Status: ${batch.status}`);
    console.log(`   Total: ${batch.total_count}\n`);

    // Get all pending websites
    const websitesResult = await pool.query(
      `SELECT id, url, status FROM websites
       WHERE batch_id = $1 AND status = 'pending'
       ORDER BY created_at`,
      [batchId]
    );

    const websites = websitesResult.rows;
    console.log(`📝 Found ${websites.length} pending websites\n`);

    if (websites.length === 0) {
      console.log('✅ No pending websites - nothing to enqueue!');
      process.exit(0);
    }

    // Connect to pg-boss
    console.log('🔗 Connecting to job queue...');
    const boss = new PgBoss({
      connectionString: DATABASE_URL,
      max: 5,
    });

    await boss.start();
    console.log('✅ Connected\n');

    // Enqueue jobs in chunks
    console.log(`⚡ Enqueueing ${websites.length} jobs in chunks of 100...\n`);

    const CHUNK_SIZE = 100;
    let enqueuedCount = 0;

    for (let i = 0; i < websites.length; i += CHUNK_SIZE) {
      const chunk = websites.slice(i, i + CHUNK_SIZE);

      const jobs = chunk.map(website => ({
        name: 'classify-website',
        data: {
          website_id: website.id,
          batch_id: batchId,
          url: website.url,
          prompt_id: null,
        },
      }));

      await boss.insert(jobs);
      enqueuedCount += chunk.length;

      process.stdout.write(`   ${enqueuedCount}/${websites.length} jobs enqueued\r`);
    }

    console.log(`\n\n✅ All ${enqueuedCount} jobs enqueued successfully!`);
    console.log(`\n🔍 Check your dashboard - processing should start immediately\n`);

    await boss.stop();
    await pool.end();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

main();
