-- Consolidate RLS for sensitive SaaS data.
-- Users can access only their own rows; admins keep operational visibility.

CREATE TABLE IF NOT EXISTS public.prompts_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  universal_prompt TEXT NOT NULL,
  pattern_prompts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompts_config_user_id ON public.prompts_config(user_id);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

-- user_profiles
DROP POLICY IF EXISTS "Users can read their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read own profile or admins read all" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile or admins update all" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile or admins insert all" ON public.user_profiles;

CREATE POLICY "Users can read own profile or admins read all"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin());

CREATE POLICY "Users can update own profile or admins update all"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin())
WITH CHECK (auth.uid() = user_id OR public.current_user_is_admin());

CREATE POLICY "Users can insert own profile or admins insert all"
ON public.user_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR public.current_user_is_admin());

-- photo_history
DROP POLICY IF EXISTS "Anyone can view photos by session" ON public.photo_history;
DROP POLICY IF EXISTS "Anyone can insert photos" ON public.photo_history;
DROP POLICY IF EXISTS "Anyone can delete expired photos" ON public.photo_history;
DROP POLICY IF EXISTS "Users see their own photos" ON public.photo_history;
DROP POLICY IF EXISTS "Users can insert photos" ON public.photo_history;
DROP POLICY IF EXISTS "Users can update their own photos" ON public.photo_history;
DROP POLICY IF EXISTS "Users can delete their own photos" ON public.photo_history;
DROP POLICY IF EXISTS "Users can read own photos or admins read all" ON public.photo_history;
DROP POLICY IF EXISTS "Users can insert own photos" ON public.photo_history;
DROP POLICY IF EXISTS "Users can update own photos or admins update all" ON public.photo_history;
DROP POLICY IF EXISTS "Users can delete own photos or admins delete all" ON public.photo_history;

CREATE POLICY "Users can read own photos or admins read all"
ON public.photo_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin());

CREATE POLICY "Users can insert own photos"
ON public.photo_history
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own photos or admins update all"
ON public.photo_history
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin())
WITH CHECK (auth.uid() = user_id OR public.current_user_is_admin());

CREATE POLICY "Users can delete own photos or admins delete all"
ON public.photo_history
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin());

-- user_credits
DROP POLICY IF EXISTS "Users can view their own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can read own credits or admins read all" ON public.user_credits;

CREATE POLICY "Users can read own credits or admins read all"
ON public.user_credits
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin());

-- user_subscriptions
DROP POLICY IF EXISTS "Users can view their own subscription" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can read own subscriptions or admins read all" ON public.user_subscriptions;

CREATE POLICY "Users can read own subscriptions or admins read all"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin());

-- download_events
DROP POLICY IF EXISTS "Users can view their own downloads" ON public.download_events;
DROP POLICY IF EXISTS "Users can insert their own downloads" ON public.download_events;
DROP POLICY IF EXISTS "Users can read own downloads or admins read all" ON public.download_events;
DROP POLICY IF EXISTS "Users can insert own downloads" ON public.download_events;

CREATE POLICY "Users can read own downloads or admins read all"
ON public.download_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin());

CREATE POLICY "Users can insert own downloads"
ON public.download_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- prompts_config
DROP POLICY IF EXISTS "Users can read own prompts" ON public.prompts_config;
DROP POLICY IF EXISTS "Users can insert own prompts" ON public.prompts_config;
DROP POLICY IF EXISTS "Users can update own prompts" ON public.prompts_config;
DROP POLICY IF EXISTS "Users can read own prompts or admins read all" ON public.prompts_config;
DROP POLICY IF EXISTS "Users can insert own prompts or admins insert all" ON public.prompts_config;
DROP POLICY IF EXISTS "Users can update own prompts or admins update all" ON public.prompts_config;

CREATE POLICY "Users can read own prompts or admins read all"
ON public.prompts_config
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin());

CREATE POLICY "Users can insert own prompts or admins insert all"
ON public.prompts_config
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR public.current_user_is_admin());

CREATE POLICY "Users can update own prompts or admins update all"
ON public.prompts_config
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.current_user_is_admin())
WITH CHECK (auth.uid() = user_id OR public.current_user_is_admin());

-- plan_configs are public for active plan cards, writable only by admins.
DROP POLICY IF EXISTS "Anyone can view active plan configs" ON public.plan_configs;
DROP POLICY IF EXISTS "Admins can manage plan configs" ON public.plan_configs;

CREATE POLICY "Anyone can view active plan configs"
ON public.plan_configs
FOR SELECT
TO anon, authenticated
USING (is_active = true OR public.current_user_is_admin());

CREATE POLICY "Admins can manage plan configs"
ON public.plan_configs
FOR ALL
TO authenticated
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());
