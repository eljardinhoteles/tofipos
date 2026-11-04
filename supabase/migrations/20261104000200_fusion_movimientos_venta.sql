-- Fusión de movimientos de `ventas`: dos equipos que registran un pago a la vez (o uno sin conexión) ya no se pisan.
--
-- Los movimientos (pagos, ajustes, facturas…) viven dentro de UN campo jsonb. Cada equipo sube la lista completa que ve, y con un
-- upsert la última en llegar reemplazaba a la otra: un pago podía desaparecer. Este trigger, ANTES de cada UPDATE, une la lista que
-- ya estaba guardada con la que llega, por el `id` de cada movimiento:
--   · un movimiento que ya estaba guardado NUNCA se pierde (el historial solo crece),
--   · un movimiento nuevo se suma,
--   · si el mismo movimiento llega en dos versiones, gana la que llega, EXCEPTO estos marcadores, que no se pueden revertir con una
--     copia vieja: anulado, anulado_motivo, anulado_at, anulado_por y cierre_id.
-- Cuando recupera movimientos que la escritura entrante había perdido, lo anota en `auditoria_escrituras` (tipo `fusion: …`).
-- Funciona con cualquier versión de la app. REQUIERE 20261102000100_auditoria_escrituras.sql (tabla de registro).
-- Para quitarlo, ver «DESHACER» al final.

CREATE OR REPLACE FUNCTION public.fusionar_movimientos_venta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fusion jsonb;
  v_recuperados int;
  v_headers text;
BEGIN
  BEGIN
    IF jsonb_typeof(OLD.movimientos) = 'array'
       AND jsonb_typeof(NEW.movimientos) = 'array'
       AND OLD.movimientos IS DISTINCT FROM NEW.movimientos THEN

      WITH
        viejos AS (SELECT COALESCE(m->>'id', md5(m::text)) AS id, m FROM jsonb_array_elements(OLD.movimientos) AS m),
        nuevos AS (SELECT COALESCE(m->>'id', md5(m::text)) AS id, m FROM jsonb_array_elements(NEW.movimientos) AS m),
        unidos AS (
          SELECT
            COALESCE(n.id, v.id) AS id,
            CASE
              WHEN n.m IS NULL THEN v.m
              WHEN v.m IS NULL THEN n.m
              ELSE n.m || COALESCE((
                SELECT jsonb_object_agg(k, v.m -> k)
                FROM unnest(ARRAY['anulado', 'anulado_motivo', 'anulado_at', 'anulado_por', 'cierre_id']) AS k
                WHERE v.m ->> k IS NOT NULL AND v.m ->> k <> 'false'
                  AND (n.m ->> k IS NULL OR n.m ->> k = 'false')
              ), '{}'::jsonb)
            END AS m
          FROM nuevos n
          FULL OUTER JOIN viejos v ON v.id = n.id
        )
      SELECT COALESCE(jsonb_agg(u.m ORDER BY u.m ->> 'fecha', u.id), '[]'::jsonb) INTO v_fusion FROM unidos u;

      SELECT count(*) INTO v_recuperados
      FROM jsonb_array_elements(OLD.movimientos) AS o
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.movimientos) AS n WHERE n ->> 'id' = o ->> 'id'
      );

      NEW.movimientos := v_fusion;

      IF v_recuperados > 0 THEN
        v_headers := current_setting('request.headers', true);
        INSERT INTO public.auditoria_escrituras (tabla, fila_id, organization_id, tipo, origen)
        VALUES (
          TG_TABLE_NAME,
          OLD.id::text,
          OLD.organization_id::text,
          'fusion: recupera ' || v_recuperados || ' movimiento(s)',
          left(
            coalesce(substring(NULLIF(v_headers, '')::jsonb ->> 'x-client-info' from 'dispositivo=([^;]+)'), 'sin nombre')
            || ' | ' || coalesce(NULLIF(v_headers, '')::jsonb ->> 'user-agent', 'sin user-agent'),
            240)
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- si la fusión falla, la escritura sigue como antes
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fusionar_movimientos_venta() FROM PUBLIC, anon, authenticated;

-- Nombre con «fusionar_»: corre antes que zz_auditar_ventas, así la auditoría ve la lista ya fusionada.
DROP TRIGGER IF EXISTS fusionar_movimientos_venta_trg ON public.ventas;
CREATE TRIGGER fusionar_movimientos_venta_trg BEFORE UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.fusionar_movimientos_venta();

-- DESHACER:
--   drop trigger if exists fusionar_movimientos_venta_trg on public.ventas;
--   drop function if exists public.fusionar_movimientos_venta();
