import type { Comanda, Mesa } from './database'

type ComandaEstadoBase = Pick<Comanda, 'estado' | 'habitacion_cuenta_id'> & { sincronizado?: boolean }

export function isOperativeComanda(comanda: ComandaEstadoBase) {
  return (!comanda.habitacion_cuenta_id || comanda.sincronizado === false) &&
    ['pendiente', 'en_cocina', 'listo', 'cuenta'].includes(comanda.estado)
}

export function isOperativeComandaForMesa(comanda: ComandaEstadoBase) {
  return isOperativeComanda(comanda)
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
