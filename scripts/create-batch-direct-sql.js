#!/usr/bin/env node

/**
 * Bulk Batch Creation Script - Direct SQL Version
 *
 * Uses direct PostgreSQL connection to bypass Supabase REST API timeouts.
 * Creates a classification batch from a CSV file with unlimited URLs.
 *
 * Usage:
 *   node scripts/create-batch-direct-sql.js <csv-file> <batch-name> [prompt-id]
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import PgBoss from 'pg-boss';
import dotenv from 'dotenv';

const { Pool } = pg;

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'api', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL in api/.env file');
  process.exit(1);
}

console.log('\n🔍 Using direct PostgreSQL connection');
console.log(`   DATABASE: ${DATABASE_URL.substring(0, 40)}...\n`);

const WEBSITE_CHUNK_SIZE = 500;
const JOB_CHUNK_SIZE = 100;

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node scripts/create-batch-direct-sql.js <csv-file> <batch-name> [prompt-id]');
    process.exit(1);
  }

  const csvPath = args[0];
  const batchName = args[1];
  const promptId = args[2] || null;

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log('🚀 Starting bulk batch creation (Direct SQL)...\n');
  console.log(`📁 CSV File: ${csvPath}`);
  console.log(`📦 Batch Name: ${batchName}`);
  console.log(`🎯 Prompt ID: ${promptId || 'Default MCA Classifier'}\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Step 1: Parse CSV
    console.log('📖 Reading CSV file...');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const urls = records
      .map(record => record.url || record.website || record.URL)
      .filter(Boolean);

    if (urls.length === 0) {
      console.error('❌ No URLs found in CSV');
      process.exit(1);
    }

    console.log(`✅ Found ${urls.length.toLocaleString()} URLs\n`);

    // Step 2: Create batch
    console.log('📝 Creating batch in database...');

    const batchResult = await pool.query(
      `INSERT INTO batches (name, prompt_id, total_count, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', NOW(), NOW())
       RETURNING id, name, created_at`,
      [batchName, promptId, urls.length]
    );

    const batch = batchResult.rows[0];
    console.log(`✅ Batch created with ID: ${batch.id}\n`);

    // Step 3: Insert websites in chunks
    console.log(`💾 Inserting ${urls.length.toLocaleString()} websites in chunks of ${WEBSITE_CHUNK_SIZE}...\n`);

    const allWebsites = [];
    const totalChunks = Math.ceil(urls.length / WEBSITE_CHUNK_SIZE);

    for (let i = 0; i < urls.length; i += WEBSITE_CHUNK_SIZE) {
      const chunk = urls.slice(i, i + WEBSITE_CHUNK_SIZE);
      const chunkNumber = Math.floor(i / WEBSITE_CHUNK_SIZE) + 1;

      process.stdout.write(`   Chunk ${chunkNumber}/${totalChunks} (${chunk.length} websites)...`);

      // Build VALUES string: ($1, $2), ($3, $4), ...
      const values = [];
      const params = [];
      chunk.forEach((url, idx) => {
        const paramOffset = idx * 2;
        values.push(`($${paramOffset + 1}, $${paramOffset + 2}, 'pending', NOW())`);
        params.push(batch.id, url);
      });

      const insertQuery = `
        INSERT INTO websites (batch_id, url, status, created_at)
        VALUES ${values.join(', ')}
        RETURNING id, url
      `;

      const result = await pool.query(insertQuery, params);
      allWebsites.push(...result.rows);

      console.log(` ✅ (${allWebsites.length.toLocaleString()}/${urls.length.toLocaleString()} total)`);
    }

    console.log(`\n✅ All ${allWebsites.length.toLocaleString()} websites inserted!\n`);

    // Step 4: Enqueue jobs
    console.log('🔗 Connecting to job queue...');
    const boss = new PgBoss({
      connectionString: DATABASE_URL,
      max: 5,
    });

    await boss.start();
    console.log('✅ Connected to pg-boss\n');

    console.log(`⚡ Enqueueing ${allWebsites.length.toLocaleString()} jobs in chunks of ${JOB_CHUNK_SIZE}...\n`);

    const totalJobChunks = Math.ceil(allWebsites.length / JOB_CHUNK_SIZE);
    let enqueuedCount = 0;

    for (let i = 0; i < allWebsites.length; i += JOB_CHUNK_SIZE) {
      const chunk = allWebsites.slice(i, i + JOB_CHUNK_SIZE);
      const chunkNumber = Math.floor(i / JOB_CHUNK_SIZE) + 1;

      process.stdout.write(`   Chunk ${chunkNumber}/${totalJobChunks} (${chunk.length} jobs)...`);

      const jobs = chunk.map(website => ({
        name: 'classify-website',
        data: {
          website_id: website.id,
          batch_id: batch.id,
          url: website.url,
          prompt_id: promptId,
        },
      }));

      await boss.insert(jobs);
      enqueuedCount += chunk.length;

      console.log(` ✅ (${enqueuedCount.toLocaleString()}/${allWebsites.length.toLocaleString()} total)`);
    }

    console.log(`\n✅ All ${allWebsites.length.toLocaleString()} jobs enqueued!\n`);

    // Step 5: Update batch status
    console.log('📊 Updating batch status...');
    await pool.query(
      `UPDATE batches SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [batch.id]
    );
    console.log('✅ Batch status updated to "processing"\n');

    await boss.stop();
    await pool.end();

    console.log('✨ DONE! ✨\n');
    console.log('📈 Summary:');
    console.log(`   • Batch ID: ${batch.id}`);
    console.log(`   • Batch Name: ${batchName}`);
    console.log(`   • Total URLs: ${urls.length.toLocaleString()}`);
    console.log(`   • Websites Inserted: ${allWebsites.length.toLocaleString()}`);
    console.log(`   • Jobs Enqueued: ${enqueuedCount.toLocaleString()}`);
    console.log(`   • Status: Processing\n`);
    console.log('🔍 Check your dashboard to monitor progress!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error('Stack:', error.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
