-- Tighten access to photo history by binding anonymous access to x-session-id.
DROP POLICY IF EXISTS "Users see their own photos" ON public.photo_history;
DROP POLICY IF EXISTS "Users can insert photos" ON public.photo_history;
DROP POLICY IF EXISTS "Users can update their own photos" ON public.photo_history;
DROP POLICY IF EXISTS "Only expired photos can be deleted" ON public.photo_history;

CREATE POLICY "Users see their own photos"
  ON public.photo_history
  FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (
      auth.uid() IS NULL
      AND user_id IS NULL
      AND session_id = (
        COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::json ->> 'x-session-id'
      )
    )
  );

CREATE POLICY "Users can insert photos"
  ON public.photo_history
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (
      auth.uid() IS NULL
      AND user_id IS NULL
      AND session_id = (
        COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::json ->> 'x-session-id'
      )
    )
  );

CREATE POLICY "Users can update their own photos"
  ON public.photo_history
  FOR UPDATE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Users can delete their own photos"
  ON public.photo_history
  FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (
      auth.uid() IS NULL
      AND user_id IS NULL
      AND session_id = (
        COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::json ->> 'x-session-id'
      )
    )
  );
