-- Guardián de estados finales: una copia vieja que sube un dispositivo ya no puede
--   · reabrir una comanda (o cuenta de habitación) que en el servidor está cerrada, facturada o anulada, ni
--   · revivir un documento que en el servidor está borrado.
-- Solo actúa cuando lo que llega tiene `updated_at` MÁS ANTIGUO que lo guardado; una acción legítima siempre trae un `updated_at` más
-- nuevo y pasa sin tocarse. Lo ignorado queda registrado en `auditoria_escrituras` (tipo `bloqueada:…`) y, al subir `_modified`, el
-- dispositivo que subió la copia vieja vuelve a descargar la versión buena en su siguiente sincronización.
-- REQUIERE haber aplicado antes 20261102000100_auditoria_escrituras.sql (la tabla de registro).
-- Para quitarlo, ver «DESHACER» al final.

CREATE OR REPLACE FUNCTION public.proteger_estado_final()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motivo text;
  v_headers text;
BEGIN
  BEGIN
    IF NEW.updated_at IS NOT NULL AND OLD.updated_at IS NOT NULL AND NEW.updated_at < OLD.updated_at THEN
      IF TG_TABLE_NAME = 'comandas'
         AND OLD.estado IN ('cerrado', 'facturado', 'anulada')
         AND NEW.estado NOT IN ('cerrado', 'facturado', 'anulada') THEN
        v_motivo := 'bloqueada: reabre estado final';
      ELSIF TG_TABLE_NAME = 'habitacion_cuentas'
         AND OLD.estado = 'cerrada'
         AND NEW.estado <> 'cerrada' THEN
        v_motivo := 'bloqueada: reabre estado final';
      ELSIF COALESCE(OLD._deleted, false) AND NOT COALESCE(NEW._deleted, false) THEN
        v_motivo := 'bloqueada: revive borrado';
      END IF;
    END IF;

    IF v_motivo IS NOT NULL THEN
      v_headers := current_setting('request.headers', true);
      INSERT INTO public.auditoria_escrituras
        (tabla, fila_id, organization_id, tipo, updated_antes, updated_nuevo, estado_antes, estado_nuevo, origen)
      VALUES (
        TG_TABLE_NAME,
        OLD.id::text,
        OLD.organization_id::text,
        v_motivo,
        OLD.updated_at::text,
        NEW.updated_at::text,
        OLD.estado::text,
        NEW.estado::text,
        left(
          coalesce(substring(NULLIF(v_headers, '')::jsonb->>'x-client-info' from 'dispositivo=([^;]+)'), 'sin nombre')
          || ' | ' || coalesce(NULLIF(v_headers, '')::jsonb->>'user-agent', 'sin user-agent'),
          240)
      );
      RETURN OLD; -- la fila queda como estaba (el trigger update_modified_* sube `_modified` y los demás dispositivos la vuelven a bajar)
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- si el guardián falla, la escritura sigue como antes
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_estado_final() FROM PUBLIC, anon, authenticated;

-- Nombre con «proteger_»: corre antes que update_modified_* y antes que zz_auditar_* (los BEFORE UPDATE van por orden alfabético).
DROP TRIGGER IF EXISTS proteger_estado_final_comandas ON public.comandas;
CREATE TRIGGER proteger_estado_final_comandas BEFORE UPDATE ON public.comandas FOR EACH ROW EXECUTE FUNCTION public.proteger_estado_final();
DROP TRIGGER IF EXISTS proteger_estado_final_comanda_items ON public.comanda_items;
CREATE TRIGGER proteger_estado_final_comanda_items BEFORE UPDATE ON public.comanda_items FOR EACH ROW EXECUTE FUNCTION public.proteger_estado_final();
DROP TRIGGER IF EXISTS proteger_estado_final_habitacion_cuentas ON public.habitacion_cuentas;
CREATE TRIGGER proteger_estado_final_habitacion_cuentas BEFORE UPDATE ON public.habitacion_cuentas FOR EACH ROW EXECUTE FUNCTION public.proteger_estado_final();

-- PRUEBA (no deja ningún cambio): intenta reabrir con una fecha vieja una comanda cerrada y comprueba que sigue cerrada.
--   begin;
--   update public.comandas set estado = 'pendiente', updated_at = '2020-01-01' where id = (select id from public.comandas where estado = 'cerrado' limit 1);
--   select estado from public.comandas where id = (select id from public.auditoria_escrituras where tipo like 'bloqueada%' order by id desc limit 1)::uuid; -- debe seguir «cerrado»
--   rollback;

-- DESHACER:
--   drop trigger if exists proteger_estado_final_comandas on public.comandas;
--   drop trigger if exists proteger_estado_final_comanda_items on public.comanda_items;
--   drop trigger if exists proteger_estado_final_habitacion_cuentas on public.habitacion_cuentas;
--   drop function if exists public.proteger_estado_final();
