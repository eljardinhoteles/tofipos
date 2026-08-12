import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Configuración de "Métodos de pago" en Ajustes — listas de bancos destino
 * (transferencias) y redes de tarjeta (TC), usadas al registrar un pago en
 * el Centro de Ventas. Se leen/escriben directo contra la tabla
 * organizaciones en Supabase, sin RxDB local (mismo patrón que
 * AjustesOrganizacion — RxDB ya está en el límite de 13 colecciones).
 */
export function useMetodosPagoConfig() {
  const orgId = localStorage.getItem('pos_active_org_id') || ''
  const [bancos, setBancos] = useState<string[]>([])
  const [redesTarjeta, setRedesTarjeta] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const recargar = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('organizaciones')
        .select('*')
        .eq('id', orgId)
        .maybeSingle()
      if (error) throw error
      setBancos(Array.isArray(data?.bancos) ? data.bancos : [])
      setRedesTarjeta(Array.isArray(data?.redes_tarjeta) ? data.redes_tarjeta : [])
    } catch (e: any) {
      // Ignorar si las columnas no existen en la tabla
      if (e?.code !== '42703') {
        console.error('Error cargando métodos de pago:', e)
      }
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { recargar() }, [recargar])

  const guardarBancos = async (nuevos: string[]) => {
    if (!orgId) return
    const { error } = await supabase.from('organizaciones').update({ bancos: nuevos }).eq('id', orgId)
    if (error) throw error
    setBancos(nuevos)
  }

  const guardarRedesTarjeta = async (nuevas: string[]) => {
    if (!orgId) return
    const { error } = await supabase.from('organizaciones').update({ redes_tarjeta: nuevas }).eq('id', orgId)
    if (error) throw error
    setRedesTarjeta(nuevas)
  }

  return { bancos, redesTarjeta, loading, guardarBancos, guardarRedesTarjeta, recargar }
}
