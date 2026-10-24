import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import {
  ArrowLeft, ArrowsLeftRight, Bed, CalendarBlank, Copy, Gift, Hash, Plus, Printer, PencilSimple, Prohibit, User, UserCircle, UsersThree, WarningCircle, X,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/toast';
import { EstadoBadge } from '../Common/EstadoBadge';
import { BannerEspera, Girando } from './Espera';
import { useUI } from '../../context/UIContext';
import { useUsuarioActual } from '../../hooks/useUsuarioActual';
import { useVentasHotel } from '../../hooks/useVentasHotel';
import { habitacionDeUnidad, type HabitacionHotel } from '../../lib/hotelHabitacionesApi';
import {
  ajustarVentaHotel,
  desenlazarVentaHotel,
  aplicarDivergenciaHotel,
  cancelarGrupoReservasHotel,
  cancelarReservaHotel,
  leerHistorialHotel,
  leerReservaHotel,
  nombreHuesped,
  quitarExtraHotel,
  reintentarSincronizacion,
  revisarAvisoCloudbedsHotel,
  totalConExtras,
  type ReservaHotel,
  textoMascota,
} from '../../lib/hotelReservasApi';
import type { Divergencia } from '../../lib/hotelReconciliar';
import { estiloDe, pagoDeVenta } from './estiloReserva';
import { atribucionDePago, facturasDePago, leerVentaHotel } from '../../lib/hotelCobros';
import { useRxClientes } from '../../hooks/useRxClientes';
import { documentoCliente } from '../../lib/documentoCliente';
import { getOrgCache } from '../../lib/orgCache';
import { SeccionMascota } from './detalle/SeccionMascota';
import { imprimirReservaA4 } from '../../lib/imprimirReservaA4';
import type { RxCliente } from '../../db/rxdb';
import { EditorCliente } from './detalle/EditorCliente';
import { EditorCabana } from './detalle/EditorCabana';
import { EditorEstadia } from './detalle/EditorEstadia';
import { EditorExtras } from './detalle/EditorExtras';
import { SeccionCobros } from './detalle/SeccionCobros';
import { SeccionCuenta, type EditorCuenta } from './detalle/SeccionCuenta';
import { FichaCliente } from './detalle/FichaCliente';
import { SeccionNotas } from './detalle/NotasReserva';
import { SeccionPlan } from './detalle/SeccionPlan';
import { usePlanesAlimentacion } from '../../hooks/usePlanesAlimentacion';
import { incluyePorPersona, planSeCobra } from '../../lib/hotelPlanesApi';
import { GrupoResumen } from './detalle/GrupoResumen';
import { SelectorCama } from './detalle/SelectorCama';
import { VistaGrupo } from './detalle/VistaGrupo';
import { SeparadorGrupo } from './detalle/SeparadorGrupo';
import { SeccionHistorial } from './detalle/SeccionHistorial';
import { Dato, Seccion } from './detalle/comunes';
import { EPS, dinero, fechaLarga, plural, totalesGrupo } from './detalle/formatos';

export interface PresetReserva {
  llegada?: string;
  salida?: string;
  roomTypeID?: string;
  /** Unidad elegida (tipos con varias unidades). */
  roomID?: string;
}

interface ReservaDrawerProps {
  open: boolean;
  reserva?: ReservaHotel | null;
  divergencia?: Divergencia;
  reservas?: ReservaHotel[];
  onAbrirHermana?: (r: ReservaHotel) => void;
  puedeGestionar?: boolean;
  onCambio?: (afectaCalendario: boolean) => void;
  /** Abre la conciliación con el Centro de Ventas y la ficha del cliente (reservas sin venta enlazada). */
  onConciliar?: (r: ReservaHotel) => void;
  habitaciones: HabitacionHotel[];
  initialTab?: Pestana;
  onClose: () => void;
}

type Pestana = 'reserva' | 'grupo' | 'cliente' | 'cuenta' | 'historial';
type Editor = null | 'estadia' | 'cabana' | 'huespedes' | 'cliente' | 'abono' | EditorCuenta;

function FilaHeader({ icono: Icono, children }: { icono: typeof Bed; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 list-none">
      <Icono size={18} className="text-primary shrink-0" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function SyncBadge({ r }: { r: Pick<ReservaHotel, 'sync_estado' | 'estado'> }) {
  if (r.estado === 'cancelada') return <EstadoBadge tono="neutral">Cancelada</EstadoBadge>;
  if (r.sync_estado === 'sincronizada') return <EstadoBadge tono="success">En Cloudbeds</EstadoBadge>;
  if (r.sync_estado === 'pendiente') return <EstadoBadge tono="warning">Pendiente de sincronizar</EstadoBadge>;
  return <EstadoBadge tono="destructive">Rechazada</EstadoBadge>;
}

/**
 * Detalle y edición de una reserva. Se lee primero; cada sección (estadía, cliente, tarifa y extras, cobros) tiene su
 * propio «Editar» y se guarda por separado. Los cobros se registran en el Centro de Ventas, que sigue siendo la fuente de todo.
 */
export function ReservaDrawer({ open, reserva, divergencia, reservas = [], onAbrirHermana, puedeGestionar = true, onCambio, onConciliar, habitaciones, initialTab = 'reserva', onClose }: ReservaDrawerProps) {
  const { openConfirm } = useUI();
  const { clientes } = useRxClientes() as { clientes: RxCliente[] };
  const { planes } = usePlanesAlimentacion();
  // Usuario que opera (el local o, si no hay, el administrador): firma pagos y movimientos en el Centro de Ventas.
  const currentMesero = useUsuarioActual();
  const usuarioNombre = currentMesero?.nombre;

  const [actual, setActual] = useState<ReservaHotel | null>(reserva ?? null);
  const [editor, setEditor] = useState<Editor>(null);
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [enProceso, setEnProceso] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>(initialTab);
  const cobrosRef = useRef<HTMLDivElement>(null);

  // Al saltar de una habitación a otra del mismo grupo (el padre cambia `reserva`) se conserva la pestaña: solo se reinicia al abrir
  // el panel o al pasar a una reserva distinta de otro grupo (recargar la misma reserva tampoco la reinicia).
  const grupoAbierto = useRef<{ abierto: boolean; grupo: string | null; id: string | null }>({ abierto: false, grupo: null, id: null });
  useEffect(() => {
    if (!open) { grupoAbierto.current = { abierto: false, grupo: null, id: null }; return; }
    const previo = grupoAbierto.current;
    const mismoGrupo = previo.abierto && ((!!reserva?.grupo_id && previo.grupo === reserva.grupo_id) || (!!reserva && previo.id === reserva.id));
    setActual(reserva ?? null);
    setEditor(null);
    setSucio(false);
    // Una reserva de grupo se abre por su pestaña «Grupo» (salvo que quien la abre pida otra, p. ej. «Cuenta»).
    const hayHermanas = !!reserva?.grupo_id && reservas.some((x) => x.grupo_id === reserva.grupo_id && x.id !== reserva.id && x.estado === 'confirmada');
    if (!mismoGrupo) setPestana(initialTab === 'reserva' && hayHermanas ? 'grupo' : initialTab);
    grupoAbierto.current = { abierto: true, grupo: reserva?.grupo_id ?? null, id: reserva?.id ?? null };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reservas` cambia a menudo y no debe reiniciar el panel
  }, [open, reserva, initialTab]);

  // La lista de la página no trae el historial (es lo más pesado): se pide aparte al abrir la reserva.
  const [historialDe, setHistorialDe] = useState<string | null>(null);
  useEffect(() => {
    const id = open ? reserva?.id : undefined;
    if (!id) return;
    let vivo = true;
    leerHistorialHotel(id)
      .then((historial) => {
        if (!vivo) return;
        setActual((a) => (a && a.id === id ? { ...a, historial } : a));
        setHistorialDe(id);
      })
      .catch((err) => console.warn('[ReservaDrawer] No se pudo cargar el historial:', err));
    return () => { vivo = false; };
  }, [open, reserva]);

  const r = actual;
  const hermanas = r?.grupo_id ? reservas.filter((x) => x.grupo_id === r.grupo_id && x.id !== r.id) : [];
  const vigentesDelGrupo = r ? [r, ...hermanas].filter((x) => x.estado === 'confirmada').sort((a, b) => a.cabana.localeCompare(b.cabana, 'es', { numeric: true }) || a.id.localeCompare(b.id)) : [];
  const ventas = useVentasHotel([r?.venta_id, ...hermanas.map((h) => h.venta_id)]);
  const venta = r?.venta_id ? ventas.get(r.venta_id) : undefined;
  // Una venta enlazada que no aparece en el Centro de Ventas (se eliminó, o no está en este dispositivo) dejaría los cobros
  // «cargando» para siempre: pasado un momento se comprueba directo y, si no existe, se avisa y se ofrece desenlazarla.
  const [ventaPerdida, setVentaPerdida] = useState<string | null>(null);
  const ventaIdPendiente = r?.venta_id && !venta ? r.venta_id : null;
  useEffect(() => {
    if (!ventaIdPendiente) return;
    let vigente = true;
    const t = setTimeout(() => { void leerVentaHotel(ventaIdPendiente).then((v) => { if (vigente && !v) setVentaPerdida(ventaIdPendiente); }).catch(() => {}); }, 1500);
    return () => { vigente = false; clearTimeout(t); };
  }, [ventaIdPendiente]);
  const sinVenta = !!r?.venta_id && !venta && ventaPerdida === r.venta_id;
  const pago = pagoDeVenta(venta);
  const estiloHeader = r ? estiloDe({ tipo: 'reserva', id: r.cloudbeds_reservation_id ?? r.id, roomTypeID: r.room_type_id, nombre: nombreHuesped(r), desde: r.llegada, hasta: r.salida, fuente: r.fuente_nombre, local: r }) : null;
  const vigente = r?.estado === 'confirmada';
  const puedeEditar = puedeGestionar && vigente;
  const enGrupo = vigentesDelGrupo.length > 1;
  useEffect(() => { if (pestana === 'grupo' && !enGrupo) setPestana('reserva'); }, [pestana, enGrupo]);
  const totGrupo = totalesGrupo(vigentesDelGrupo.map((x) => ({ total: totalConExtras(x), ventaId: x.venta_id, venta: x.venta_id ? ventas.get(x.venta_id) : undefined })));
  // Pagada por completo: según la venta (en grupo, la suma de sus habitaciones contra el total del POS).
  const pagadaPorCompleto = enGrupo ? totGrupo.total > EPS && totGrupo.saldo <= EPS : !!venta && !venta.anulado && venta.montoTotal > EPS && venta.saldo <= EPS;
  const cifrasCobro = enGrupo ? totGrupo : venta && !venta.anulado ? { pagado: venta.totalPagado, saldo: venta.saldo } : null;
  const textoSinCobros = !r?.venta_id ? 'Sin cobros registrados' : venta?.anulado ? 'Venta anulada' : sinVenta ? 'Venta no encontrada' : 'Cargando cobros…';
  const noches = r ? dayjs(r.salida).diff(dayjs(r.llegada), 'day') : 0;
  const totalPos = r ? totalConExtras(r) : 0;
  const cabana = r ? habitacionDeUnidad(habitaciones, r.room_type_id, r.room_id)?.nombre ?? r.cabana : '';
  const vistaHab = r ? habitacionDeUnidad(habitaciones, r.room_type_id, r.room_id)?.vista ?? null : null;

  /** Trae la reserva como está ahora en la base, y avisa a la página para que refresque lo que corresponda. */
  const refrescar = useCallback(async (afectaCalendario: boolean, nueva?: ReservaHotel) => {
    if (nueva) setActual(nueva);
    try {
      const fresca = await leerReservaHotel((nueva ?? r)!.id);
      if (fresca) setActual(fresca);
    } catch (err) {
      console.warn('[ReservaDrawer] No se pudo recargar la reserva:', err);
    }
    onCambio?.(afectaCalendario);
  }, [r, onCambio]);

  // ---------- cerrar y cambiar de editor sin perder cambios ----------
  const intentarCerrar = () => {
    if (ocupado) return;
    if (sucio) openConfirm('¿Descartar los cambios?', 'Tienes cambios sin guardar en esta reserva. Si cierras, se pierden.', () => { setSucio(false); onClose(); });
    else onClose();
  };
  const abrirEditor = (e: Editor) => {
    if (e === editor) return;
    if (sucio) { openConfirm('¿Descartar los cambios?', 'Tienes cambios sin guardar. Si abres otra sección, se pierden.', () => { setSucio(false); setEditor(e); }); return; }
    setEditor(e);
  };
  const cerrarEditor = () => { setSucio(false); setEditor(null); };
  const cerrarEditorConfirmando = () => {
    if (sucio) openConfirm('¿Descartar los cambios?', 'Hay extras elegidos sin añadir. Si vuelves, se pierden.', cerrarEditor);
    else cerrarEditor();
  };

  const correr = async (texto: string, fn: () => Promise<void>) => {
    setOcupado(true);
    setEnProceso(texto);
    try { await fn(); } catch (e) { showToast.fallo(texto.replace(/…$/, '').toLowerCase(), e); } finally { setOcupado(false); setEnProceso(null); }
  };

  const reintentarSync = () => {
    if (!r) return;
    void correr('Subiendo la reserva a Cloudbeds…', async () => {
      const res = await reintentarSincronizacion(r);
      if (res.sync === 'sincronizada') { showToast.success('Reserva sincronizada con Cloudbeds'); await refrescar(true); }
      else if (res.sync === 'pendiente') showToast.warning('Sigue pendiente', res.mensaje);
      else { showToast.error('Cloudbeds rechazó la reserva', res.mensaje); onCambio?.(true); onClose(); }
    });
  };

  const aceptarDivergencia = () => {
    if (!r || !divergencia) return;
    void correr('Actualizando el POS con lo de Cloudbeds…', async () => {
      const cab = divergencia.room_type_id ? habitacionDeUnidad(habitaciones, divergencia.room_type_id, divergencia.room_id)?.nombre : undefined;
      const res = await aplicarDivergenciaHotel(r, { ...divergencia, cabana: cab });
      if (divergencia.tipo === 'cancelada') { showToast.success('Reserva marcada como cancelada'); onCambio?.(true); onClose(); return; }
      const cambioTarifa = res.tarifaNueva !== null && res.tarifaAnterior !== null && Math.abs(res.tarifaNueva - res.tarifaAnterior) > EPS;
      showToast.success('Reserva actualizada con lo de Cloudbeds',
        !cambioTarifa ? undefined
          : res.tarifaManualConservada ? `Cloudbeds cambió su tarifa a ${dinero(res.tarifaNueva!)}; el POS conserva su tarifa manual.`
          : `La tarifa pasó de ${dinero(res.tarifaAnterior!)} a ${dinero(res.tarifaNueva!)}.`);
      await refrescar(true);
      const dif = res.ajusteSugerido;
      if (dif !== null) {
        openConfirm('Ajustar la venta',
          `La venta del Centro de Ventas no cuadra con el nuevo total de la reserva. ¿Agregar un ajuste de ${dif > 0 ? '+' : '−'}${dinero(Math.abs(dif))} a la venta? Si prefieres, déjala como está y revísala en Ventas.`,
          () => { void ajustarVentaHotel(r, dif, `Cambio de fechas desde Cloudbeds (${divergencia.resumen})`).then(() => showToast.success('Ajuste agregado a la venta')).catch((e) => showToast.fallo('ajustar la venta', e)); });
      }
    });
  };

  // El servidor ya aplicó un cambio de Cloudbeds: queda lo que no toca solo (la venta y el plan).
  const revisarAviso = () => {
    if (!r?.aviso_cloudbeds) return;
    const aviso = r.aviso_cloudbeds;
    void correr('Revisando la venta…', async () => {
      const { ajusteSugerido: dif } = await revisarAvisoCloudbedsHotel(r);
      showToast.success(aviso.tipo === 'cancelada' ? (r.venta_id ? 'Comentario agregado a la venta' : 'Aviso revisado') : 'Venta y plan al día con Cloudbeds');
      await refrescar(false);
      if (dif !== null) {
        openConfirm('Ajustar la venta',
          `La venta del Centro de Ventas no cuadra con el nuevo total de la reserva. ¿Agregar un ajuste de ${dif > 0 ? '+' : '−'}${dinero(Math.abs(dif))} a la venta? Si prefieres, déjala como está y revísala en Ventas.`,
          () => { void ajustarVentaHotel(r, dif, `Cambio desde Cloudbeds (${aviso.texto})`).then(() => showToast.success('Ajuste agregado a la venta')).catch((e) => showToast.fallo('ajustar la venta', e)); });
      }
    });
  };

  const quitarExtra = (extraId: string) => {
    if (!r) return;
    const e = r.extras.find((x) => x.id === extraId);
    if (!e) return;
    const texto = e.origen === 'cloudbeds'
      ? `Se quita «${e.descripcion}» (${dinero(e.monto)}) del POS, no de Cloudbeds. Después añade los productos reales como extras; la conciliación no volverá a traer este importe mientras Cloudbeds lo mantenga igual. El total del POS baja ${dinero(e.monto)} hasta que añadas los productos.`
      : `Se quita «${e.descripcion}» (${dinero(e.monto)}) de la reserva en el POS. La nota que ya se anotó en Cloudbeds no se puede borrar desde aquí.`;
    openConfirm('Quitar extra', texto, () => {
      void correr('Quitando el extra…', async () => {
        await refrescar(false, await quitarExtraHotel(r, extraId, usuarioNombre));
        showToast.success('Extra quitado');
      });
    });
  };

  const cancelar = () => {
    if (!r) return;
    const cobros = venta && !venta.anulado && venta.totalPagado > EPS ? ` Tiene cobros por ${dinero(venta.totalPagado)} en el Centro de Ventas: no se reembolsan solos; se deja un comentario en la venta para que revises si corresponde.` : '';
    openConfirm('Cancelar reserva',
      `Se cancelará la reserva de ${nombreHuesped(r)}${r.cloudbeds_reservation_id ? ' también en Cloudbeds' : r.cloudbeds_grupo_ref ? ' solo en el POS (esta habitación viene de una reserva de Cloudbeds con varias habitaciones: quítala o cancélala allá a mano)' : ''} y se liberan sus fechas.${cobros} Esta acción no se puede deshacer.`,
      () => { void correr('Cancelando la reserva…', async () => { await cancelarReservaHotel(r); showToast.success('Reserva cancelada'); onCambio?.(true); onClose(); }); });
  };

  const cancelarGrupo = () => {
    if (!r) return;
    openConfirm('Cancelar todo el grupo',
      `Se cancelarán las ${vigentesDelGrupo.length} reservas vigentes del grupo de ${nombreHuesped(r)}${r.cloudbeds_grupo_ref ? `, solo en el POS: cancela también la reserva ${r.cloudbeds_grupo_ref} en Cloudbeds` : ', también en Cloudbeds'}, y se liberan sus fechas. Esta acción no se puede deshacer.`,
      () => { void correr('Cancelando el grupo…', async () => {
        const fallos = await cancelarGrupoReservasHotel(vigentesDelGrupo);
        if (fallos > 0) showToast.warning('Algunas reservas no se pudieron cancelar', `${fallos} sigue${fallos === 1 ? '' : 'n'} vigente${fallos === 1 ? '' : 's'}. Revisa e inténtalo de nuevo.`);
        else showToast.success('Grupo cancelado');
        onCambio?.(true);
        onClose();
      }); });
  };

  /** La venta enlazada ya no existe: se desenlaza (a toda la reserva o a su grupo) y el primer pago crea una nueva. */
  const desenlazarVenta = () => {
    if (!r) return;
    void correr('Desenlazando la venta…', async () => {
      const afectadas = (r.grupo_id ? vigentesDelGrupo : [r]).filter((x) => x.venta_id === r.venta_id);
      for (const x of afectadas) await desenlazarVentaHotel(x.id);
      setVentaPerdida(null);
      await refrescar(false, { ...r, venta_id: null });
      showToast.success('Venta desenlazada', 'El próximo pago creará una venta nueva.');
    });
  };

  /** Documento A4 de la reserva (de todo el grupo si es de varias habitaciones), con sus cobros del Centro de Ventas. */
  const imprimir = (sinImportes = false) => {
    if (!r) return;
    const filas = enGrupo ? vigentesDelGrupo : [r];
    const cliente = r.cliente_id ? clientes.find((c) => c.id === r.cliente_id) : undefined;
    const idsVenta = [...new Set(filas.map((f) => f.venta_id).filter((x): x is string => !!x))];
    const ventasDoc = idsVenta.map((id) => ventas.get(id)).filter((v): v is NonNullable<typeof v> => !!v && !v.anulado);
    const pagos = ventasDoc.flatMap((v) => v.movimientos
      .filter((m) => (m.tipo === 'pago' || m.tipo === 'reembolso') && !m.anulado)
      .map((m) => {
        const at = enGrupo ? atribucionDePago(m.motivo) : null;
        const para = !at ? '' : at.destino === 'grupo' ? ' · todo el grupo' : ` · ${filas.find((f) => f.id === at.destino)?.cabana ?? at.texto}`;
        return {
          fecha: new Date(m.fecha).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }),
          texto: `${m.tipo === 'reembolso' ? 'Reembolso' : 'Pago'} · ${m.metodo_pago ?? ''}${m.transferencia_banco ? ` · ${m.transferencia_banco}` : ''}${m.tarjeta_red ? ` · ${m.tarjeta_red}` : ''}${para}${m.tipo === 'pago' ? (facturasDePago(v.movimientos, m.id).length > 0 ? ` · Factura ${facturasDePago(v.movimientos, m.id).join(', ')}` : ' · Sin facturar') : ''}`,
          monto: m.monto ?? 0,
          reembolso: m.tipo === 'reembolso',
          orden: m.fecha,
        };
      }))
      .sort((a, b) => a.orden.localeCompare(b.orden))
      .map((p) => ({ fecha: p.fecha, texto: p.texto, monto: p.monto, reembolso: p.reembolso }));
    const total = filas.reduce((a, f) => a + totalConExtras(f), 0);
    imprimirReservaA4({
      org: { nombre: getOrgCache().nombre ?? '', ruc: getOrgCache().ruc ?? '', telefono: getOrgCache().telefono ?? '', direccion: getOrgCache().direccion ?? '' },
      codigo: r.cloudbeds_reservation_id,
      canal: r.fuente_nombre,
      cancelada: r.estado === 'cancelada',
      huesped: { nombre: nombreHuesped(r), documento: cliente ? documentoCliente(cliente) : null, email: r.huesped_email, telefono: r.huesped_telefono ?? '', pais: r.huesped_pais },
      llegada: fechaLarga(r.llegada), salida: fechaLarga(r.salida), noches,
      cabanas: filas.map((f) => ({ nombre: habitacionDeUnidad(habitaciones, f.room_type_id, f.room_id)?.nombre ?? f.cabana, cama: f.cama, adultos: f.adultos, ninos: f.ninos, tarifa: f.total_estadia, manual: f.tarifa_manual, vista: habitacionDeUnidad(habitaciones, f.room_type_id, f.room_id)?.vista ?? null })),
      extras: filas.flatMap((f) => f.extras.filter((e) => sinImportes || e.monto > 0).map((e) => ({ descripcion: filas.length > 1 ? `${e.descripcion} (${f.cabana})` : e.descripcion, monto: e.monto, notas: f.notas_items.filter((n) => n.extra_id === e.id).map((n) => n.texto) }))),
      sinImportes,
      mascotas: filas.filter((f) => f.mascota).map((f) => (filas.length > 1 ? `${textoMascota(f.mascota!)} (${f.cabana})` : textoMascota(f.mascota!))),
      total,
      cobros: !sinImportes && ventasDoc.length > 0 ? { pagado: totGrupo.pagado, saldo: totGrupo.saldo, pagos } : null,
      notas: r.notas,
      plan: r.plan_alimentacion ? { nombre: r.plan_alimentacion.nombre, adultos: filas.reduce((a, f) => a + f.adultos, 0), ninos: filas.reduce((a, f) => a + f.ninos, 0), incluyeAdulto: incluyePorPersona(r.plan_alimentacion).adulto, incluyeNino: incluyePorPersona(r.plan_alimentacion).nino, incluido: !planSeCobra(r.plan_alimentacion) } : null,
      // Las notas de todo el grupo salen una vez y sin nombre de habitación; las demás, con la habitación si el grupo tiene varias.
      notasGenerales: [
        ...[...new Set(filas.flatMap((f) => f.notas_items.filter((n) => n.grupo && !n.extra_id).map((n) => n.texto)))],
        ...filas.flatMap((f) => f.notas_items.filter((n) => !n.grupo && (!n.extra_id || !f.extras.some((e) => e.id === n.extra_id))).map((n) => (filas.length > 1 ? `${n.texto} (${f.cabana})` : n.texto))),
      ],
    });
  };

  const copiarCodigo = (codigo: string) => { void navigator.clipboard.writeText(codigo); showToast.success('Código copiado al portapapeles'); };

  const elegirCabana = (h: ReservaHotel) => {
    if (h.id === r?.id) return;
    if (sucio) { openConfirm('¿Descartar los cambios?', 'Tienes cambios sin guardar. Si cambias de habitación, se pierden.', () => { setSucio(false); setEditor(null); onAbrirHermana?.(h); }); return; }
    setEditor(null);
    onAbrirHermana?.(h);
  };

  const cambiarPestana = (p: Pestana) => {
    if (p === pestana) return;
    if (sucio) { openConfirm('¿Descartar los cambios?', 'Tienes cambios sin guardar. Si cambias de pestaña, se pierden.', () => { setSucio(false); setEditor(null); setPestana(p); }); return; }
    setEditor(null);
    setPestana(p);
  };

  const abrirAbono = () => {
    if (pestana !== 'cuenta') {
      if (sucio) { cambiarPestana('cuenta'); return; }
      setPestana('cuenta');
    }
    setEditor('abono');
    setTimeout(() => cobrosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const editorCuenta: EditorCuenta = editor === 'tarifa' || editor === 'extras' || editor === 'cloudbeds' ? editor : null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) intentarCerrar(); }}>
      <SheetContent side="right" showCloseButton={false}
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl p-0 flex flex-col gap-0 data-[side=right]:border-l-0 bg-background shadow-2xl">
        <SheetHeader className="px-5 pt-4 pb-0 border-b border-border bg-card flex flex-col gap-3.5 text-left select-text">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {r && estiloHeader && (
                <span title={r.fuente_nombre ?? estiloHeader.etiqueta} className={cn('size-9 rounded-full flex items-center justify-center shrink-0 t-dato font-extrabold', estiloHeader.circulo)}>
                  {estiloHeader.letra ?? (estiloHeader.icono ? <estiloHeader.icono size={18} weight="bold" /> : null)}
                </span>
              )}
              <div className="flex flex-col min-w-0">
                <SheetTitle className="t-titulo uppercase truncate">{r ? nombreHuesped(r) : 'Detalle'}</SheetTitle>
                {r && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <EstadoBadge tono="neutral">{r.fuente_nombre ?? estiloHeader?.etiqueta ?? 'Reserva'}</EstadoBadge>
                    <SyncBadge r={r} />
                    <span className="flex items-center gap-1 t-meta text-muted-foreground font-mono ml-1">
                      <Hash size={14} aria-hidden />
                      {r.cloudbeds_reservation_id ? (
                        <>
                          {r.cloudbeds_reservation_id}
                          <button type="button" onClick={() => copiarCodigo(r.cloudbeds_reservation_id!)} title="Copiar código" aria-label="Copiar código de Cloudbeds" className="size-8 -my-2 flex items-center justify-center hover:bg-muted rounded-md hover:text-foreground transition-colors cursor-pointer"><Copy size={14} /></button>
                        </>
                      ) : 'POS'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => imprimir(false)} disabled={!r} title="Imprimir la reserva" aria-label="Imprimir la reserva"
              className="size-11 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-40">
              <Printer size={18} weight="bold" />
            </button>
            <button type="button" onClick={intentarCerrar} disabled={ocupado} aria-label="Cerrar panel"
              className="size-11 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 shrink-0">
              <X size={18} weight="bold" />
            </button>
            </div>
          </div>
          <SheetDescription className="sr-only">Detalle y edición de la reserva</SheetDescription>
          {r && (
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 t-cuerpo text-foreground" aria-label="Resumen de la reserva">
              {enGrupo ? (
                <>
                  <FilaHeader icono={Bed}>{plural(vigentesDelGrupo.length, 'habitación', 'habitaciones')}</FilaHeader>
                  <FilaHeader icono={CalendarBlank}><span className="capitalize">{dayjs(vigentesDelGrupo.map((g) => g.llegada).sort()[0]).format('ddd D MMM')} → {dayjs(vigentesDelGrupo.map((g) => g.salida).sort().at(-1)).format('ddd D MMM')}</span> <span className="text-muted-foreground">· {plural(noches, 'noche', 'noches')}</span></FilaHeader>
                  <FilaHeader icono={UserCircle}>{plural(vigentesDelGrupo.reduce((a, g) => a + g.adultos, 0), 'adulto', 'adultos')}{vigentesDelGrupo.some((g) => g.ninos > 0) ? `, ${plural(vigentesDelGrupo.reduce((a, g) => a + g.ninos, 0), 'niño', 'niños')}` : ''}</FilaHeader>
                </>
              ) : (
                <>
                  <FilaHeader icono={Bed}>{cabana}{vistaHab ? <span className="text-muted-foreground"> · {vistaHab}</span> : null}</FilaHeader>
                  <FilaHeader icono={CalendarBlank}><span className="capitalize">{dayjs(r.llegada).format('ddd D MMM')} → {dayjs(r.salida).format('ddd D MMM')}</span> <span className="text-muted-foreground">· {plural(noches, 'noche', 'noches')}</span></FilaHeader>
                  <FilaHeader icono={UserCircle}>{plural(r.adultos, 'adulto', 'adultos')}{r.ninos > 0 ? `, ${plural(r.ninos, 'niño', 'niños')}` : ''}</FilaHeader>
                </>
              )}
            </ul>
          )}
          {/* Pestañas subrayadas, pegadas al borde inferior del encabezado. */}
          {r && editor !== 'extras' && (
            <div role="tablist" aria-label="Secciones de la reserva" className="flex items-center gap-5 -mb-px">
              {([...(enGrupo ? [['grupo', 'Grupo'] as const] : []), ['reserva', 'Reserva'], ['cliente', 'Cliente'], ['cuenta', 'Cuenta'], ['historial', 'Historial']] as const).map(([id, label]) => {
                const tieneAviso = id === 'reserva' && !!divergencia && vigente;
                const tieneSaldo = id === 'cuenta' && !!cifrasCobro && cifrasCobro.saldo > EPS;
                const pagadoCompleto = id === 'cuenta' && pagadaPorCompleto;
                const nHistorial = id === 'historial' ? r.historial?.length ?? 0 : 0;
                return (
                  <button
                    key={id}
                    id={`tab-${id}`}
                    type="button"
                    role="tab"
                    aria-controls={`tabpanel-${id}`}
                    aria-selected={pestana === id}
                    onClick={() => cambiarPestana(id)}
                    className={cn(
                      'min-h-11 px-1 t-cuerpo-fuerte border-b-2 cursor-pointer transition-colors flex items-center gap-1.5',
                      pestana === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span>{label}</span>
                    {tieneAviso && <span className="size-2 rounded-full bg-warning animate-pulse" title="Cambió en Cloudbeds" aria-label="Cambió en Cloudbeds" />}
                    {tieneSaldo && <span className="size-2 rounded-full bg-warning-foreground" title="Saldo pendiente" aria-label="Saldo pendiente" />}
                    {!tieneSaldo && pagadoCompleto && <span className="size-2 rounded-full bg-success" title="Pagada por completo" aria-label="Pagada por completo" />}
                    {nHistorial > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums font-normal">{nHistorial}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {r && editor === 'extras' && <div className="pb-3" />}
        </SheetHeader>

        {enProceso && <BannerEspera texto={enProceso} detalle="No cierres este panel" className="shadow-xs" />}

        {r && editor === 'extras' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
              <button type="button" onClick={cerrarEditorConfirmando} aria-label="Volver a la reserva" className="size-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><ArrowLeft size={20} /></button>
              <span className="t-fila">Añadir extras · {cabana}</span>
            </div>
            <EditorExtras r={r} usuario={usuarioNombre} onCancelar={cerrarEditorConfirmando} onSucio={setSucio}
              onGuardado={(n) => { setEditor(null); void refrescar(false, n); }} />
          </>
        )}

        {editor !== 'extras' && (
          <div
            role="tabpanel"
            id={`tabpanel-${pestana}`}
            aria-labelledby={`tab-${pestana}`}
            className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4 select-text"
          >
          {r && (
            <>
              {r.aviso_cloudbeds && (
                <Seccion icono={WarningCircle} titulo={r.aviso_cloudbeds.tipo === 'cancelada' ? 'Se canceló en Cloudbeds' : 'Cambió en Cloudbeds'} tono="aviso">
                  <span className="t-cuerpo">
                    {r.aviso_cloudbeds.texto}. Ya se aplicó en el POS el {new Date(r.aviso_cloudbeds.fecha).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}.
                  </span>
                  <span className="t-meta text-muted-foreground">
                    {r.aviso_cloudbeds.tipo === 'cancelada'
                      ? (r.venta_id ? 'Falta dejar constancia en su venta del Centro de Ventas (con sus cobros, por si corresponde un reembolso).' : 'No tiene venta enlazada: solo hay que darlo por revisado.')
                      : 'Falta poner al día su venta (fechas) y el plan de alimentación. Si el total ya no cuadra, se te propone un ajuste: el dinero nunca cambia solo.'}
                  </span>
                  {puedeGestionar && (
                    <div className="flex justify-end">
                      <Button type="button" className="h-11" onClick={revisarAviso} disabled={ocupado}>
                        {r.aviso_cloudbeds.tipo === 'cancelada' && !r.venta_id ? 'Entendido' : 'Revisar la venta'}
                      </Button>
                    </div>
                  )}
                </Seccion>
              )}
              {divergencia && vigente && (
                <Seccion icono={WarningCircle} titulo="Esta reserva cambió en Cloudbeds" tono="aviso">
                  <span className="t-cuerpo">{divergencia.resumen}</span>
                  {puedeGestionar && (
                    <div className="flex justify-end">
                      <Button type="button" className="h-11" onClick={aceptarDivergencia} disabled={ocupado}>
                        {divergencia.tipo === 'cancelada' ? 'Marcar como cancelada en el POS' : 'Actualizar el POS con Cloudbeds'}
                      </Button>
                    </div>
                  )}
                </Seccion>
              )}

              {r.fuente_externa && (
                <p className="rounded-2xl bg-muted text-muted-foreground p-3.5 t-meta border border-border">
                  Reserva de un canal externo ({r.fuente_nombre ?? 'OTA'}): las fechas y la cancelación se gestionan en el canal o en Cloudbeds. Aquí puedes cambiar datos del cliente, extras y la tarifa del POS, y registrar cobros.
                </p>
              )}

              {r.sync_estado !== 'sincronizada' && vigente && (
                <div className="flex flex-col gap-2 rounded-2xl bg-destructive-soft text-destructive p-3.5">
                  <span className="t-meta">{r.sync_error || 'Aún no está en Cloudbeds.'}</span>
                  {r.sync_estado === 'pendiente' && puedeGestionar && (
                    <Button type="button" variant="outline" className="h-10 self-start bg-card" onClick={reintentarSync} disabled={ocupado}>{ocupado ? <Girando /> : 'Reintentar subida'}</Button>
                  )}
                </div>
              )}

              {enGrupo && pestana !== 'historial' && pestana !== 'grupo' && (
                <GrupoResumen filas={vigentesDelGrupo} seleccionada={r.id} ventas={ventas} onElegir={elegirCabana} />
              )}

              {pestana === 'grupo' && enGrupo && (<>
                <VistaGrupo filas={vigentesDelGrupo} ventas={ventas} onElegir={(h) => { elegirCabana(h); setPestana('reserva'); }} />
                {puedeGestionar && vigente && r.cloudbeds_grupo_ref && (
                  <SeparadorGrupo grupo={vigentesDelGrupo} habitaciones={habitaciones} usuario={usuarioNombre}
                    onHecho={(rs) => { setEditor(null); setSucio(false); void refrescar(true, rs.find((x) => x.id === r.id) ?? rs[0]); }} />
                )}
              </>)}

              {pestana === 'reserva' && (<>
              <Seccion icono={Bed} color="info" titulo={`Estadía · ${plural(noches, 'noche', 'noches')}`}
                accion={puedeEditar && !r.fuente_externa && editor !== 'estadia' && editor !== 'cabana' ? (
                  <div className="flex items-center gap-2">
                    {!r.cloudbeds_grupo_ref && <Button type="button" variant="ghost" className="h-9 gap-1.5" onClick={() => abrirEditor('cabana')}><ArrowsLeftRight size={14} /> Habitación</Button>}
                    <Button type="button" variant="suave" className="h-9 gap-1.5" onClick={() => abrirEditor('estadia')}><PencilSimple size={14} /> Editar</Button>
                  </div>
                ) : undefined}>
                <div className="grid grid-cols-2 gap-3">
                  <Dato t="Habitación" v={<>{cabana}{vistaHab ? <span className="text-muted-foreground font-normal"> · {vistaHab}</span> : null}</>} />
                  <SelectorCama r={r} camas={habitacionDeUnidad(habitaciones, r.room_type_id, r.room_id)?.camas ?? []} puedeEditar={puedeGestionar && vigente && (editor === 'estadia' || !!r.fuente_externa)} usuario={usuarioNombre} onCambio={(n) => void refrescar(false, n)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Dato t="Llegada" v={<span className="capitalize">{fechaLarga(r.llegada)}</span>} />
                  <Dato t="Salida" v={<span className="capitalize">{fechaLarga(r.salida)}</span>} />
                </div>
                {editor === 'cabana' && (
                  <EditorCabana r={r} habitaciones={habitaciones} usuario={usuarioNombre} onCancelar={cerrarEditor} onSucio={setSucio}
                    onGuardado={() => { setEditor(null); void refrescar(true); }} />
                )}
                {editor === 'estadia' && (
                  <EditorEstadia modo="fechas" r={r} grupo={vigentesDelGrupo} usuario={usuarioNombre} onCancelar={cerrarEditor} onSucio={setSucio}
                    onGuardado={() => { setEditor(null); void refrescar(true); }} />
                )}
              </Seccion>

              <Seccion icono={UsersThree} titulo="Huéspedes"
                accion={puedeEditar && (!r.fuente_externa || planes.length > 0) && editor !== 'huespedes' ? <Button type="button" variant="suave" className="h-9 gap-1.5" onClick={() => abrirEditor('huespedes')}><PencilSimple size={14} /> Editar</Button> : undefined}>
                {editor !== 'huespedes' && (
                <div className="grid grid-cols-2 gap-3">
                  {/* Cada grupo con lo que incluye su plan, para leer de corrido «cuántos» y «qué reciben». */}
                  <div className="flex flex-col gap-0.5">
                    <Dato t="Adultos" v={r.adultos} />
                    {r.plan_alimentacion && incluyePorPersona(r.plan_alimentacion).adulto && <span className="t-cuerpo text-muted-foreground">{incluyePorPersona(r.plan_alimentacion).adulto}</span>}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Dato t="Niños" v={r.ninos} />
                    {r.plan_alimentacion && r.ninos > 0 && incluyePorPersona(r.plan_alimentacion).nino && <span className="t-cuerpo text-muted-foreground">{incluyePorPersona(r.plan_alimentacion).nino}</span>}
                  </div>
                  <SeccionPlan r={r} hayPlanes={planes.length > 0} />
                </div>
                )}
                {editor === 'huespedes' && (
                  <EditorEstadia modo="huespedes" r={r} grupo={[r]} planes={planes} soloPlan={r.fuente_externa} usuario={usuarioNombre} onCancelar={cerrarEditor} onSucio={setSucio}
                    onGuardado={() => { setEditor(null); void refrescar(true); }} />
                )}
              </Seccion>

              <SeccionNotas r={r} enGrupo={vigentesDelGrupo.length > 1} puedeEditar={puedeGestionar && vigente} usuario={usuarioNombre} onCambio={(n) => void refrescar(false, n)} />
              </>)}

              {pestana === 'cliente' && (<>
              <Seccion icono={User} titulo="Cliente"
                accion={puedeGestionar && editor !== 'cliente' ? <Button type="button" variant="suave" className="h-9 gap-1.5" onClick={() => abrirEditor('cliente')}><PencilSimple size={14} /> Editar</Button> : undefined}>
                <div className="grid grid-cols-2 gap-3">
                  <Dato t="Nombre" v={nombreHuesped(r)} />
                  <Dato
                    t="Teléfono"
                    v={
                      r.huesped_telefono ? (
                        <span className="flex items-center gap-1.5">
                          <a href={`tel:${r.huesped_telefono}`} className="hover:underline text-foreground">{r.huesped_telefono}</a>
                          <button type="button" onClick={() => copiarCodigo(r.huesped_telefono!)} title="Copiar teléfono" aria-label="Copiar teléfono" className="size-6 inline-flex items-center justify-center hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"><Copy size={12} /></button>
                        </span>
                      ) : '—'
                    }
                  />
                  <div className="col-span-2">
                    <Dato
                      t="Correo"
                      v={
                        r.huesped_email ? (
                          <span className="flex items-center gap-1.5">
                            <a href={`mailto:${r.huesped_email}`} className="hover:underline text-foreground break-all">{r.huesped_email}</a>
                            <button type="button" onClick={() => copiarCodigo(r.huesped_email)} title="Copiar correo" aria-label="Copiar correo" className="size-6 inline-flex items-center justify-center hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer shrink-0"><Copy size={12} /></button>
                          </span>
                        ) : '—'
                      }
                    />
                  </div>
                  {r.notas && <div className="col-span-2"><Dato t="Notas internas" v={r.notas} /></div>}
                </div>
                {editor !== 'cliente' && <FichaCliente clienteId={r.cliente_id} />}
                {editor === 'cliente' && (
                  <EditorCliente r={r} usuario={usuarioNombre} onCancelar={cerrarEditor} onSucio={setSucio}
                    onGuardado={(n) => { setEditor(null); void refrescar(false, n); }} />
                )}
              </Seccion>
              <SeccionMascota r={r} puedeEditar={puedeGestionar && vigente} usuario={usuarioNombre} onCambio={(n) => void refrescar(false, n)} />
              </>)}

              {pestana === 'cuenta' && (<>
              <SeccionCuenta r={r} puedeEditar={puedeEditar} usuario={usuarioNombre} editor={editorCuenta}
                onEditor={(e) => (e === null ? cerrarEditor() : abrirEditor(e))} onSucio={setSucio}
                onCambio={(n, afecta) => void refrescar(afecta ?? false, n)} onQuitarExtra={quitarExtra} />

              <div ref={cobrosRef} className="scroll-mt-4">
                <SeccionCobros r={r} venta={venta} ventaPerdida={sinVenta} onDesenlazar={desenlazarVenta} grupo={enGrupo ? vigentesDelGrupo : []} puedeGestionar={puedeGestionar} usuario={{ id: currentMesero?.id, nombre: usuarioNombre }}
                  abierto={editor === 'abono'} onAbrir={(a) => (a ? abrirEditor('abono') : cerrarEditor())} onSucio={setSucio}
                  onCambio={(n) => { setEditor(null); setSucio(false); void refrescar(false, n); }} onConciliar={onConciliar} />
              </div>
              </>)}

              {pestana === 'historial' && (<>
              <SeccionHistorial historial={r.historial} cargando={historialDe !== r.id && r.historial.length === 0} />

              <Seccion icono={Gift} color="info" titulo="Documentos">
                <p className="t-meta text-muted-foreground">Hoja de la reserva sin importes, totales ni pagos: para check-ins de certificados o confirmaciones de regalo.</p>
                <Button type="button" variant="outline" className="h-11 gap-2 self-start" onClick={() => imprimir(true)} disabled={!r}>
                  <Gift size={16} weight="bold" /> Imprimir hoja de regalo
                </Button>
              </Seccion>

              {puedeGestionar && vigente && !r.fuente_externa && (
                <Seccion icono={Prohibit} color="destructive" titulo="Cancelar">
                  <p className="t-meta text-muted-foreground">Cancela la reserva{r.cloudbeds_reservation_id ? ' también en Cloudbeds' : ''} y libera las fechas. Los cobros de la venta no se tocan: se deja un comentario para que revises si corresponde un reembolso.</p>
                  <div className="flex flex-wrap gap-2">
                    {vigentesDelGrupo.length > 1 && <Button type="button" variant="outline" className="h-11 text-destructive" onClick={cancelarGrupo} disabled={ocupado}>Cancelar todo el grupo</Button>}
                    <Button type="button" variant="outline" className="h-11 text-destructive" onClick={cancelar} disabled={ocupado}>{r.grupo_id ? 'Cancelar solo esta habitación' : 'Cancelar reserva'}</Button>
                  </div>
                </Seccion>
              )}
              </>)}
            </>
          )}
        </div>
      )}

        {r && editor !== 'extras' && (
          <div className="border-t border-border bg-card px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            {/* Cifras: total, pagado y saldo en columnas con su rótulo; sin venta utilizable, el estado en texto. */}
            <dl className={cn('grid gap-x-6 gap-y-0.5 min-w-0 items-end', cifrasCobro ? 'grid-cols-[auto_auto_auto]' : 'grid-cols-[auto_auto]')}>
              <dt className="t-meta text-muted-foreground">{enGrupo ? 'Total del grupo' : 'Total'}</dt>
              {cifrasCobro ? <dt className="t-meta text-muted-foreground">Pagado</dt> : <dt aria-hidden />}
              {cifrasCobro ? <dt className="t-meta text-muted-foreground">Saldo</dt> : null}
              <dd className="t-valor text-2xl leading-none tabular-nums">{dinero(enGrupo ? totGrupo.total : totalPos)}</dd>
              {cifrasCobro ? (
                <>
                  <dd className={cn('t-cuerpo-fuerte tabular-nums', cifrasCobro.pagado > EPS ? 'text-success' : 'text-muted-foreground')}>{dinero(cifrasCobro.pagado)}</dd>
                  <dd className={cn('t-cuerpo-fuerte tabular-nums', cifrasCobro.saldo > EPS ? 'text-warning-foreground' : 'text-success')}>{dinero(cifrasCobro.saldo)}</dd>
                </>
              ) : (
                <dd className="t-meta text-muted-foreground">{textoSinCobros}</dd>
              )}
            </dl>
            <div className="flex items-center gap-3 ml-auto">
              {pago && <EstadoBadge tono={pago.tono}>{pago.etiqueta}</EstadoBadge>}
              {puedeGestionar && vigente && editor !== 'abono' && !venta?.anulado && !sinVenta && (
                <Button type="button" variant={pagadaPorCompleto ? 'outline' : 'default'} className="h-11 px-5 shrink-0 gap-1.5" onClick={abrirAbono} disabled={pagadaPorCompleto} title={pagadaPorCompleto ? 'La reserva ya está pagada por completo' : undefined}><Plus size={16} weight="bold" /> Añadir pago</Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
