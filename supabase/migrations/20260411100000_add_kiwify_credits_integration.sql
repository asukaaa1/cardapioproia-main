CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_credits_updated_at ON public.user_credits(updated_at);

INSERT INTO public.user_credits (user_id, credits)
SELECT user_id, 5
FROM public.user_profiles
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own credits" ON public.user_credits;
CREATE POLICY "Users can view their own credits"
ON public.user_credits
FOR SELECT
USING (auth.uid() = user_id OR public.current_user_is_admin());

CREATE TABLE IF NOT EXISTS public.kiwify_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  customer_email TEXT,
  product_name TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'duplicate', 'user_not_found', 'ignored', 'error')),
  payload JSONB NOT NULL,
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kiwify_webhook_events_email ON public.kiwify_webhook_events(customer_email);
CREATE INDEX IF NOT EXISTS idx_kiwify_webhook_events_status ON public.kiwify_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_kiwify_webhook_events_received_at ON public.kiwify_webhook_events(received_at);

ALTER TABLE public.kiwify_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kiwify webhook events" ON public.kiwify_webhook_events;
CREATE POLICY "Admins can view kiwify webhook events"
ON public.kiwify_webhook_events
FOR SELECT
USING (public.current_user_is_admin());

ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

UPDATE public.user_subscriptions
SET plan = plan_code
WHERE plan = 'free' AND plan_code <> 'free';

ALTER TABLE public.user_subscriptions
DROP CONSTRAINT IF EXISTS user_subscriptions_plan_code_check;

ALTER TABLE public.user_subscriptions
ADD CONSTRAINT user_subscriptions_plan_code_check
CHECK (plan_code IN ('free', 'pro', 'unlimited', 'ilimitado'));

ALTER TABLE public.user_subscriptions
DROP CONSTRAINT IF EXISTS user_subscriptions_plan_check;

ALTER TABLE public.user_subscriptions
ADD CONSTRAINT user_subscriptions_plan_check
CHECK (plan IN ('free', 'pro', 'unlimited', 'ilimitado'));

CREATE OR REPLACE FUNCTION public.set_user_credits_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_user_credits_updated_at ON public.user_credits;
CREATE TRIGGER trg_set_user_credits_updated_at
BEFORE UPDATE ON public.user_credits
FOR EACH ROW
EXECUTE FUNCTION public.set_user_credits_updated_at();

CREATE OR REPLACE FUNCTION public.debit_user_credit(target_user_id UUID, amount INTEGER DEFAULT 1)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  IF target_user_id IS NULL OR amount <= 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_credits
  SET credits = credits - amount,
      updated_at = NOW()
  WHERE user_id = target_user_id
    AND credits >= amount;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_user_credit(UUID, INTEGER) TO service_role;
