-- ⚠ DESTRUCTIVO E IRREVERSIBLE: elimina todo el historial de auditoría.
-- La auditoría se retiró de la app (ya nada escribe en esta tabla). Ejecútalo solo
-- cuando ya no necesites ese historial; si dudas, exporta antes:
--   COPY (SELECT * FROM public.audit_logs) TO STDOUT WITH CSV HEADER;
-- (o desde el panel: Table Editor → audit_logs → Export to CSV).
DROP TABLE IF EXISTS public.audit_logs;
