// La sincronización en vivo a veces entrega con retraso la versión anterior de un
// documento (el aviso de tu cambio previo llega después de que ya hiciste otro):
// una cantidad pasa de 8 a 5 y vuelve a 8. Este filtro evita pintar ese retroceso:
// si un documento llega con un `updated_at` más viejo que el que se acaba de ver, se
// conserva el nuevo. Solo actúa en una ventana corta; pasado ese tiempo se acepta
// lo que llegue (p. ej. un cambio legítimo desde otro equipo con el reloj atrasado).

const VENTANA_MS = 15_000;

type Doc = { id: string; updated_at?: string | null; _modified?: string | null };

export function crearEstabilizador<T extends Doc>() {
  const vistos = new Map<string, { mod: number; doc: T; desde: number }>();
  return (docs: T[]): T[] => {
    const ahora = Date.now();
    const ids = new Set<string>();
    const out = docs.map((d) => {
      ids.add(d.id);
      // Se ordena por `updated_at` (lo pone el equipo que edita). `_modified` no sirve: el servidor
      // lo vuelve a sellar al recibir cada cambio, y la versión vieja que regresa trae una hora más
      // nueva que la edición local.
      const mod = Date.parse(d.updated_at ?? d._modified ?? '') || 0;
      const prev = vistos.get(d.id);
      if (prev && mod < prev.mod && ahora - prev.desde < VENTANA_MS) {
        return prev.doc;
      }
      if (!prev || mod >= prev.mod) vistos.set(d.id, { mod, doc: d, desde: ahora });
      return d;
    });
    // Olvida los que ya no están en la lista (borrados o de otra comanda).
    for (const id of vistos.keys()) if (!ids.has(id)) vistos.delete(id);
    return out;
  };
}
