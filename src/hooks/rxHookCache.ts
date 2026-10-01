// Caché a nivel de módulo para los hooks de suscripción a RxDB (mesas, pisos,
// clientes, comandas, menú). Sin esto, cada vez que un componente que los usa
// se vuelve a montar (p. ej. el sheet de mesa al volver de "Añadir productos")
// arranca con [] y espera una consulta nueva + toJSON() de toda la colección:
// el panel se ve vacío y luego se llena. Con el caché arranca ya con los
// últimos datos conocidos, y si la primera emisión es idéntica no re-renderiza.
const store = new Map<string, { org: string; data: any }>();

const orgKey = () => localStorage.getItem('pos_active_org_id') || '';

export function readHookCache<T>(name: string, fallback: T): T {
  const hit = store.get(name);
  return hit && hit.org === orgKey() ? (hit.data as T) : fallback;
}

/** Devuelve la misma referencia cacheada si el contenido no cambió. */
export function commitHookCache<T>(name: string, next: T): T {
  const hit = store.get(name);
  if (hit && hit.org === orgKey() && JSON.stringify(hit.data) === JSON.stringify(next)) {
    return hit.data as T;
  }
  store.set(name, { org: orgKey(), data: next });
  return next;
}
