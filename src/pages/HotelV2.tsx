import { useCallback, useEffect, useState } from 'react';
import { Bed, CalendarBlank, ForkKnife, ListBullets, Plus, Pulse, type Icon } from '@phosphor-icons/react';
import { PageFrame, PageHeader, PageContent, HeaderTabs, HeaderTab, headerPrimaryButtonClass } from '../components/Common/PageHeader';
import { CalendarioCabanas } from '../components/Hotel/CalendarioCabanas';
import { PulsoSincronizacion, SincronizarHotel, type NivelHotel } from '../components/Hotel/SincronizarHotel';
import { SkeletonFilas } from '../components/Hotel/Espera';
import { EstadoIntegracion } from '../components/Hotel/EstadoIntegracion';
import { HabitacionesHotel } from '../components/Hotel/HabitacionesHotel';
import { PlanesAlimentacion } from '../components/Hotel/PlanesAlimentacion';
import { listarPlanes, type PlanAlimentacion } from '../lib/hotelPlanesApi';
import { ReservasHotelLista, type FiltroInicialReservas } from '../components/Hotel/ReservasHotelLista';
import { NuevoBloqueoDialog } from '../components/Hotel/NuevoBloqueoDialog';
import { ConciliarAdopcionDialog } from '../components/Hotel/ConciliarAdopcionDialog';
import { AdoptarGrupoDialog } from '../components/Hotel/AdoptarGrupoDialog';
import { ReservaDrawer, type PresetReserva } from '../components/Hotel/ReservaDrawer';
import { NuevaReservaDrawer } from '../components/Hotel/NuevaReservaDrawer';
import { cloudbedsConfigurado, eliminarBloqueoCloudbeds, getReservaCloudbeds, type ReservaCloudbedsDetalle, type TarjetaCalendario } from '../lib/cloudbeds';
import { listarHabitaciones, type HabitacionHotel } from '../lib/hotelHabitacionesApi';
import { listarReservasRecientes, validarAdopcion, type ReservaHotel } from '../lib/hotelReservasApi';
import { usePermisos } from '../hooks/usePermisos';
import { useCacheCalendario } from '../hooks/useMesesHotel';
import { hayFalloConsulta, ultimaConsulta } from '../lib/hotelCalendarioCache';
import { useEstadoIntegracion } from '../hooks/useEstadoIntegracion';
import { useReintentoAutomatico } from '../hooks/useReintentoAutomatico';
import { useHotelEnVivo } from '../hooks/useHotelEnVivo';
import { detectarDivergencias } from '../lib/hotelReconciliar';
import { detDeReserva } from '../lib/hotelConciliacion';
import { VentasHotelContext, useVentasHotel } from '../hooks/useVentasHotel';
import { CategoriasExtrasContext, useCategoriasPorProducto } from '../hooks/useCategoriasExtrasHotel';
import { showToast } from '@/lib/toast';

type Vista = 'reservas' | 'calendario' | 'habitaciones' | 'planes' | 'estado';

const VISTAS: { id: Vista; label: string; icono: Icon }[] = [
  { id: 'reservas', label: 'Reservas', icono: ListBullets },
  { id: 'calendario', label: 'Calendario', icono: CalendarBlank },
  { id: 'habitaciones', label: 'Habitaciones', icono: Bed },
  { id: 'planes', label: 'Planes', icono: ForkKnife },
  { id: 'estado', label: 'Estado', icono: Pulse },
];

/**
 * Página «Hotel»: disponibilidad y reservas sincronizadas con Cloudbeds. Es independiente del resto del sistema
 * (tabla propia `hotel_reservas`, sin ventas ni cierres); el cobro se sigue registrando en Ventas.
 */
