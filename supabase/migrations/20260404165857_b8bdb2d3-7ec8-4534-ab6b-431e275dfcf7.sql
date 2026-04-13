
-- Create storage bucket for processed images
INSERT INTO storage.buckets (id, name, public) VALUES ('processed-images', 'processed-images', true);

-- Allow public read access to processed images
CREATE POLICY "Processed images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'processed-images');

-- Allow anonymous uploads (no auth required for this app)
CREATE POLICY "Anyone can upload processed images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'processed-images');

-- Allow deletion of processed images
CREATE POLICY "Anyone can delete processed images"
ON storage.objects FOR DELETE
USING (bucket_id = 'processed-images');

-- Create table for photo history
CREATE TABLE public.photo_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  original_image_url TEXT NOT NULL,
  result_image_url TEXT NOT NULL,
  pattern TEXT DEFAULT 'auto',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Enable RLS
ALTER TABLE public.photo_history ENABLE ROW LEVEL SECURITY;

-- Allow read/write by session_id (no auth needed)
CREATE POLICY "Anyone can view photos by session"
ON public.photo_history FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert photos"
ON public.photo_history FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can delete expired photos"
ON public.photo_history FOR DELETE
USING (true);

-- Index for session lookups and expiry cleanup
CREATE INDEX idx_photo_history_session ON public.photo_history(session_id);
CREATE INDEX idx_photo_history_expires ON public.photo_history(expires_at);
