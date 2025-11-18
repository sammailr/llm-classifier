# Bulk Batch Creation Scripts

## Overview

These scripts allow you to create batches with **unlimited URLs** by bypassing the API and directly inserting into Supabase + pg-boss.

Perfect for importing 10k, 50k, 100k+ URLs in a single batch.

---

## Prerequisites

1. **Node.js installed** (v18 or higher)
2. **Environment variables configured** in `api/.env`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `DATABASE_URL`

---

## Script: `create-batch-from-csv.js`

### Purpose
Create a classification batch from a CSV file with unlimited URLs.

### Usage

```bash
node scripts/create-batch-from-csv.js <csv-file> <batch-name> [prompt-id]
```

### Arguments

| Argument | Required | Description | Example |
|----------|----------|-------------|---------|
| `csv-file` | ✅ Yes | Path to CSV file | `my-urls.csv` |
| `batch-name` | ✅ Yes | Name for the batch | `"MCA Lenders - January 2025"` |
| `prompt-id` | ❌ No | Custom prompt UUID | `"123e4567-e89b-12d3-a456-426614174000"` |

### CSV Format

Your CSV must have a column with one of these names:
- `url`
- `website`
- `URL`

**Example CSV:**
```csv
url
https://example1.com
https://example2.com
https://example3.com
```

Or with additional columns (they'll be ignored):
```csv
company_name,url,industry
Acme Corp,https://acme.com,Finance
Beta LLC,https://beta.com,Technology
```

---

## Examples

### Basic usage (default MCA prompt)
```bash
node scripts/create-batch-from-csv.js urls.csv "My Large Batch"
```

### With custom prompt
```bash
node scripts/create-batch-from-csv.js urls.csv "Custom Analysis" "abc123-prompt-id"
```

### With 50,000 URLs
```bash
node scripts/create-batch-from-csv.js 50k-urls.csv "Massive Batch - 50k URLs"
```

---

## What It Does

1. ✅ **Reads CSV** - Parses your CSV file and extracts URLs
2. ✅ **Creates Batch** - Inserts batch record into Supabase
3. ✅ **Inserts Websites** - Adds all URLs to `websites` table in chunks of 500
4. ✅ **Enqueues Jobs** - Creates classification jobs in pg-boss queue (chunks of 100)
5. ✅ **Updates Status** - Marks batch as "processing"

---

## Performance

| URLs | Insertion Time | Job Enqueueing | Total Time |
|------|----------------|----------------|------------|
| 1,000 | ~5 seconds | ~3 seconds | ~8 seconds |
| 10,000 | ~45 seconds | ~25 seconds | ~70 seconds |
| 50,000 | ~3.5 minutes | ~2 minutes | ~5.5 minutes |
| 100,000 | ~7 minutes | ~4 minutes | ~11 minutes |

*Times are approximate and depend on network speed and database performance.*

---

## Output Example

```
🚀 Starting bulk batch creation...

📁 CSV File: 50k-urls.csv
📦 Batch Name: Large Batch 1
🎯 Prompt ID: Default MCA Classifier

📖 Reading CSV file...
✅ Found 50,000 URLs

📝 Creating batch in database...
✅ Batch created with ID: abc-123-def-456

💾 Inserting 50,000 websites in chunks of 500...

   Chunk 1/100 (500 websites)... ✅ (500/50,000 total)
   Chunk 2/100 (500 websites)... ✅ (1,000/50,000 total)
   ...
   Chunk 100/100 (500 websites)... ✅ (50,000/50,000 total)

✅ All 50,000 websites inserted successfully!

🔗 Connecting to job queue...
✅ Connected to pg-boss

⚡ Enqueueing 50,000 jobs in chunks of 100...

   Chunk 1/500 (100 jobs)... ✅ (100/50,000 total)
   Chunk 2/500 (100 jobs)... ✅ (200/50,000 total)
   ...
   Chunk 500/500 (100 jobs)... ✅ (50,000/50,000 total)

✅ All 50,000 jobs enqueued successfully!

📊 Updating batch status...
✅ Batch status updated to "processing"

✨ DONE! ✨

📈 Summary:
   • Batch ID: abc-123-def-456
   • Batch Name: Large Batch 1
   • Total URLs: 50,000
   • Websites Inserted: 50,000
   • Jobs Enqueued: 50,000
   • Status: Processing

🔍 Check your dashboard to monitor progress!
```

---

## Troubleshooting

### Error: "Missing Supabase credentials"
**Solution:** Make sure `api/.env` has `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### Error: "Missing DATABASE_URL"
**Solution:** Add `DATABASE_URL` to `api/.env` (your Supabase PostgreSQL connection string)

### Error: "File not found"
**Solution:** Check the CSV file path - use relative or absolute paths
```bash
# Relative path
node scripts/create-batch-from-csv.js ./data/urls.csv "Batch"

# Absolute path
node scripts/create-batch-from-csv.js /Users/you/urls.csv "Batch"
```

### Error: "No URLs found in CSV"
**Solution:** Ensure your CSV has a column named `url`, `website`, or `URL` (case-insensitive)

### Database connection timeout
**Solution:** If using Supabase, make sure you're using the **Session Pooler** connection string (port 6543), not direct connection (port 5432)

---

## Advantages vs Web UI

| Feature | Web UI | CLI Script |
|---------|--------|------------|
| Max URLs | ~2,000 (API limit) | Unlimited |
| Speed | Slower (HTTP overhead) | Faster (direct DB) |
| Progress Tracking | Basic | Detailed chunks |
| Error Recovery | Manual retry | Clear error messages |
| Large Files | Can timeout | Handles any size |
| Automation | Manual only | Can be scripted |

---

## Advanced: Automation

You can integrate this into automated workflows:

```bash
#!/bin/bash
# Process multiple CSV files

for file in data/*.csv; do
  filename=$(basename "$file" .csv)
  node scripts/create-batch-from-csv.js "$file" "Auto Batch: $filename"
  sleep 5  # Wait between batches
done
```

---

## Support

If you encounter issues, check:
1. ✅ Node.js version (`node --version` should be v18+)
2. ✅ Environment variables in `api/.env`
3. ✅ CSV format (must have `url` column)
4. ✅ Database connection (test with Supabase dashboard)
5. ✅ Network connectivity to Supabase

For questions or issues, check the logs - the script provides detailed error messages.
