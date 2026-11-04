// Compara un documento con la última versión que el servidor se sabía y devuelve SOLO los campos que cambiaron. Así un dispositivo
// que edita una sola cosa (por ejemplo `estado`) no pisa con su copia entera lo que otro equipo cambió en otros campos
// (`total`, `cantidades_snapshot`…) al mismo tiempo.
const IGNORADOS = new Set(['_modified', '_attachments', '_meta', '_rev']);

// undefined y null cuentan como lo mismo: una migración de esquema añade campos en null que en el servidor ya están vacíos.
const clave = (v: unknown) => JSON.stringify(v === undefined ? null : v);

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
