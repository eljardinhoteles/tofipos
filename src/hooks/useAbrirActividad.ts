import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { initVerticalRxDb } from '../db/rxdb';
import { isOperativeComanda } from '../db/comandaState';
import { useUI } from '../context/UIContext';
import { useIsMobile } from './useIsMobile';
import { showToast } from '../lib/toast';
import type { ActividadDestino } from '../lib/actividadDia';

/**
 * Abre lo que muestra un evento de la actividad del día:
 * - comanda abierta → la mesa en el mapa (con su subcuenta);
 * - comanda cerrada o anulada → su detalle de solo lectura;
 * - habitación → su cuenta; venta suelta → Centro de Ventas.
 */
export function useAbrirActividad() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    setActividadOpen, setSelectedMesaId, setViewingComandaId, setActiveSubcomandaId,
    setCheckoutView, setConfigView, setReservaView, setSelectedReservaId,
    setSelectedMesaEsHabitacion, setMesaView,
  } = useUI();

  return useCallback(async (destino: ActividadDestino) => {
    const limpiarVistas = () => {
      setCheckoutView(false);
      setConfigView('none');
      setReservaView('none');
      setSelectedReservaId(null);
      setMesaView('mapa');
    };

    if (destino.tipo === 'venta') {
      if (isMobile) { showToast.info('Esta venta se ve en Centro de Ventas', 'Disponible en la versión de escritorio.'); return; }
      try { sessionStorage.setItem('pos_venta_a_abrir', destino.ventaId); } catch { /* sin storage */ }
      setActividadOpen(false);
      navigate('/v2/centro-ventas');
      return;
    }

    if (destino.tipo === 'habitacion') {
      limpiarVistas();
      setActividadOpen(false);
      setSelectedMesaEsHabitacion(true);
      setViewingComandaId(null);
      setSelectedMesaId(destino.mesaId);
      navigate('/v2/mesas');
      return;
    }

    try {
      const db = await initVerticalRxDb();
      const doc = await db.comandas.findOne(destino.comandaId).exec();
      const c: any = doc?.toJSON();
      if (!c || !c.mesa_id) { showToast.warning('No se pudo abrir', 'La comanda ya no está disponible en este equipo.'); return; }
      limpiarVistas();
      setActividadOpen(false);
      setSelectedMesaEsHabitacion(false);
      if (isOperativeComanda(c)) {
        setViewingComandaId(null);
        setActiveSubcomandaId(c.subcomanda_nombre ? c.id : null);
        setSelectedMesaId(c.mesa_id);
        navigate('/v2/mesas');
      } else {
        setSelectedMesaId(c.mesa_id);
        setViewingComandaId(c.id);
      }
    } catch (e) {
      showToast.error('No se pudo abrir', e instanceof Error ? e.message : undefined);
    }
  }, [navigate, isMobile, setActividadOpen, setSelectedMesaId, setViewingComandaId, setActiveSubcomandaId, setCheckoutView, setConfigView, setReservaView, setSelectedReservaId, setSelectedMesaEsHabitacion, setMesaView]);
}
