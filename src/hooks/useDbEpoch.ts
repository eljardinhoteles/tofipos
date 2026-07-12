import { useEffect, useState } from 'react'
import { getDbEpoch, subscribeDbEpoch } from '../db/rxdb'

/**
 * Devuelve el epoch actual de la base de datos local.
 * Cambia cada vez que la DB se destruye y recrea (desvincular → vincular).
 * Úsalo en los arrays de dependencia de useEffect para que los hooks
 * se re-suscriban automáticamente a la nueva instancia de colección.
 */
export function useDbEpoch(): number {
  const [epoch, setEpoch] = useState(getDbEpoch)
  useEffect(() => subscribeDbEpoch(() => setEpoch(getDbEpoch())), [])
  return epoch
}
