// Caché local (localStorage) de los datos públicos de la organización activa,
// usados por el motor de impresión (printTemplateEngine) y algunas vistas que
// necesitan mostrarlos sin esperar un round-trip a Supabase. La fuente de
// verdad sigue siendo la tabla `organizaciones`; esto es solo un espejo.

const KEYS = {
  nombre: 'pos_org_name_cached',
  ruc: 'pos_org_ruc_cached',
  telefono: 'pos_org_telefono_cached',
  direccion: 'pos_org_direccion_cached',
} as const;

export type OrgCacheData = {
  nombre?: string | null;
  ruc?: string | null;
  telefono?: string | null;
  direccion?: string | null;
};

/** Guarda en localStorage los campos presentes en `data` (los ausentes/undefined no se tocan; string vacío limpia la clave). */
export function setOrgCache(data: OrgCacheData) {
  if (typeof localStorage === 'undefined') return;
  (Object.keys(KEYS) as Array<keyof typeof KEYS>).forEach((field) => {
    if (!(field in data)) return;
    const value = data[field];
    if (value) localStorage.setItem(KEYS[field], value);
    else localStorage.removeItem(KEYS[field]);
  });
}

export function getOrgCache(): Required<OrgCacheData> {
  const read = (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null) || '';
  return {
    nombre: read(KEYS.nombre),
    ruc: read(KEYS.ruc),
    telefono: read(KEYS.telefono),
    direccion: read(KEYS.direccion),
  };
}
