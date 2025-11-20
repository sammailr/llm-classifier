#!/usr/bin/env node

/**
 * List recent batches
 */

import pg from 'pg';
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
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const result = await pool.query(`
      SELECT
        b.id,
        b.name,
        b.status,
        b.total_count,
        b.completed_count,
        b.failed_count,
        b.created_at,
        (SELECT COUNT(*) FROM websites WHERE batch_id = b.id AND status = 'pending') as pending_count
      FROM batches b
      ORDER BY b.created_at DESC
      LIMIT 10
    `);

    console.log('\n📦 Recent Batches:\n');
    console.log('─'.repeat(120));
    console.log('ID'.padEnd(38) + 'Name'.padEnd(30) + 'Status'.padEnd(12) + 'Total'.padEnd(10) + 'Pending'.padEnd(10) + 'Completed'.padEnd(12) + 'Created');
    console.log('─'.repeat(120));

    result.rows.forEach(batch => {
      const id = batch.id.substring(0, 36);
      const name = (batch.name || '').substring(0, 28).padEnd(30);
      const status = batch.status.padEnd(12);
      const total = String(batch.total_count).padEnd(10);
      const pending = String(batch.pending_count).padEnd(10);
      const completed = String(batch.completed_count || 0).padEnd(12);
      const created = new Date(batch.created_at).toLocaleString().substring(0, 20);

      console.log(`${id} ${name} ${status} ${total} ${pending} ${completed} ${created}`);
    });

    console.log('─'.repeat(120));
    console.log('\n💡 To enqueue jobs for a batch, run:');
    console.log('   node scripts/enqueue-batch-jobs.js <batch-id>\n');

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

main();
