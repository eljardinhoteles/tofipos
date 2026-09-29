import type { Comanda, Mesa } from './database'

type ComandaEstadoBase = Pick<Comanda, 'estado' | 'habitacion_cuenta_id'> & { sincronizado?: boolean }

export function isOperativeComanda(comanda: ComandaEstadoBase) {
  return (!comanda.habitacion_cuenta_id || comanda.sincronizado === false) &&
    ['pendiente', 'en_cocina', 'listo', 'cuenta'].includes(comanda.estado)
}

export function getMesaEstadoEfectivo(
  mesa: Mesa,
  comanda?: ComandaEstadoBase | null
): Mesa {
  if (!comanda) return mesa
  return {
    ...mesa,
    estado: comanda.estado === 'cuenta' ? 'cuenta' : 'ocupada'
  }
}

type ComandaMesaRef = ComandaEstadoBase & { id: string; subcomanda_nombre?: string | null }

// Mesa Múltiple: una mesa puede tener varias comandas operativas (una por
// subcomanda). Devuelve la seleccionada en el sidebar, o la primera si no
// hay selección válida.
export function pickComandaActiva<T extends ComandaMesaRef>(operativas: T[], activeId?: string | null): T | undefined {
  return (activeId ? operativas.find(c => c.id === activeId) : undefined) ?? operativas[0]
}

export function esMesaMultiple(operativas: Array<{ subcomanda_nombre?: string | null }>) {
  return operativas.some(c => !!c.subcomanda_nombre)
}
