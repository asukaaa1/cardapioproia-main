-- Add user_id to photo_history for authenticated users
ALTER TABLE public.photo_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for user lookups
CREATE INDEX IF NOT EXISTS idx_photo_history_user ON public.photo_history(user_id);

-- For authenticated users: store photos permanently (no expiry enforcement)
ALTER TABLE public.photo_history ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false;

-- Drop old permissive RLS policies
DROP POLICY IF EXISTS "Anyone can view photos by session" ON public.photo_history;
DROP POLICY IF EXISTS "Anyone can insert photos" ON public.photo_history;

-- SELECT: authenticated users see their own photos; anonymous see by session_id
CREATE POLICY "Users see their own photos"
  ON public.photo_history FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND session_id = current_setting('request.headers', true)::json->>'x-session-id')
    OR
    (auth.uid() IS NULL AND user_id IS NULL)
  );

-- INSERT: authenticated users attach their user_id; anonymous use session
CREATE POLICY "Users can insert photos"
  ON public.photo_history FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND user_id IS NULL)
  );

-- UPDATE: only owner can update their photo (for permanent flag)
CREATE POLICY "Users can update their own photos"
  ON public.photo_history FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
  );
