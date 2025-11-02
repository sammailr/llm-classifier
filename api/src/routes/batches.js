import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import supabase from '../supabase.js';
import { enqueueJob, QUEUE_NAMES } from '../queue.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all batches
router.get('/', async (req, res, next) => {
  try {
    const { data: batches, error } = await supabase
      .from('batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // For each batch, get classification stats
    const batchesWithStats = await Promise.all(
      batches.map(async (batch) => {
        // Get classification results count
        const { data: results } = await supabase
          .from('classification_results')
          .select('is_mca_lender_broker')
          .eq('batch_id', batch.id);

        const yesCount = results?.filter(r => r.is_mca_lender_broker === true).length || 0;
        const noCount = results?.filter(r => r.is_mca_lender_broker === false).length || 0;

        return {
          ...batch,
          classification_yes: yesCount,
          classification_no: noCount,
        };
      })
    );

    res.json(batchesWithStats);
  } catch (error) {
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

// Create new batch from CSV or JSON
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { prompt_id, name } = req.body;
    let urls = [];

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

    // Create batch
    const { data: batch, error: batchError } = await supabase
      .from('batches')
      .insert({
        name: name || `Batch ${new Date().toISOString()}`,
        prompt_id: prompt_id || null,
        total_count: urls.length,
        status: 'pending',
      })
      .select()
      .single();

    if (batchError) throw batchError;

    // Create website records in chunks to avoid database limits
    const CHUNK_SIZE = 500; // Insert 500 at a time
    const websiteRecords = urls.map(url => ({
      batch_id: batch.id,
      url,
      status: 'pending',
    }));

    console.log(`Inserting ${websiteRecords.length} websites in chunks of ${CHUNK_SIZE}...`);

    // Insert websites in chunks
    const allWebsites = [];
    for (let i = 0; i < websiteRecords.length; i += CHUNK_SIZE) {
      const chunk = websiteRecords.slice(i, i + CHUNK_SIZE);
      console.log(`Inserting chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(websiteRecords.length / CHUNK_SIZE)} (${chunk.length} websites)...`);

      const { data: chunkWebsites, error: chunkError } = await supabase
        .from('websites')
        .insert(chunk)
        .select();

      if (chunkError) {
        console.error(`Error inserting chunk at index ${i}:`, chunkError);
        throw chunkError;
      }

      allWebsites.push(...chunkWebsites);
      console.log(`Inserted ${allWebsites.length}/${websiteRecords.length} websites so far`);
    }

    console.log(`Successfully inserted all ${allWebsites.length} websites`);

    // Enqueue classification jobs in chunks to avoid memory issues
    console.log(`Enqueuing ${allWebsites.length} jobs...`);
    const JOB_CHUNK_SIZE = 100;
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
      console.log(`Enqueued ${enqueuedCount}/${allWebsites.length} jobs`);
    }

    console.log(`All ${allWebsites.length} jobs enqueued successfully`);

    // Update batch status
    await supabase
      .from('batches')
      .update({ status: 'processing' })
      .eq('id', batch.id);

    res.status(201).json({
      batch,
      websites_count: allWebsites.length,
      message: `Batch created with ${allWebsites.length} websites and all jobs enqueued`,
    });
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
