// Caché local de credenciales para login offline (arquitectura local-first).
// Solo guarda un verificador PBKDF2 (salt + hash) por email, NUNCA la contraseña,
// y nunca se sincroniza: vive únicamente en localStorage de este dispositivo.

const STORAGE_KEY = 'pos_auth_cache_v1';
const PBKDF2_ITERATIONS = 150_000;
// Sin validación online durante este periodo, se exige login con internet
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedCredential {
  userId: string;
  saltB64: string;
  hashB64: string;
  cachedAt: string;
}

type CacheMap = Record<string, CachedCredential>;

function readCache(): CacheMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(cache: CacheMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function deriveHash(password: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return toB64(bits);
}

/** Guarda/actualiza el verificador tras un login online exitoso. */
export async function cacheCredential(email: string, password: string, userId: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashB64 = await deriveHash(password, salt);
  const cache = readCache();
  cache[email.trim().toLowerCase()] = {
    userId,
    saltB64: toB64(salt.buffer),
    hashB64,
    cachedAt: new Date().toISOString(),
  };
  writeCache(cache);
}

/**
 * Verifica email+contraseña contra el caché local.
 * Devuelve el userId si coincide y no expiró; null en caso contrario.
 */
export async function verifyCachedCredential(email: string, password: string): Promise<string | null> {
  const entry = readCache()[email.trim().toLowerCase()];
  if (!entry) return null;

  if (Date.now() - new Date(entry.cachedAt).getTime() > MAX_AGE_MS) return null;

  const hashB64 = await deriveHash(password, fromB64(entry.saltB64));
  return hashB64 === entry.hashB64 ? entry.userId : null;
}

/** ¿Existe verificador (aunque falle la clave) para este email? Útil para mensajes de error. */
export function hasCachedCredential(email: string): boolean {
  return !!readCache()[email.trim().toLowerCase()];
}

export function removeCachedCredential(email: string) {
  const cache = readCache();
  delete cache[email.trim().toLowerCase()];
  writeCache(cache);
}

/** Limpieza total (al desvincular el dispositivo). */
export function clearAuthCache() {
  localStorage.removeItem(STORAGE_KEY);
}
