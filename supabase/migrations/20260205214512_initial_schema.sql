-- Create todos table
CREATE TABLE IF NOT EXISTS public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  content text NOT NULL,
  is_completed boolean DEFAULT false,
  user_id text NOT NULL -- Matching Kinde user id type
);

-- Enable RLS
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- Create policies (Allow all for now to test connection)
CREATE POLICY "Allow all for testing" ON public.todos FOR ALL USING (true);
