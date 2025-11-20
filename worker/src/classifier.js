import OpenAI from 'openai';
import supabase from './supabase.js';
import pool from './db.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || 'https://website-scraper.samuel-5af.workers.dev/';
const SCRAPER_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '10000', 10);
const OPENAI_TIMEOUT = parseInt(process.env.OPENAI_TIMEOUT || '30000', 10);
const OVERALL_TIMEOUT = parseInt(process.env.OVERALL_TIMEOUT || '60000', 10);

// Default MCA classification prompt (from the n8n workflow)
const DEFAULT_SYSTEM_PROMPT = `# MCA Lender & Broker Classification Assistant

You are a domain-classification assistant specializing in identifying MCA (Merchant Cash Advance) lenders, brokers, and alternative business funding companies from website content. Your task is to determine if a company fits the target ICP: businesses that provide or broker merchant cash advances, business loans, and alternative funding solutions to small and medium-sized businesses.

## PRIMARY CLASSIFICATION CRITERIA

### HIGH CONFIDENCE MCA/ALTERNATIVE LENDING INDICATORS:

**Core MCA Keywords:**
- "Merchant Cash Advance" / "MCA"
- "Business cash advance"
- "Revenue-based financing"
- "Daily remittance" / "Daily payments"
- "Factor rate" / "Factoring"
- "Future receivables" / "Future sales"
- "Working capital advance"
- "Quick business funding" / "Fast business loans"

**Alternative Lending Keywords:**
- "Alternative business financing"
- "Non-bank lending" / "Non-traditional financing"
- "Business term loans"
- "Line of credit" / "Business credit line"
- "Invoice factoring" / "Accounts receivable financing"
- "Equipment financing"
- "SBA loans" / "SBA 7(a)"
- "Revenue-based loans"

**Broker/Lender Indicators:**
- "Business funding broker"
- "Lending network" / "Lender marketplace"
- "Connect businesses with lenders"
- "Multiple funding options"
- "Direct lender" / "Direct funding"
- "Approved within 24 hours"
- "Funding as fast as [X] hours/days"
- "Bad credit accepted" / "Credit challenged"

## RESPONSE FORMAT

Respond ONLY in valid JSON:
\`\`\`json
{
  "is_mca_lender_broker": true/false,
  "business_model": "direct_lender" | "broker" | "hybrid" | "unclear" | "not_applicable",
  "confidence": 0.0-1.0,
  "primary_services": ["service1", "service2", "service3"],
  "evidence": ["excerpt1", "excerpt2", "excerpt3"],
  "exclusion_reason": "reason if false, otherwise null"
}
\`\`\``;

async function scrapeWebsite(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCRAPER_TIMEOUT);

    const response = await fetch(SCRAPER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Scraper API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Check if scraper returned an error
    if (!data.success) {
      throw new Error(data.error || 'Scraper failed without error message');
    }

    return data.text || '';
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Scraper request timeout');
    }
    throw error;
  }
}

async function callOpenAI(scrapedText, systemPrompt, model = 'gpt-3.5-turbo') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT);

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Here's the extracted website text:\n\n"""\n${scrapedText}\n"""\n\nPlease analyze it.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = completion.choices[0].message.content;
    return JSON.parse(result);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('OpenAI request timeout');
    }
    throw error;
  }
}

// Track which incomplete batches we've already logged about (to avoid spam)
const loggedIncompleteBatches = new Set();

// Wrapper to add timeout to any async function
function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

