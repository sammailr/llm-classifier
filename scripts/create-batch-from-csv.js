#!/usr/bin/env node

/**
 * Bulk Batch Creation Script
 *
 * Creates a classification batch from a CSV file with unlimited URLs.
 * Bypasses API limits by directly inserting into Supabase and enqueueing jobs.
 *
 * Usage:
 *   node scripts/create-batch-from-csv.js <csv-file> <batch-name> [prompt-id]
 *
 * Example:
 *   node scripts/create-batch-from-csv.js urls.csv "Large Batch 1"
 *   node scripts/create-batch-from-csv.js urls.csv "Large Batch 1" "uuid-of-custom-prompt"
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import PgBoss from 'pg-boss';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'api', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

// Debug: Show what we loaded (masked for security)
console.log('\n🔍 Debug Info:');
console.log(`   SUPABASE_URL: ${SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : 'NOT SET'}`);
console.log(`   SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_KEY ? SUPABASE_SERVICE_KEY.substring(0, 20) + '...' : 'NOT SET'}`);
console.log(`   DATABASE_URL: ${DATABASE_URL ? DATABASE_URL.substring(0, 40) + '...' : 'NOT SET'}\n`);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('   Make sure api/.env has SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL in .env file');
  console.error('   Make sure api/.env has DATABASE_URL');
  process.exit(1);
}

// Use service key to bypass RLS policies
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const WEBSITE_CHUNK_SIZE = 500; // Insert websites in chunks of 500
const JOB_CHUNK_SIZE = 100; // Enqueue jobs in chunks of 100

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node scripts/create-batch-from-csv.js <csv-file> <batch-name> [prompt-id]');
    process.exit(1);
  }

  const csvPath = args[0];
  const batchName = args[1];
  const promptId = args[2] || null;

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log('\n🚀 Starting bulk batch creation...\n');
  console.log(`📁 CSV File: ${csvPath}`);
  console.log(`📦 Batch Name: ${batchName}`);
  console.log(`🎯 Prompt ID: ${promptId || 'Default MCA Classifier'}\n`);

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
      console.error('❌ No URLs found in CSV. Make sure there is a column named "url", "website", or "URL"');
      process.exit(1);
    }

    console.log(`✅ Found ${urls.length.toLocaleString()} URLs\n`);

    // Step 2: Create batch
    console.log('📝 Creating batch in database...');
    console.log('   (Testing Supabase connection...)');

    const batchPromise = supabase
      .from('batches')
      .insert({
        name: batchName,
        prompt_id: promptId,
        total_count: urls.length,
        status: 'pending',
      })
      .select()
      .single();

    // Add timeout to detect connection issues
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Supabase connection timeout (30s)')), 30000)
    );

    const { data: batch, error: batchError } = await Promise.race([
      batchPromise,
      timeoutPromise
    ]).catch(err => {
      console.error('\n❌ Failed to create batch:', err.message);
      console.error('\nTroubleshooting:');
      console.error('   1. Check your Supabase credentials in api/.env');
      console.error('   2. Verify your network connection');
      console.error('   3. Ensure SUPABASE_URL and SUPABASE_ANON_KEY are correct');
      console.error('   4. Try running: curl ' + SUPABASE_URL + '/rest/v1/');
      process.exit(1);
    });

    if (batchError) {
      console.error('❌ Failed to create batch:', batchError.message);
      console.error('   Error details:', batchError);
      process.exit(1);
    }

    console.log(`✅ Batch created with ID: ${batch.id}\n`);

    // Step 3: Insert websites in chunks
    console.log(`💾 Inserting ${urls.length.toLocaleString()} websites in chunks of ${WEBSITE_CHUNK_SIZE}...\n`);

    const websiteRecords = urls.map(url => ({
      batch_id: batch.id,
      url,
      status: 'pending',
    }));

    const allWebsites = [];
    const totalChunks = Math.ceil(websiteRecords.length / WEBSITE_CHUNK_SIZE);

    for (let i = 0; i < websiteRecords.length; i += WEBSITE_CHUNK_SIZE) {
      const chunk = websiteRecords.slice(i, i + WEBSITE_CHUNK_SIZE);
      const chunkNumber = Math.floor(i / WEBSITE_CHUNK_SIZE) + 1;

      process.stdout.write(`   Chunk ${chunkNumber}/${totalChunks} (${chunk.length} websites)...`);

      const { data: chunkWebsites, error: chunkError } = await supabase
        .from('websites')
        .insert(chunk)
        .select();

      if (chunkError) {
        console.error(`\n❌ Error inserting chunk ${chunkNumber}:`, chunkError.message);
        throw chunkError;
      }

      allWebsites.push(...chunkWebsites);
      console.log(` ✅ (${allWebsites.length.toLocaleString()}/${urls.length.toLocaleString()} total)`);
    }

    console.log(`\n✅ All ${allWebsites.length.toLocaleString()} websites inserted successfully!\n`);

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

    console.log(`\n✅ All ${allWebsites.length.toLocaleString()} jobs enqueued successfully!\n`);

    // Step 5: Update batch status to processing
    console.log('📊 Updating batch status...');
    await supabase
      .from('batches')
      .update({ status: 'processing' })
      .eq('id', batch.id);

    console.log('✅ Batch status updated to "processing"\n');

    await boss.stop();

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
    process.exit(1);
  }
}

main();
