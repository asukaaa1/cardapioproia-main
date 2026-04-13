UPDATE public.user_profiles
SET role = 'admin',
    updated_at = NOW()
WHERE email = 'oitalofreitas@icloud.com';

UPDATE public.user_profiles
SET role = 'admin',
    updated_at = NOW()
WHERE user_id IN (
  SELECT id
  FROM auth.users
  WHERE email = 'oitalofreitas@icloud.com'
);