async function classifyWebsiteInternal({ website_id, batch_id, url, prompt_id }) {
  let scrapedText = '';
  let classification = null;
  let error = null;

  try {
    // First, check if the website or batch has been cancelled using direct SQL
    const websiteResult = await pool.query(
      'SELECT status FROM websites WHERE id = $1',
      [website_id]
    );

    if (websiteResult.rows[0]?.status === 'cancelled') {
      console.log(`Skipping cancelled website: ${url}`);
      // Still update batch progress so it can complete
      await updateBatchProgress(batch_id);
      return; // Exit early - website was cancelled
    }

    const batchResult = await pool.query(
      'SELECT status FROM batches WHERE id = $1',
      [batch_id]
    );

    if (batchResult.rows[0]?.status === 'cancelled') {
      console.log(`Skipping website from cancelled batch: ${url}`);
      // Still update batch progress so it can complete
      await updateBatchProgress(batch_id);
      return; // Exit early - batch was cancelled
    }

    // Update status to processing using direct SQL
    await pool.query(
      'UPDATE websites SET status = $1 WHERE id = $2',
      ['processing', website_id]
    );

    // Step 1: Scrape website
    try {
      scrapedText = await scrapeWebsite(url);
    } catch (scrapeError) {
      console.error(`Failed to scrape ${url}:`, scrapeError.message);
      throw new Error(`Scraping failed: ${scrapeError.message}`);
    }

    if (!scrapedText || scrapedText.trim().length === 0) {
      throw new Error('No content extracted from website');
    }

    // Step 2: Get prompt (or use default)
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    let model = 'gpt-3.5-turbo';

    if (prompt_id) {
      const { data: promptData, error: promptError } = await supabase
        .from('prompts')
        .select('*')
        .eq('id', prompt_id)
        .single();

      if (!promptError && promptData) {
        systemPrompt = promptData.system_prompt;
        model = promptData.model || model;
      }
    }

    // Step 3: Classify with OpenAI
    classification = await callOpenAI(scrapedText, systemPrompt, model);

    // Step 4: Save classification result
    const { error: classificationError } = await supabase
      .from('classification_results')
      .insert({
        website_id,
        batch_id,
        is_mca_lender_broker: classification.is_mca_lender_broker,
        business_model: classification.business_model,
        confidence: classification.confidence,
        primary_services: classification.primary_services || [],
        evidence: classification.evidence || [],
        exclusion_reason: classification.exclusion_reason,
        raw_response: classification,
      });

    if (classificationError) throw classificationError;

    // Step 5: Update website status to completed using direct SQL
    await pool.query(
      `UPDATE websites
       SET status = $1, scraped_text = $2, processed_at = $3
       WHERE id = $4`,
      ['completed', scrapedText.substring(0, 5000), new Date().toISOString(), website_id]
    );

    // Step 6: Update batch progress
    await updateBatchProgress(batch_id);

  } catch (err) {
    error = err.message;
    console.error(`Classification error for ${url}:`, error);

    // Update website with error status using direct SQL
    await pool.query(
      `UPDATE websites
       SET status = $1, error_message = $2, processed_at = $3
       WHERE id = $4`,
      ['failed', error, new Date().toISOString(), website_id]
    );

    // Update batch progress even on failure
    await updateBatchProgress(batch_id);

    // Don't re-throw - we've handled the error and don't want pg-boss to retry
    // permanent failures like scraper timeouts or no content
  }
}

async function updateBatchProgress(batch_id) {
  try {
    // Get batch to check actual total_count and current status using direct SQL
    const batchResult = await pool.query(
      'SELECT total_count, status FROM batches WHERE id = $1',
      [batch_id]
    );

    if (batchResult.rows.length === 0) {
      console.warn(`Batch ${batch_id} not found in database`);
      return;
    }

    const batch = batchResult.rows[0];

    // Get website counts using direct SQL with GROUP BY for efficiency
    const countsResult = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM websites
       WHERE batch_id = $1
       GROUP BY status`,
      [batch_id]
    );

    // Build counts object
    const counts = {
      completed: 0,
      failed: 0,
      cancelled: 0,
      processing: 0,
      pending: 0,
    };

    let actualTotal = 0;
    countsResult.rows.forEach(row => {
      counts[row.status] = parseInt(row.count);
      actualTotal += parseInt(row.count);
    });

    // Count total processed (including cancelled)
    const totalProcessed = counts.completed + counts.failed + counts.cancelled;

    // Determine status
    // If batch is already cancelled, keep it cancelled
    // Otherwise, check if all websites have been processed
    let status = batch.status;
    if (status !== 'cancelled') {
      if (totalProcessed === batch.total_count) {
        status = 'completed';
      } else if (actualTotal < batch.total_count) {
        // Some websites weren't inserted - batch is incomplete
        // Only log this once per batch to avoid spam
        if (!loggedIncompleteBatches.has(batch_id)) {
          console.warn(`Batch ${batch_id} incomplete: ${actualTotal}/${batch.total_count} websites in DB (this warning will only appear once)`);
          loggedIncompleteBatches.add(batch_id);
        }
      } else {
        status = 'processing';
      }
    }

    // Update batch using direct SQL
    await pool.query(
      `UPDATE batches
       SET completed_count = $1, failed_count = $2, status = $3, updated_at = $4
       WHERE id = $5`,
      [counts.completed, counts.failed, status, new Date().toISOString(), batch_id]
    );
  } catch (error) {
    console.error(`Error updating batch progress for ${batch_id}:`, error.message);
    // Don't throw - we still want classification to succeed even if progress update fails
  }
}

// Export wrapper with overall timeout
export async function classifyWebsite(jobData) {
  try {
    await withTimeout(
      classifyWebsiteInternal(jobData),
      OVERALL_TIMEOUT,
      `Overall classification timeout (${OVERALL_TIMEOUT}ms) for ${jobData.url}`
    );
  } catch (err) {
    // If overall timeout is hit, ensure we mark the website as failed
    if (err.message.includes('Overall classification timeout')) {
      console.error(`Overall timeout for ${jobData.url}`);
      await pool.query(
        `UPDATE websites
         SET status = $1, error_message = $2, processed_at = $3
         WHERE id = $4`,
        ['failed', err.message, new Date().toISOString(), jobData.website_id]
      );

      await updateBatchProgress(jobData.batch_id);
    } else {
      // This shouldn't happen since classifyWebsiteInternal handles all errors
      // But just in case, log it
      console.error(`Unexpected error in classifyWebsite for ${jobData.url}:`, err.message);
    }
  }
}

export default classifyWebsite;
