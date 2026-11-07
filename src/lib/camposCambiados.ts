// Compara un documento con la última versión que el servidor se sabía y devuelve SOLO los campos que cambiaron. Así un dispositivo
// que edita una sola cosa (por ejemplo `estado`) no pisa con su copia entera lo que otro equipo cambió en otros campos
// (`total`, `cantidades_snapshot`…) al mismo tiempo.
const IGNORADOS = new Set(['_modified', '_attachments', '_meta', '_rev']);

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// undefined y null cuentan como lo mismo: una migración de esquema añade campos en null que en el servidor ya están vacíos.
// Las fechas se comparan como instante: el equipo escribe «…T17:11:29.303Z» y el servidor devuelve «…T17:11:29.303+00:00», que son la
// misma hora pero distinto texto; sin esto cada documento parecía cambiado en created_at, confirmada_at… y se re-subía una y otra vez.
const clave = (v: unknown) => {
  if (typeof v === 'string' && FECHA_ISO.test(v)) {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return `fecha:${t}`;
  }
  return JSON.stringify(v === undefined ? null : v);
};

/**
 * Campos de `nuevo` distintos de `base`, más `updated_at`. Devuelve null si no hay ningún cambio real (solo cambian `updated_at`/`_modified`):
 * en ese caso no hay nada que subir.
 */
export function camposCambiados(nuevo: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> | null {
  const cambios: Record<string, unknown> = {};
  let reales = 0;
  for (const k of Object.keys(nuevo)) {
    if (IGNORADOS.has(k)) continue;
    if (clave(nuevo[k]) !== clave(base[k])) {
      cambios[k] = nuevo[k];
      if (k !== 'updated_at') reales++;
    }
  }
  return reales > 0 ? cambios : null;
}
