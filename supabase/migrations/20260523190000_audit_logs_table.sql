CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY,
  entity text NOT NULL,
  entity_id text,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'status_change')),
  summary text NOT NULL,
  before_state text,
  after_state text,
  actor_id text NOT NULL DEFAULT '',
  actor_name text,
  actor_role text,
  actor_email text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  organization_id text NOT NULL,
  _deleted boolean NOT NULL DEFAULT false,
  _modified timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx
  ON public.audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_org_entity_created_idx
  ON public.audit_logs (organization_id, entity, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_org_action_created_idx
  ON public.audit_logs (organization_id, action, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_select_authenticated"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_authenticated"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "audit_logs_update_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_update_authenticated"
  ON public.audit_logs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "audit_logs_delete_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_delete_authenticated"
  ON public.audit_logs
  FOR DELETE
  TO authenticated
  USING (true);
