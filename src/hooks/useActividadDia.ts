import { useCallback, useEffect, useMemo, useState } from 'react';
import { initVerticalRxDb, forceSyncAll } from '../db/rxdb';
import { useDbEpoch } from './useDbEpoch';
import { construirActividad, inicioDelDia } from '../lib/actividadDia';
import { showToast } from '../lib/toast';

type Colecciones = Record<'comandas' | 'items' | 'pagos' | 'ventas' | 'habitaciones' | 'mesas' | 'usuarios', any[]>;
const VACIO: Colecciones = { comandas: [], items: [], pagos: [], ventas: [], habitaciones: [], mesas: [], usuarios: [] };

/**
 * Actividad de hoy, en vivo. Solo se suscribe mientras `activo` es true (drawer
 * abierto): no consume nada en segundo plano.
 */
export function useActividadDia(activo: boolean) {
  const [datos, setDatos] = useState<Colecciones>(VACIO);
  const [cargando, setCargando] = useState(true);
  const dbEpoch = useDbEpoch();
  // Cada "Actualizar" reinicia las consultas y recalcula "hoy".
  const [tick, setTick] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const [actualizadoA, setActualizadoA] = useState<Date | null>(null);
  // Se recalcula al abrir y al actualizar: si la app quedó abierta pasada la medianoche, "hoy" cambia.
  const inicio = useMemo(() => (activo ? inicioDelDia() : ''), [activo, tick]);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const subs: Array<{ unsubscribe: () => void }> = [];
    setCargando(true);

    (async () => {
      const db = await initVerticalRxDb();
      if (!vivo) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const hoy = { organization_id: orgId, _modified: { $gte: inicio } };
      const org = { organization_id: orgId, _deleted: { $ne: true } };
      const escuchar = (clave: keyof Colecciones, query: any) => {
        subs.push(query.$.subscribe((docs: any[]) => {
          if (!vivo) return;
          setDatos(prev => ({ ...prev, [clave]: docs.map((x: any) => x.toJSON()) }));
          setCargando(false);
          setActualizadoA(new Date());
        }));
      };
      // Lo tocado hoy (el índice _modified evita recorrer todo el historial).
      escuchar('comandas', db.comandas.find({ selector: { ...hoy, _deleted: { $ne: true } } }));
      escuchar('items', db.comanda_items.find({ selector: { ...hoy, _deleted: { $ne: true } } }));
      escuchar('pagos', db.pagos.find({ selector: { ...hoy, _deleted: { $ne: true } } }));
      escuchar('ventas', db.ventas.find({ selector: { ...hoy, _deleted: { $ne: true } } }));
      escuchar('habitaciones', db.habitacion_cuentas.find({ selector: { ...hoy, _deleted: { $ne: true } } }));
      // Catálogos pequeños para poner nombres.
      escuchar('mesas', db.mesas.find({ selector: org }));
      escuchar('usuarios', db.usuarios.find({ selector: org }));
    })().catch(() => { if (vivo) setCargando(false); });

    return () => { vivo = false; subs.forEach(s => s.unsubscribe()); };
  }, [activo, inicio, dbEpoch, tick]);

  // Pide a Supabase lo más reciente (movimientos de otros dispositivos) y vuelve a leer.
  // Lo que llegue después aparece solo: las consultas son en vivo.
  const refrescar = useCallback(async () => {
    setRefrescando(true);
    try {
      await forceSyncAll();
    } catch { /* sin red: se vuelve a leer lo local */ }
    setTick(t => t + 1);
    // Da un momento a que lleguen los datos nuevos y avisa al terminar.
    setTimeout(() => {
      setRefrescando(false);
      if (navigator.onLine) showToast.success('Datos actualizados');
      else showToast.info('Sin conexión', 'Se muestra lo guardado en este equipo.');
    }, 1200);
  }, []);

  const eventos = useMemo(() => (activo ? construirActividad({ ...datos, inicio }) : []), [activo, datos, inicio]);
  return { eventos, cargando, refrescar, refrescando, actualizadoA };
}
