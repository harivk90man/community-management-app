-- ============================================================================
-- MIGRATION: Payment Approval Workflow + Audit Trail
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================================

-- Step 1: Add approval workflow columns to payments (if missing)

DO $$ BEGIN
  ALTER TABLE payments ADD COLUMN status text NOT NULL DEFAULT 'approved';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE payments ADD COLUMN initiated_by text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE payments ADD COLUMN approved_by text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE payments ADD COLUMN rejected_by text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE payments ADD COLUMN reject_reason text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE payments ADD COLUMN status_changed_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Step 2: Create payment_audit table

CREATE TABLE IF NOT EXISTS payment_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  uuid NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  action      text NOT NULL,          -- 'submitted', 'approved', 'rejected', 'undo_approve'
  performed_by text NOT NULL,         -- email of who did this
  reason      text,                   -- optional reason (required for reject)
  details     jsonb,                  -- snapshot: amount, month, year, etc.
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Step 3: RLS for payment_audit

ALTER TABLE payment_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read payment_audit"
    ON payment_audit FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert payment_audit"
    ON payment_audit FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 4: Index for fast lookups

CREATE INDEX IF NOT EXISTS idx_payment_audit_payment_id
  ON payment_audit (payment_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments (status);

-- Step 5: Add upi_id and bank details columns to association_config (if missing)

DO $$ BEGIN
  ALTER TABLE association_config ADD COLUMN upi_id text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE association_config ADD COLUMN bank_account_name text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE association_config ADD COLUMN bank_account_number text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE association_config ADD COLUMN bank_ifsc text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE association_config ADD COLUMN bank_name text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Step 6: Verify

SELECT 'payments columns' AS check_name,
  array_agg(column_name ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_name = 'payments' AND table_schema = 'public'

UNION ALL

SELECT 'payment_audit exists',
  ARRAY['true']
FROM information_schema.tables
WHERE table_name = 'payment_audit' AND table_schema = 'public';
