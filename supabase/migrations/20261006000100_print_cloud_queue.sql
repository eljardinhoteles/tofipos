-- Cola de impresión en la nube.
--
-- Las tablets/PCs encolan trabajos en `print_jobs`; el servidor de impresión
-- (PC con las impresoras) los reclama y los imprime. Así no hace falta IP ni
-- token por dispositivo, y funciona con la app servida por HTTPS (sin
-- contenido mixto). Un servidor por organización (el emparejamiento nuevo
-- reemplaza al anterior).

-- ── Servidores de impresión ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.print_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  name text NOT NULL DEFAULT 'Servidor de impresión',
  hostname text,
  version text,
  ips jsonb NOT NULL DEFAULT '[]'::jsonb,
  system_printers jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_seen timestamptz,
  paired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  _deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS print_servers_org_idx
  ON public.print_servers (organization_id) WHERE NOT _deleted;

-- Secretos del servidor: solo service_role (sin políticas = nadie más lee).
CREATE TABLE IF NOT EXISTS public.print_server_secrets (
  server_id uuid PRIMARY KEY REFERENCES public.print_servers(id) ON DELETE CASCADE,
  secret_hash text,
  pairing_code_hash text,
  pairing_expires_at timestamptz
);

ALTER TABLE public.print_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_server_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS print_servers_select_org ON public.print_servers;
CREATE POLICY print_servers_select_org ON public.print_servers
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()));
-- Escritura de print_servers: solo la Edge Function `print-server` (service_role).

-- ── Impresoras configuradas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.print_printers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  server_id uuid NOT NULL REFERENCES public.print_servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  target text NOT NULL,
  roles text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  _deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS print_printers_server_idx
  ON public.print_printers (server_id) WHERE NOT _deleted;

ALTER TABLE public.print_printers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS print_printers_select_org ON public.print_printers;
CREATE POLICY print_printers_select_org ON public.print_printers
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()));

DROP POLICY IF EXISTS print_printers_insert_admin ON public.print_printers;
CREATE POLICY print_printers_insert_admin ON public.print_printers
  FOR INSERT TO authenticated
  WITH CHECK (public.es_admin_de_org(organization_id));

DROP POLICY IF EXISTS print_printers_update_admin ON public.print_printers;
CREATE POLICY print_printers_update_admin ON public.print_printers
  FOR UPDATE TO authenticated
  USING (public.es_admin_de_org(organization_id))
  WITH CHECK (public.es_admin_de_org(organization_id));

DROP POLICY IF EXISTS print_printers_delete_admin ON public.print_printers;
CREATE POLICY print_printers_delete_admin ON public.print_printers
  FOR DELETE TO authenticated
  USING (public.es_admin_de_org(organization_id));

-- ── Trabajos de impresión ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.print_jobs (
  -- Lo genera el cliente: un reintento de red nunca duplica el trabajo.
  id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('kitchen', 'receipt', 'test')),
  title text NOT NULL DEFAULT '',
  raw_text text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Solo para kind = 'test': impresora concreta (print_printers.id).
  printer_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'printing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  claimed_by uuid,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz
);

CREATE INDEX IF NOT EXISTS print_jobs_org_status_idx
  ON public.print_jobs (organization_id, status, created_at);

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS print_jobs_select_org ON public.print_jobs;
CREATE POLICY print_jobs_select_org ON public.print_jobs
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()));

DROP POLICY IF EXISTS print_jobs_insert_org ON public.print_jobs;
CREATE POLICY print_jobs_insert_org ON public.print_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.mis_organizaciones())
    AND status = 'pending'
  );

-- Reimprimir / cancelar desde la app: solo volver a 'pending' o marcar 'failed'.
DROP POLICY IF EXISTS print_jobs_update_org ON public.print_jobs;
CREATE POLICY print_jobs_update_org ON public.print_jobs
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.mis_organizaciones()))
  WITH CHECK (
    organization_id IN (SELECT public.mis_organizaciones())
    AND status IN ('pending', 'failed')
  );

-- ── Reclamar trabajos (atómico) ──────────────────────────────────────────────
-- Un trabajo viejo ya no se imprime (un ticket de hace 30 min sería ruido en
-- cocina): los 'pending' pasan a 'failed' al superar `p_max_age`. Los
-- 'printing' que quedaron colgados (servidor caído a medio imprimir) también
-- pasan a 'failed' en vez de reintentarse solos, para no imprimir doble.
CREATE OR REPLACE FUNCTION public.claim_print_jobs(
  p_server_id uuid,
  p_org text,
  p_limit integer DEFAULT 10,
  p_max_age interval DEFAULT interval '10 minutes'
)
RETURNS SETOF public.print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.print_jobs
     SET status = 'failed',
         last_error = 'Expirado sin imprimir',
         updated_at = now()
   WHERE organization_id = p_org
     AND status = 'pending'
     AND created_at <= now() - p_max_age;

  UPDATE public.print_jobs
     SET status = 'failed',
         last_error = 'El servidor se detuvo mientras imprimía',
         updated_at = now()
   WHERE organization_id = p_org
     AND status = 'printing'
     AND updated_at <= now() - interval '2 minutes';

  -- Limpieza ocasional de historial viejo.
  IF random() < 0.02 THEN
    DELETE FROM public.print_jobs
     WHERE organization_id = p_org
       AND status IN ('done', 'failed')
       AND created_at < now() - interval '3 days';
  END IF;

  RETURN QUERY
  UPDATE public.print_jobs j
     SET status = 'printing',
         attempts = j.attempts + 1,
         claimed_by = p_server_id,
         updated_at = now()
   WHERE j.id IN (
     SELECT id FROM public.print_jobs
      WHERE organization_id = p_org
        AND status = 'pending'
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_print_jobs(uuid, text, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_print_jobs(uuid, text, integer, interval) TO service_role;
