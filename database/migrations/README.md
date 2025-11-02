# Database Migrations

## How to Run Migrations

1. Go to your Supabase project: https://supabase.com/dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of the migration file
4. Paste into the SQL editor
5. Click **Run**

## Migration History

- `001_initial_schema.sql` - Initial database schema (prompts, batches, websites, classification_results)
- `002_add_cancelled_status.sql` - Add 'cancelled' status option to batches and websites tables
