-- Prevent repeated free-credit abuse by allowing only one free trial claim per IP hash.

CREATE TABLE IF NOT EXISTS public.free_trial_ip_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_granted INTEGER NOT NULL DEFAULT 0 CHECK (credits_granted >= 0),
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_free_trial_ip_claims_created_at
ON public.free_trial_ip_claims(created_at DESC);

ALTER TABLE public.free_trial_ip_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read free trial IP claims" ON public.free_trial_ip_claims;
CREATE POLICY "Admins can read free trial IP claims"
ON public.free_trial_ip_claims
FOR SELECT
USING (public.current_user_is_admin());
