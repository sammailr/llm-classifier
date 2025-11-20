import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import supabase from '../supabase.js';
import pool from '../db.js';
import { enqueueJob, QUEUE_NAMES } from '../queue.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all batches - Using direct SQL to bypass Supabase REST API timeouts
router.get('/', async (req, res, next) => {
  try {
    console.log('Fetching batches via direct SQL...');

    const result = await pool.query(`
      SELECT id, name, status, total_count, completed_count, failed_count, created_at, updated_at
      FROM batches
      ORDER BY created_at DESC
      LIMIT 50
    `);

    console.log(`Fetched ${result.rows.length} batches`);

    // Return batches with placeholder stats
    const response = result.rows.map(batch => ({
      ...batch,
      classification_yes: 0,
      classification_no: 0,
    }));

    res.json(response);
  } catch (error) {
    console.error('Error in GET /batches:', error);
    next(error);
  }
});

// Get single batch with websites
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: batch, error: batchError } = await supabase
      .from('batches')
      .select('*')
      .eq('id', id)
      .single();

    if (batchError) throw batchError;

    const { data: websites, error: websitesError } = await supabase
      .from('websites')
      .select('*, classification_results(*)')
      .eq('batch_id', id)
      .order('created_at', { ascending: false });

    if (websitesError) throw websitesError;

    res.json({ ...batch, websites });
  } catch (error) {
    next(error);
  }
});

// Create new batch from CSV or JSON - Using direct SQL
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { prompt_id, name } = req.body;
    let urls = [];

    console.log('Creating batch - parsing URLs...');

    // Parse URLs from file or body
    if (req.file) {
      const fileContent = req.file.buffer.toString('utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      urls = records.map(record => record.url || record.website || record.URL).filter(Boolean);
    } else if (req.body.urls) {
      urls = Array.isArray(req.body.urls) ? req.body.urls : req.body.urls.split('\n').map(u => u.trim()).filter(Boolean);
    }

    if (urls.length === 0) {
      return res.status(400).json({ error: 'No URLs provided' });
    }

    console.log(`Parsed ${urls.length} URLs`);

    // Create batch using direct SQL
    const batchResult = await pool.query(
      `INSERT INTO batches (name, prompt_id, total_count, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', NOW(), NOW())
       RETURNING id, name, status, total_count, created_at`,
      [name || `Batch ${new Date().toISOString()}`, prompt_id || null, urls.length]
    );

    const batch = batchResult.rows[0];
    console.log(`Batch created: ${batch.id}`);

    // Insert websites in chunks using direct SQL
    const CHUNK_SIZE = 500;
    const allWebsites = [];

    for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
      const chunk = urls.slice(i, i + CHUNK_SIZE);
      console.log(`Inserting chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(urls.length / CHUNK_SIZE)}`);

      // Build VALUES string
      const values = [];
      const params = [];
      chunk.forEach((url, idx) => {
        const offset = idx * 2;
        values.push(`($${offset + 1}, $${offset + 2}, 'pending', NOW())`);
        params.push(batch.id, url);
      });

      const insertQuery = `
        INSERT INTO websites (batch_id, url, status, created_at)
        VALUES ${values.join(', ')}
        RETURNING id, url
      `;

      const result = await pool.query(insertQuery, params);
      allWebsites.push(...result.rows);
    }

    console.log(`Inserted ${allWebsites.length} websites`);

    // Update batch status to processing immediately
    await pool.query(
      `UPDATE batches SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [batch.id]
    );

    // Respond immediately to avoid timeout
    res.status(201).json({
      batch,
      websites_count: allWebsites.length,
      message: `Batch created with ${allWebsites.length} websites. Jobs are being enqueued in the background.`,
    });

    // Enqueue jobs in the background (don't await)
    console.log('Enqueueing jobs in background...');
    const JOB_CHUNK_SIZE = 100;

    setImmediate(async () => {
      try {
        let enqueuedCount = 0;
        for (let i = 0; i < allWebsites.length; i += JOB_CHUNK_SIZE) {
          const chunk = allWebsites.slice(i, i + JOB_CHUNK_SIZE);
          const jobPromises = chunk.map(website =>
            enqueueJob(QUEUE_NAMES.CLASSIFY_WEBSITE, {
              website_id: website.id,
              batch_id: batch.id,
              url: website.url,
              prompt_id: prompt_id || null,
            })
          );

          await Promise.all(jobPromises);
          enqueuedCount += chunk.length;

          if (enqueuedCount % 1000 === 0) {
            console.log(`Enqueued ${enqueuedCount}/${allWebsites.length} jobs`);
          }
        }
        console.log(`✅ All ${enqueuedCount} jobs enqueued successfully`);
      } catch (error) {
        console.error('❌ Error enqueueing jobs in background:', error);
      }
    });
  } catch (error) {
    console.error('Error creating batch:', error);
    next(error);
  }
});

// Cancel batch (mark all pending/processing websites as cancelled)
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Update batch status to cancelled
    const { error: batchError } = await supabase
      .from('batches')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (batchError) throw batchError;

    // Cancel all pending and processing websites
    const { error: websitesError } = await supabase
      .from('websites')
      .update({
        status: 'cancelled',
        error_message: 'Batch cancelled by user',
        processed_at: new Date().toISOString()
      })
      .eq('batch_id', id)
      .in('status', ['pending', 'processing']);

    if (websitesError) throw websitesError;

    // Note: We can't easily cancel jobs already in pg-boss queue
    // They will fail when they check the website status

    res.json({ message: 'Batch cancelled' });
  } catch (error) {
    next(error);
  }
});

// Delete batch
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from('batches').delete().eq('id', id);

    if (error) throw error;

    res.json({ message: 'Batch deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
