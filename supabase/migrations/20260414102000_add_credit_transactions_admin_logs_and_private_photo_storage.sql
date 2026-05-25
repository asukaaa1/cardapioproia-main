-- Audit credits, administrative actions and move new gallery images to private Storage.

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL,
  reference_type TEXT NULL,
  reference_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id_created_at
ON public.credit_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_reference
ON public.credit_transactions(reference_type, reference_id);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own credit transactions or admins read all" ON public.credit_transactions;
CREATE POLICY "Users can read own credit transactions or admins read all"
ON public.credit_transactions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin());

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
ON public.admin_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_target
ON public.admin_audit_logs(actor_user_id, target_user_id);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can read audit logs"
ON public.admin_audit_logs
FOR SELECT
TO authenticated
USING (public.current_user_is_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photo-history',
  'photo-history',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can read own private gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own private gallery images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own private gallery images" ON storage.objects;

CREATE POLICY "Users can read own private gallery images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'photo-history'
  AND (
    owner = auth.uid()
    OR public.current_user_is_admin()
  )
);

CREATE POLICY "Users can upload own private gallery images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photo-history'
  AND owner = auth.uid()
);

CREATE POLICY "Users can delete own private gallery images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'photo-history'
  AND (
    owner = auth.uid()
    OR public.current_user_is_admin()
  )
);