export default function HotelV2() {
  const permisos = usePermisos();
  const [vista, setVista] = useState<Vista>('reservas');
  // Filtro con el que se abre la lista (desde «Estado» › Ver o tras crear); `n` la vuelve a montar para aplicarlo.
  const [filtroLista, setFiltroLista] = useState<{ filtro: FiltroInicialReservas; n: number } | null>(null);
  const [search, setSearch] = useState('');
  const [reservas, setReservas] = useState<ReservaHotel[]>([]);
  const [habitaciones, setHabitaciones] = useState<HabitacionHotel[]>([]);
  const [planes, setPlanes] = useState<PlanAlimentacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [version, setVersion] = useState(0);
  const [nueva, setNueva] = useState<{ abierta: boolean; preset: PresetReserva | null }>({ abierta: false, preset: null });
  const [detalle, setDetalle] = useState<ReservaHotel | null>(null);
  const [bloqueo, setBloqueo] = useState(false);
  const [presetBloqueo, setPresetBloqueo] = useState<{ desde: string; roomTypeID: string; roomID?: string; hasta?: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      setReservas(await listarReservasRecientes());
      setErrorCarga('');
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : 'No se pudieron cargar las reservas');
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarHabitaciones = useCallback(async () => {
    try { setHabitaciones(await listarHabitaciones()); } catch (e) { setErrorCarga(e instanceof Error ? e.message : 'No se pudo cargar el mapa de habitaciones'); }
  }, []);

  const cargarPlanes = useCallback(async () => {
    try { setPlanes(await listarPlanes()); } catch (e) { setErrorCarga(e instanceof Error ? e.message : 'No se pudieron cargar los planes de alimentación'); }
  }, []);
  useEffect(() => { void cargar(); void cargarHabitaciones(); void cargarPlanes(); }, [cargar, cargarHabitaciones, cargarPlanes]);

  // Repintar cuando llegan tarjetas nuevas: de ellas sale la comparación con Cloudbeds.
  useCacheCalendario();
  const estado = useEstadoIntegracion();

  const recargarTodo = useCallback((afectaCalendario = true) => { if (afectaCalendario) setVersion((v) => v + 1); void cargar(); }, [cargar]);

  // Las que quedaron sin subir se reintentan solas (el calendario de Cloudbeds sigue libre mientras tanto).
  useReintentoAutomatico(reservas, useCallback(() => recargarTodo(true), [recargarTodo]));
  // Lo que cambian otros equipos y lo que el servidor aplica solo desde Cloudbeds llega al momento.
  useHotelEnVivo(useCallback(() => recargarTodo(true), [recargarTodo]));

  // Reservas del POS que ya no coinciden con Cloudbeds (se compara con lo que el calendario ya cargó; sin consultas nuevas).
  const divergencias = detectarDivergencias(reservas, version);

  // Enlaza una reserva que ya existía en Cloudbeds para gestionarla desde el POS (no cambia nada en Cloudbeds). Primero se
  // trae su detalle; luego el asistente la concilia, a mano, con su venta del Centro de Ventas y la ficha del cliente.
  const [conciliar, setConciliar] = useState<{ det: ReservaCloudbedsDetalle; reserva?: ReservaHotel } | null>(null);
  const [adoptarGrupo, setAdoptarGrupo] = useState<ReservaCloudbedsDetalle | null>(null);
  const adoptar = useCallback(async (t: TarjetaCalendario) => {
    try {
      const det = await getReservaCloudbeds(t.id);
      // Varias habitaciones en una sola reserva de Cloudbeds: se adopta como grupo (una reserva del POS por habitación).
      if (det.habitaciones.length > 1 && det.estado !== 'canceled' && det.estado !== 'no_show') {
        if (reservas.some((r) => r.cloudbeds_grupo_ref === det.reservationID)) throw new Error('Este grupo ya está adoptado en el POS.');
        setAdoptarGrupo(det);
        return;
      }
      validarAdopcion(det);
      if (reservas.some((r) => r.cloudbeds_reservation_id === det.reservationID)) throw new Error('Esta reserva ya está enlazada en el POS.');
      setConciliar({ det });
    } catch (e) {
      showToast.fallo('enlazar la reserva', e);
      throw e;
    }
  }, [reservas]);

  const eliminarBloqueo = useCallback(async (t: TarjetaCalendario) => {
    try {
      await eliminarBloqueoCloudbeds(t.id);
      showToast.success('Bloqueo eliminado', 'Las fechas quedaron disponibles.');
      recargarTodo(true);
    } catch (e) {
      showToast.fallo('eliminar el bloqueo', e);
      throw e;
    }
  }, [recargarTodo]);

  const irA = useCallback((destino: 'pendientes' | 'revisar' | 'habitaciones') => {
    if (destino === 'habitaciones') { setVista('habitaciones'); return; }
    setFiltroLista({ filtro: destino === 'pendientes' ? { estados: ['pendiente'] } : { porRevisar: true }, n: Date.now() });
    setVista('reservas');
  }, []);

  // Ventas conciliadas (Centro de Ventas): de ahí sale el estado de pago real de cada reserva.
  const ventasHotel = useVentasHotel(reservas.map((r) => r.venta_id));

  const categoriasExtras = useCategoriasPorProducto();

  // Color del resplandor del header: rojo si no hay conexión con Cloudbeds; naranja si hay algo que revisar (reservas sin
  // subir, cambios hechos en Cloudbeds, habitaciones sin enlazar). Son los mismos avisos de la sección «Estado».
  const sinEnlazarHab = habitaciones.filter((h) => h.activo && !h.cloudbeds_room_type_id).length;
  const reservasPendientes = reservas.filter((r) => r.estado === 'confirmada' && r.sync_estado === 'pendiente').length;
  // La comprobación de salud es una sola consulta y a veces se cuelga aunque Cloudbeds esté sirviendo: si el calendario cargó bien hace
  // poco, un fallo de esa comprobación es «lento» (naranja), no «no responde» (rojo). Si el Worker mismo no responde, siempre es rojo.
  const ultimaOk = ultimaConsulta();
  const consultaReciente = ultimaOk !== null && Date.now() - ultimaOk < 10 * 60_000 && !hayFalloConsulta();
  const saludMal = estado.salud?.cloudbeds.ok === false;
  const nivelHotel: NivelHotel = estado.error || (saludMal && !consultaReciente) ? 'error'
    : saludMal || reservasPendientes > 0 || divergencias.size > 0 || sinEnlazarHab > 0 ? 'aviso' : 'ok';

  return (
    <VentasHotelContext.Provider value={ventasHotel}>
    <CategoriasExtrasContext.Provider value={categoriasExtras}>
    <PageFrame>
      <PageHeader
        title="Hotel"
        subtitle={!cloudbedsConfigurado ? 'Cloudbeds no está configurado'
          : estado.error ? 'Sin conexión con Cloudbeds'
          : !estado.salud ? 'Comprobando Cloudbeds…'
          : estado.salud.cloudbeds.ok ? 'Conectado con Cloudbeds' : consultaReciente ? 'Cloudbeds responde lento' : 'Cloudbeds no responde'}
        // Estado de la última consulta a Cloudbeds y botón de actualizar: visibles en todas las secciones.
        actions={(
          <>
            <SincronizarHotel version={version} onRecargar={() => Promise.all([cargar(), estado.comprobar()])} />
            {permisos.gestionarHotel && (
              <button type="button" title="Nueva reserva" aria-label="Nueva reserva" onClick={() => setNueva({ abierta: true, preset: null })} className={headerPrimaryButtonClass}>
                <Plus size={18} weight="bold" /><span className="hidden 2xl:inline">Nueva reserva</span>
              </button>
            )}
          </>
        )}
        // Las secciones van en el header, centradas bajo el buscador: así no se confunden con los filtros de la lista.
        tabs={(
          <HeaderTabs label="Secciones del hotel">
            {VISTAS.map((v) => <HeaderTab key={v.id} activa={vista === v.id} icono={v.icono} onClick={() => setVista(v.id)}>{v.label}</HeaderTab>)}
          </HeaderTabs>
        )}
        // Línea verde que sale del borde inferior del header mientras se consulta Cloudbeds.
        pulso={<PulsoSincronizacion nivel={nivelHotel} />}
      />
      <PageContent>
        <div className={`flex-1 min-h-0 ${vista === 'calendario' || vista === 'reservas' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
          {errorCarga && <p className="t-meta text-destructive rounded-2xl bg-destructive-soft mx-6 mt-2 px-3 py-2">{errorCarga}</p>}
          {vista === 'calendario' ? (
            <CalendarioCabanas
              habitaciones={habitaciones} reservas={reservas} puedeGestionar={permisos.gestionarHotel} version={version}
              onNueva={(llegada, roomTypeID, salida, roomID) => setNueva({ abierta: true, preset: { llegada, roomTypeID, roomID, salida } })}
              onBloquear={(desde, roomTypeID, hasta, roomID) => { setPresetBloqueo({ desde, roomTypeID, roomID, hasta }); setBloqueo(true); }}
              onAbrir={setDetalle} onAdoptar={adoptar} onEliminarBloqueo={eliminarBloqueo} onMovida={() => recargarTodo(true)}
            />
          ) : vista === 'estado' ? (
            <EstadoIntegracion
              puedeConfigurar={permisos.esAdmin}
              salud={estado.salud} ahora={estado.ahora} error={estado.error} comprobando={estado.comprobando} onComprobar={() => void estado.comprobar()}
              pendientes={reservasPendientes}
              divergentes={divergencias.size} sinEnlazar={habitaciones.filter((h) => h.activo && !h.cloudbeds_room_type_id).length}
              onIrA={irA}
            />
          ) : vista === 'planes' ? (
            <PlanesAlimentacion planes={planes} puedeEditar={permisos.esAdmin} onCambio={() => void cargarPlanes()} />
          ) : vista === 'habitaciones' ? (
            <HabitacionesHotel habitaciones={habitaciones} reservas={reservas} puedeEditar={permisos.esAdmin} onCambio={() => void cargarHabitaciones()} />
          ) : cargando ? (
            <div className="p-6"><SkeletonFilas n={6} alto="h-16" /></div>
          ) : (
            <ReservasHotelLista
              key={filtroLista?.n ?? 0} inicial={filtroLista?.filtro}
              reservas={reservas} habitaciones={habitaciones} onAbrir={setDetalle} divergencias={divergencias}
              busqueda={search} onBusqueda={setSearch}
              version={version} puedeGestionar={permisos.gestionarHotel} onAdoptar={adoptar} onEliminarBloqueo={eliminarBloqueo}
              onCambio={() => recargarTodo()}
            />
          )}
        </div>
      </PageContent>

      {nueva.abierta && (
        <NuevaReservaDrawer
          preset={nueva.preset}
          habitaciones={habitaciones}
          version={version}
          onClose={() => setNueva({ abierta: false, preset: null })}
          onCreada={(rs) => {
            recargarTodo(true);
            if (rs.some((r) => r.sync_estado === 'pendiente')) irA('pendientes');
            else if (rs.some((r) => r.sync_estado === 'error')) showToast.info('Las reservas rechazadas quedan en «Canceladas»');
          }}
        />
      )}
      {conciliar && (
        <ConciliarAdopcionDialog
          det={conciliar.det} reserva={conciliar.reserva} habitaciones={habitaciones} reservas={reservas}
          onClose={() => setConciliar(null)}
          onHecha={(r) => { setConciliar(null); recargarTodo(false); setDetalle(r); }}
        />
      )}
      {adoptarGrupo && (
        <AdoptarGrupoDialog
          det={adoptarGrupo} habitaciones={habitaciones}
          onClose={() => setAdoptarGrupo(null)}
          onHecha={(rs) => { setAdoptarGrupo(null); recargarTodo(true); setDetalle(rs[0]); }}
        />
      )}
      <NuevoBloqueoDialog open={bloqueo} preset={presetBloqueo} habitaciones={habitaciones} onClose={() => setBloqueo(false)} onCreado={() => recargarTodo(true)} />
      <ReservaDrawer
        open={!!detalle}
        reserva={detalle}
        divergencia={detalle ? divergencias.get(detalle.id) : undefined}
        habitaciones={habitaciones}
        reservas={reservas}
        onAbrirHermana={setDetalle}
        puedeGestionar={permisos.gestionarHotel}
        onClose={() => setDetalle(null)}
        onCambio={recargarTodo}
        onConciliar={(r) => { setDetalle(null); setConciliar({ det: detDeReserva(r), reserva: r }); }}
      />
    </PageFrame>
    </CategoriasExtrasContext.Provider>
    </VentasHotelContext.Provider>
  );
}
