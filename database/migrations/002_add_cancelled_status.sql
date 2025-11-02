-- Add 'cancelled' status to batches table
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_status_check;
ALTER TABLE batches ADD CONSTRAINT batches_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- Add 'cancelled' status to websites table
ALTER TABLE websites DROP CONSTRAINT IF EXISTS websites_status_check;
ALTER TABLE websites ADD CONSTRAINT websites_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));
