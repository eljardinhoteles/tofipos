-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  price numeric NOT NULL, -- real maps to numeric in Postgres
  category text,
  image_url text,
  stock integer DEFAULT 0,
  user_id text NOT NULL -- Matching Kinde user id type
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create policies (Allow all for now to test connection)
CREATE POLICY "Allow all for testing products" ON public.products FOR ALL USING (true);
