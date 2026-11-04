-- Pista de auditoría (solo registra, NUNCA bloquea ni cambia una escritura): detecta cuando un dispositivo sube a Supabase
--   · 'vieja'    → una versión con `updated_at` MÁS ANTIGUO que el que ya estaba guardado (puede pisar un cambio más reciente), o
--   · 'identica' → el mismo contenido que ya existía (re-envío innecesario; solo sube `_modified`).
-- El push del POS es un upsert sin comparar versiones, así que esto mide cuántas veces ocurre y desde qué dispositivo: el nombre que
-- se le da en Ajustes (cabecera X-Client-Info, «dispositivo=Barra») y el user-agent del navegador.
-- Se puede consultar con:  select tabla, tipo, count(*) from public.auditoria_escrituras group by 1,2 order by 3 desc;
-- Para quitarlo todo, ver el bloque «DESHACER» al final.

CREATE TABLE IF NOT EXISTS public.auditoria_escrituras (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  tabla text NOT NULL,
  fila_id text NOT NULL,
  organization_id text,
  tipo text NOT NULL,
  updated_antes text,
  updated_nuevo text,
  estado_antes text,
  estado_nuevo text,
  origen text
);
CREATE INDEX IF NOT EXISTS idx_auditoria_escrituras_at ON public.auditoria_escrituras (at);

-- Solo se lee con el servicio / desde el panel: ningún rol de la app la ve ni la escribe directamente.
ALTER TABLE public.auditoria_escrituras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auditoria_escrituras FROM anon, authenticated;

-- SECURITY DEFINER: el trigger corre con el rol que escribe (authenticated), que no tiene acceso a la tabla de auditoría.
-- Todo va dentro de un bloque con EXCEPTION: si algo falla aquí, la escritura original sigue igual.
CREATE OR REPLACE FUNCTION public.auditar_escritura_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_tipo text;
  v_headers text;
BEGIN
  BEGIN
    v_old := to_jsonb(OLD) - '_modified';
    v_new := to_jsonb(NEW) - '_modified';

    IF v_old = v_new THEN
      v_tipo := 'identica';
    ELSIF v_new ? 'updated_at'
      AND (v_new->>'updated_at') IS NOT NULL
      AND (v_old->>'updated_at') IS NOT NULL
      AND (v_new->>'updated_at')::timestamptz < (v_old->>'updated_at')::timestamptz THEN
      v_tipo := 'vieja';
    END IF;

    IF v_tipo IS NOT NULL THEN
      v_headers := current_setting('request.headers', true);
      INSERT INTO public.auditoria_escrituras
        (tabla, fila_id, organization_id, tipo, updated_antes, updated_nuevo, estado_antes, estado_nuevo, origen)
      VALUES (
        TG_TABLE_NAME,
        v_old->>'id',
        v_old->>'organization_id',
        v_tipo,
        v_old->>'updated_at',
        v_new->>'updated_at',
        v_old->>'estado',
        v_new->>'estado',
        left(
          coalesce(substring(NULLIF(v_headers, '')::jsonb->>'x-client-info' from 'dispositivo=([^;]+)'), 'sin nombre')
          || ' | ' || coalesce(NULLIF(v_headers, '')::jsonb->>'user-agent', 'sin user-agent'),
          240)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- la auditoría nunca debe impedir una escritura
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_escritura_cliente() FROM PUBLIC, anon, authenticated;

-- Nombre con «zz_»: corre después de update_modified_* (los BEFORE UPDATE se ejecutan por orden alfabético).
DROP TRIGGER IF EXISTS zz_auditar_comandas ON public.comandas;
CREATE TRIGGER zz_auditar_comandas BEFORE UPDATE ON public.comandas FOR EACH ROW EXECUTE FUNCTION public.auditar_escritura_cliente();
DROP TRIGGER IF EXISTS zz_auditar_comanda_items ON public.comanda_items;
CREATE TRIGGER zz_auditar_comanda_items BEFORE UPDATE ON public.comanda_items FOR EACH ROW EXECUTE FUNCTION public.auditar_escritura_cliente();
DROP TRIGGER IF EXISTS zz_auditar_mesas ON public.mesas;
CREATE TRIGGER zz_auditar_mesas BEFORE UPDATE ON public.mesas FOR EACH ROW EXECUTE FUNCTION public.auditar_escritura_cliente();
DROP TRIGGER IF EXISTS zz_auditar_habitacion_cuentas ON public.habitacion_cuentas;
CREATE TRIGGER zz_auditar_habitacion_cuentas BEFORE UPDATE ON public.habitacion_cuentas FOR EACH ROW EXECUTE FUNCTION public.auditar_escritura_cliente();
DROP TRIGGER IF EXISTS zz_auditar_ventas ON public.ventas;
CREATE TRIGGER zz_auditar_ventas BEFORE UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.auditar_escritura_cliente();

-- Mantenimiento: la tabla crece con cada re-envío. Para limpiar lo viejo:
--   delete from public.auditoria_escrituras where at < now() - interval '30 days';

-- DESHACER (quita todo y la escritura vuelve a ser exactamente la de antes):
--   drop trigger if exists zz_auditar_comandas on public.comandas;
--   drop trigger if exists zz_auditar_comanda_items on public.comanda_items;
--   drop trigger if exists zz_auditar_mesas on public.mesas;
--   drop trigger if exists zz_auditar_habitacion_cuentas on public.habitacion_cuentas;
--   drop trigger if exists zz_auditar_ventas on public.ventas;
--   drop function if exists public.auditar_escritura_cliente();
--   drop table if exists public.auditoria_escrituras;
