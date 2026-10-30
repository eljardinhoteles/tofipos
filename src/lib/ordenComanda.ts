// Orden en que se ven los productos de una comanda: primero lo marcado «imprimir primero» (las entradas), al medio todo lo demás y
// al final las bebidas. Es el mismo criterio del ticket de cocina (ver `printTemplateEngine`): la pantalla y el papel coinciden.
// Solo es de visualización: no cambia lo guardado, los totales ni lo que se manda a cocina. Dentro de cada grupo se conserva el
// orden en que se añadieron.
interface ItemOrdenable {
  es_bebida?: boolean | null;
  imprimir_primero?: boolean | null;
  created_at?: string | null;
}

const grupoDe = (i: ItemOrdenable) => (i.es_bebida ? 2 : i.imprimir_primero ? 0 : 1);

export function ordenarItemsComanda<T extends ItemOrdenable>(items: readonly T[]): T[] {
  return items
    .map((item, pos) => ({ item, pos }))
    .sort((a, b) =>
      grupoDe(a.item) - grupoDe(b.item)
      || (a.item.created_at || '').localeCompare(b.item.created_at || '')
      || a.pos - b.pos)
    .map((x) => x.item);
}
