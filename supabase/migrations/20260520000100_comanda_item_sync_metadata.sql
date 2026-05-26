ALTER TABLE public.comanda_items
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DELETE FROM public.comanda_items a
USING public.comanda_items b
WHERE a.id = b.id
  AND a.ctid < b.ctid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.comanda_items'::regclass
      AND contype IN ('p', 'u')
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.comanda_items'::regclass AND attname = 'id')
      ]
  ) THEN
    ALTER TABLE public.comanda_items
    ADD CONSTRAINT comanda_items_id_unique UNIQUE (id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.comanda_item_deletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id uuid NOT NULL,
  item_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comanda_item_deletes_org
  ON public.comanda_item_deletes (organization_id);

CREATE INDEX IF NOT EXISTS idx_comanda_item_deletes_comanda
  ON public.comanda_item_deletes (comanda_id);

ALTER TABLE public.comanda_item_deletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for comanda item deletes" ON public.comanda_item_deletes;
CREATE POLICY "Allow all for comanda item deletes"
  ON public.comanda_item_deletes
  FOR ALL
  USING (true)
  WITH CHECK (true);
