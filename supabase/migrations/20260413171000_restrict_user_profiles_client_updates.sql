-- Prevent clients from changing authorization flags directly.
-- Profile changes that need privileged fields must go through service-role
-- edge functions or auth triggers.

REVOKE UPDATE ON TABLE public.user_profiles FROM anon;
REVOKE UPDATE ON TABLE public.user_profiles FROM authenticated;
REVOKE INSERT ON TABLE public.user_profiles FROM anon;
REVOKE INSERT ON TABLE public.user_profiles FROM authenticated;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile or admins update all" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile or admins insert all" ON public.user_profiles;

GRANT UPDATE, INSERT ON TABLE public.user_profiles TO authenticated;

CREATE POLICY "Admins can update user profiles"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins can insert user profiles"
ON public.user_profiles
FOR INSERT
TO authenticated
WITH CHECK (public.current_user_is_admin());
