-- Remove early permissive storage policies from the prototype phase.
-- The app currently stores generated images in photo_history, so this bucket
-- should not accept anonymous writes or deletes.

UPDATE storage.buckets
SET public = false
WHERE id = 'processed-images';

DROP POLICY IF EXISTS "Processed images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload processed images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete processed images" ON storage.objects;

CREATE POLICY "Authenticated users can read processed images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'processed-images');

CREATE POLICY "Authenticated users can upload own processed images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'processed-images'
  AND owner = auth.uid()
);

CREATE POLICY "Authenticated users can delete own processed images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'processed-images'
  AND owner = auth.uid()
);
