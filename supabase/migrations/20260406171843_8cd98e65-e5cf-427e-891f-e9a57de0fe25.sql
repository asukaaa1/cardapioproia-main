
-- Fix photo_history DELETE policy: only allow deleting expired photos
DROP POLICY "Anyone can delete expired photos" ON public.photo_history;
CREATE POLICY "Only expired photos can be deleted"
  ON public.photo_history
  FOR DELETE
  TO public
  USING (expires_at < now());

-- Remove overly permissive storage INSERT policy
DROP POLICY IF EXISTS "Anyone can upload processed images" ON storage.objects;

-- Remove overly permissive storage DELETE policy  
DROP POLICY IF EXISTS "Anyone can delete processed images" ON storage.objects;
