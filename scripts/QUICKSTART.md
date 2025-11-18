# Quick Start: Import 50k+ URLs

## Step 1: Prepare Your CSV

Create a CSV file with your URLs. Example `my-urls.csv`:

```csv
url
https://example1.com
https://example2.com
https://example3.com
...
(50,000 more rows)
```

## Step 2: Run the Script

From the project root directory:

```bash
npm run batch:create my-urls.csv "My 50k Batch"
```

Or directly with node:

```bash
node scripts/create-batch-from-csv.js my-urls.csv "My 50k Batch"
```

## Step 3: Watch It Work!

You'll see real-time progress:

```
🚀 Starting bulk batch creation...

📖 Reading CSV file...
✅ Found 50,000 URLs

💾 Inserting 50,000 websites in chunks of 500...
   Chunk 1/100 (500 websites)... ✅ (500/50,000 total)
   Chunk 2/100 (500 websites)... ✅ (1,000/50,000 total)
   ...

⚡ Enqueueing 50,000 jobs in chunks of 100...
   Chunk 1/500 (100 jobs)... ✅ (100/50,000 total)
   ...

✨ DONE! ✨
```

## Step 4: Monitor Progress

Go to your dashboard at:
- https://llm-classifier-frontend.onrender.com

You'll see your batch processing in real-time!

---

## For Even Larger Batches (100k, 200k+)

Just use the same command - the script handles unlimited URLs:

```bash
# 100k URLs
npm run batch:create 100k-urls.csv "Massive Batch - 100k"

# 500k URLs (will take ~30 minutes to insert + enqueue)
npm run batch:create 500k-urls.csv "Ultra Massive Batch - 500k"
```

---

## Tips

1. **Keep your terminal open** while the script runs
2. **CSV format matters** - must have a column named `url`, `website`, or `URL`
3. **Path to CSV** - can be relative (`./data/urls.csv`) or absolute
4. **Batch names** - use quotes if your batch name has spaces

---

## Troubleshooting

### "Cannot find module"
Run: `npm install` from the project root

### "Missing Supabase credentials"
Make sure `api/.env` has your Supabase credentials

### "No URLs found"
Check your CSV has a column named `url`, `website`, or `URL`

---

That's it! You're ready to import 50k+ URLs in minutes instead of hours.
