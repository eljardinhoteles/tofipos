// Mesa Múltiple: cocina recibe un solo ticket por mesa, aunque cada subcomanda
// sea una comanda con su propio estado de confirmación. Replica por comanda la
// lógica de "ítems nuevos" de SidebarDetails (creados tras confirmada_at, o con
// cantidad mayor a la del snapshot) y la agrega a nivel de mesa.

type AnyRec = Record<string, any>

function parseSnapshot(comanda: AnyRec): Record<string, number> {
  try { return comanda.cantidades_snapshot ? JSON.parse(comanda.cantidades_snapshot) : {} } catch { return {} }
}

export function deltaComanda(comanda: AnyRec, items: AnyRec[]) {
  const vivos = items.filter(i => !i.anulado)
  if (!comanda.confirmada_at) {
    return { nuevos: vivos, anulados: [] as AnyRec[] }
  }
  const snap = parseSnapshot(comanda)
  const nuevos: AnyRec[] = []
  for (const item of vivos) {
    if (item.created_at && item.created_at > comanda.confirmada_at) nuevos.push(item)
  }
  for (const item of vivos) {
    const conf = snap[item.id]
    if (conf !== undefined && item.cantidad > conf) nuevos.push({ ...item, cantidad: item.cantidad - conf })
  }
  const anulados = items.filter(i => i.anulado && i.anulado_at && i.anulado_at > comanda.confirmada_at)
  return { nuevos, anulados }
}

// Junta ítems iguales de distintas subcomandas ("3 Hamburguesas"): a cocina le
// sirve preparar todo junto, los nombres de subcomanda no salen en el ticket.
export function mergeItemsCocina(items: AnyRec[]) {
  const map = new Map<string, AnyRec>()
  for (const it of items) {
    const key = [it.item_id, (it.modificadores ?? []).join('|'), it.nota ?? ''].join('::')
    const prev = map.get(key)
    if (prev) prev.cantidad += it.cantidad
    else map.set(key, { ...it })
  }
  return [...map.values()]
}

export function deltaGrupo(comandas: AnyRec[], items: AnyRec[]) {
  const nuevos: AnyRec[] = []
  const anulados: AnyRec[] = []
  const porComanda: Array<{ comanda: AnyRec; items: AnyRec[]; nuevos: AnyRec[] }> = []
  let algunaConfirmada = false
  for (const c of comandas) {
    const propios = items.filter(i => i.comanda_id === c.id)
    const d = deltaComanda(c, propios)
    if (c.confirmada) algunaConfirmada = true
    nuevos.push(...d.nuevos)
    anulados.push(...d.anulados)
    porComanda.push({ comanda: c, items: propios, nuevos: d.nuevos })
  }
  const vivos = items.filter(i => !i.anulado)
  return { algunaConfirmada, nuevos, anulados, porComanda, vivos }
}
