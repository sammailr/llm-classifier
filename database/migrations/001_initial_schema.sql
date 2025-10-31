-- Create prompts table
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  model TEXT DEFAULT 'gpt-3.5-turbo',
  response_format JSONB DEFAULT '{"type": "json_object"}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create batches table
CREATE TABLE IF NOT EXISTS batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create websites table
CREATE TABLE IF NOT EXISTS websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  scraped_text TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Create classification_results table
CREATE TABLE IF NOT EXISTS classification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  is_mca_lender_broker BOOLEAN,
  business_model TEXT,
  confidence DECIMAL(3,2),
  primary_services TEXT[],
  evidence TEXT[],
  exclusion_reason TEXT,
  raw_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_websites_batch_id ON websites(batch_id);
CREATE INDEX IF NOT EXISTS idx_websites_status ON websites(status);
CREATE INDEX IF NOT EXISTS idx_classification_results_website_id ON classification_results(website_id);
CREATE INDEX IF NOT EXISTS idx_classification_results_batch_id ON classification_results(batch_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger to batches
CREATE TRIGGER update_batches_updated_at
  BEFORE UPDATE ON batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at trigger to prompts
CREATE TRIGGER update_prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default MCA classification prompt
INSERT INTO prompts (name, system_prompt, model) VALUES (
  'MCA Lender/Broker Classifier',
  '# MCA Lender & Broker Classification Assistant

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
```json
{
  "is_mca_lender_broker": true/false,
  "business_model": "direct_lender" | "broker" | "hybrid" | "unclear" | "not_applicable",
  "confidence": 0.0-1.0,
  "primary_services": ["service1", "service2", "service3"],
  "evidence": ["excerpt1", "excerpt2", "excerpt3"],
  "exclusion_reason": "reason if false, otherwise null"
}
```',
  'gpt-3.5-turbo'
) ON CONFLICT DO NOTHING;
