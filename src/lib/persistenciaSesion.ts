// Android (y algunos navegadores) pueden vaciar el localStorage de una PWA cuando
// falta almacenamiento o al "optimizar" la app. Ahí vive todo lo que mantiene el
// equipo funcionando: la organización vinculada, la sesión del administrador, el
// mesero activo y la configuración de las impresoras. Perderlo manda al login de
// administrador y deja de imprimir.
//
// Soluciones: (1) pedir al navegador almacenamiento persistente (no se desaloja) y
// (2) guardar una copia de esas claves en IndexedDB y restaurarla al arrancar si el
// localStorage quedó vacío. Al desvincular el equipo la copia se borra, para que una
// salida intencional no se deshaga sola.

const DB = 'pos_respaldo';
const STORE = 'kv';
const CLAVE_ORG = 'pos_active_org_id';

// Claves a respaldar: las fijas más la sesión de Supabase (sb-<proyecto>-auth-token).
const CLAVES = [
  'pos_active_org_id', 'pos_org_name_cached', 'pos_org_telefono_cached', 'pos_org_ruc_cached', 'pos_org_direccion_cached',
  'pos_admin_email', 'pos_current_mesero_id', 'pos_offline_auth', 'pos_auth_cache_v1',
  'pos_print_server_url', 'pos_print_server_token', 'pos_print_cloud_server', 'pos_print_lan_base',
];
const esClaveSupabase = (k: string) => /^sb-.+-auth-token$/.test(k);

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function leerTodo(): Promise<Record<string, string>> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const out: Record<string, string> = {};
    const tx = db.transaction(STORE, 'readonly');
    const cur = tx.objectStore(STORE).openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { out[String(c.key)] = String(c.value); c.continue(); }
    };
    tx.oncomplete = () => { db.close(); resolve(out); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function reemplazar(datos: Record<string, string>): Promise<void> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    st.clear();
    for (const [k, v] of Object.entries(datos)) st.put(v, k);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const clavesActuales = () => {
  const out: string[] = [...CLAVES];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && esClaveSupabase(k)) out.push(k);
    }
  } catch { /* sin storage */ }
  return out;
};

/** Pide al navegador que no desaloje el almacenamiento de esta app. */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

/** Copia las claves importantes a IndexedDB. Si no hay equipo vinculado, no hace nada. */
export async function respaldarSesion(): Promise<void> {
  try {
    if (!localStorage.getItem(CLAVE_ORG)) return;
    const datos: Record<string, string> = {};
    for (const k of clavesActuales()) {
      const v = localStorage.getItem(k);
      if (v != null) datos[k] = v;
    }
    await reemplazar(datos);
  } catch { /* el respaldo es de mejor esfuerzo */ }
}

/** Borra la copia (al desvincular el equipo o cerrar sesión de administrador). */
export async function borrarRespaldoSesion(): Promise<void> {
  try { await reemplazar({}); } catch { /* nada que borrar */ }
}

/**
 * Debe correr ANTES de que arranque la app (y de crear el cliente de Supabase, que lee
 * la sesión al importarse). Si el localStorage perdió la organización pero hay copia,
 * la restaura. Devuelve true si restauró algo.
 */
export async function restaurarSesionSiHaceFalta(): Promise<boolean> {
  try {
    if (localStorage.getItem(CLAVE_ORG)) return false;
    const copia = await leerTodo();
    if (!copia[CLAVE_ORG]) return false;
    for (const [k, v] of Object.entries(copia)) localStorage.setItem(k, v);
    console.info('[sesión] localStorage vacío: se restauró la sesión y la configuración desde el respaldo');
    return true;
  } catch { return false; }
}

/** Mantiene la copia al día: al cambiar de pestaña, al salir y cada minuto. */
export function mantenerRespaldo() {
  void respaldarSesion();
  const alOcultar = () => { if (document.visibilityState === 'hidden') void respaldarSesion(); };
  document.addEventListener('visibilitychange', alOcultar);
  window.addEventListener('pagehide', () => { void respaldarSesion(); });
  setInterval(() => { if (document.visibilityState === 'visible') void respaldarSesion(); }, 60_000);
}
