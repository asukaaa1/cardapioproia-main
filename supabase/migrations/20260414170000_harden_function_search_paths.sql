-- Security Advisor hardening: make trigger helper functions use a fixed search_path.

ALTER FUNCTION public.set_user_profiles_updated_at()
SET search_path = public;

ALTER FUNCTION public.set_user_credits_updated_at()
SET search_path = public;

ALTER FUNCTION public.set_plan_configs_updated_at()
SET search_path = public;
