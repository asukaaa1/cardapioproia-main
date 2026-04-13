-- Create prompts_config table for storing user-customized AI prompts
CREATE TABLE IF NOT EXISTS prompts_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  universal_prompt TEXT NOT NULL,
  pattern_prompts JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Add index for faster lookups
CREATE INDEX idx_prompts_config_user_id ON prompts_config(user_id);

-- Enable Row Level Security
ALTER TABLE prompts_config ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own prompts
CREATE POLICY "Users can read their own prompts"
  ON prompts_config
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own prompts
CREATE POLICY "Users can insert their own prompts"
  ON prompts_config
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own prompts
CREATE POLICY "Users can update their own prompts"
  ON prompts_config
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
