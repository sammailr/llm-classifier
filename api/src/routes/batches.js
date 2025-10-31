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
    const { data, error } = await supabase
      .from('batches')
      .select('*, websites(count)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
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

    // Create website records
    const websiteRecords = urls.map(url => ({
      batch_id: batch.id,
      url,
      status: 'pending',
    }));

    const { data: websites, error: websitesError } = await supabase
      .from('websites')
      .insert(websiteRecords)
      .select();

    if (websitesError) throw websitesError;

    // Enqueue classification jobs
    const jobPromises = websites.map(website =>
      enqueueJob(QUEUE_NAMES.CLASSIFY_WEBSITE, {
        website_id: website.id,
        batch_id: batch.id,
        url: website.url,
        prompt_id: prompt_id || null,
      })
    );

    await Promise.all(jobPromises);

    // Update batch status
    await supabase
      .from('batches')
      .update({ status: 'processing' })
      .eq('id', batch.id);

    res.status(201).json({
      batch,
      websites_count: websites.length,
      message: 'Batch created and jobs enqueued',
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
