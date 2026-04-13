-- Repair the historical bootstrap bug that marked pre-existing auth users as admins.
-- Review the allowlist below before applying if your production database has other legitimate admins.

WITH intended_admins AS (
  SELECT UNNEST(ARRAY[
    'oitalofreitas@icloud.com',
    'italo@produtoraduo.com'
  ]) AS email
),
intended_admin_user_ids AS (
  SELECT id
  FROM auth.users
  WHERE LOWER(email) IN (SELECT email FROM intended_admins)
)
UPDATE public.user_profiles
SET role = CASE
    WHEN LOWER(email) IN (SELECT email FROM intended_admins)
      OR user_id IN (SELECT id FROM intended_admin_user_ids)
    THEN 'admin'
    ELSE 'user'
  END,
  updated_at = NOW()
WHERE role = 'admin'
   OR LOWER(email) IN (SELECT email FROM intended_admins)
   OR user_id IN (SELECT id FROM intended_admin_user_ids);
