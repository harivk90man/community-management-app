-- ============================================================================
-- CLEANUP & RESET for Ashirvadh Castle Rock
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================================

-- Step 1: Clear all financial data

DELETE FROM payments;
DELETE FROM expenses;
DELETE FROM dues_config;

-- Step 2: Delete test villa_users (no auth account)

DELETE FROM villa_users
WHERE id NOT IN (
  SELECT vu.id FROM villa_users vu
  INNER JOIN auth.users au ON au.email = vu.email
  WHERE vu.email IS NOT NULL
  UNION
  SELECT vu.id FROM villa_users vu
  INNER JOIN auth.users au ON au.email = (REPLACE(vu.phone, '+', '') || '@villaapp.local')
  WHERE vu.phone IS NOT NULL
  UNION
  SELECT vu.id FROM villa_users vu
  INNER JOIN auth.users au ON au.email LIKE '%@villaapp.local'
    AND REGEXP_REPLACE(vu.phone, '[^0-9]', '', 'g') = REGEXP_REPLACE(REPLACE(au.email, '@villaapp.local', ''), '[^0-9]', '', 'g')
  WHERE vu.phone IS NOT NULL
);

-- Step 3: Delete villas that have NO remaining villa_users

DELETE FROM villas
WHERE id NOT IN (SELECT DISTINCT villa_id FROM villa_users);

-- Step 4: Create association_config table

CREATE TABLE IF NOT EXISTS association_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opening_balance NUMERIC DEFAULT 0,
  due_day INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE association_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can read association_config"
    ON association_config FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert association_config"
    ON association_config FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can update association_config"
    ON association_config FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO association_config (opening_balance, due_day)
SELECT 0, 10
WHERE NOT EXISTS (SELECT 1 FROM association_config);

-- Step 5: Show results

SELECT 'villas (kept)' AS table_name, COUNT(*) AS rows FROM villas
UNION ALL
SELECT 'villa_users (kept)', COUNT(*) FROM villa_users
UNION ALL
SELECT 'payments (cleared)', COUNT(*) FROM payments
UNION ALL
SELECT 'expenses (cleared)', COUNT(*) FROM expenses
UNION ALL
SELECT 'dues_config (cleared)', COUNT(*) FROM dues_config
UNION ALL
SELECT 'association_config', COUNT(*) FROM association_config;
