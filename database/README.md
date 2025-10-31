# Database Setup

## Supabase Setup Instructions

1. **Create a new Supabase project** at https://supabase.com

2. **Run the migration SQL**:
   - Go to the SQL Editor in your Supabase dashboard
   - Copy the contents of `migrations/001_initial_schema.sql`
   - Paste and run the SQL

3. **Get your connection details**:
   - Project URL: Found in Settings > API
   - Anon Key: Found in Settings > API
   - Service Role Key: Found in Settings > API
   - Database URL: Found in Settings > Database (for pg-boss queue)

4. **Set up Row Level Security (RLS)** (Optional for development):
   - For development, you can disable RLS or set up basic policies
   - For production, create appropriate RLS policies based on your auth setup

## Database Schema

### Tables

- **prompts**: Stores LLM prompt templates
- **batches**: Tracks batches of websites to classify
- **websites**: Individual websites to be classified
- **classification_results**: Results from LLM classification

### Relationships

```
batches (1) ─── (many) websites
batches (1) ─── (many) classification_results
websites (1) ─── (1) classification_results
prompts (1) ─── (many) batches
```

## pgboss Queue Tables

When you first run the API or worker, pg-boss will automatically create its own tables in your database:
- `pgboss.job`
- `pgboss.archive`
- `pgboss.schedule`
- `pgboss.subscription`
- `pgboss.version`

These tables manage the job queue system.
