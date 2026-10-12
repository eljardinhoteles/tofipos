import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { CheckCircle, ArrowRight, ClockCounterClockwise, LockKey, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '@/lib/toast';
import { type DatosTicketCierre } from '../../services/printTemplateEngine';
import { cn } from '@/lib/utils';
import { limpiarReferencia } from '../../lib/nombreMesa';
import {
  calcularResumenCierre, METODO_TITULO, ORIGEN_CIERRE_TITULO,
  type GrupoCobros, type OrigenCierre, type ResumenCierre,
} from '../../lib/cierreTurno';
import type { VentaConMovimientos } from '../../hooks/useVentasConMovimientos';
import { OrigenBadge, ORIGEN_ICON } from '../Common/OrigenBadge';
import { FiltroChip } from '../Common/FiltroChip';
import { HistorialCierresDia, ListaCierres } from './HistorialCierresDia';
import { CierreReporteVista } from './CierreReporteVista';
import type { CierreTurno } from '../../lib/cierreTurno';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useCierresDelDia } from '../../hooks/useCierresDelDia';
import { guardarCierreTurno } from '../../lib/cierresTurnoApi';
import { marcarMovimientosCerrados } from '../../db/rxdb';

interface AsistenteCierreTurnoProps {
  date: string;
  items: VentaConMovimientos[];
  onSelectVenta: (id: string) => void;
}

const TODOS_ORIGENES = Object.keys(ORIGEN_CIERRE_TITULO) as OrigenCierre[];
const PASOS = ['Cobros', 'Comprobantes', 'Facturas', 'Cierre'] as const;
const dinero = (n: number) => `$${n.toFixed(2)}`;

const seccion = 'flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs';
const tituloSeccion = 't-etiqueta text-muted-foreground';

/** Fila de dato: rótulo a la izquierda, línea punteada y valor a la derecha. */
function FilaDato({ label, value, sub = false, destacado = false }: { label: string; value: string; sub?: boolean; destacado?: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-2', sub && 'pl-5')}>
      <span className={cn(sub ? 't-meta' : 't-cuerpo', 'text-muted-foreground whitespace-nowrap')}>{label}</span>
      <span className="flex-1 border-b border-dotted border-border" />
      <span className={cn(destacado ? 't-valor' : sub ? 't-meta' : 't-cuerpo-fuerte', 'tabular-nums whitespace-nowrap text-foreground')}>{value}</span>
    </div>
  );
}

function CobrosOrigen({ titulo, origen, grupo }: { titulo: string; origen: OrigenCierre; grupo: GrupoCobros }) {
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <OrigenBadge origen={origen} />
        <span className="t-cuerpo-fuerte tabular-nums text-foreground">{titulo}: {dinero(grupo.total)}</span>
      </div>
      {grupo.total === 0 ? (
        <p className="t-meta text-muted-foreground">Sin cobros en este turno.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {grupo.efectivo > 0 && <FilaDato label="Efectivo" value={dinero(grupo.efectivo)} />}
          {grupo.tarjeta > 0 && <FilaDato label="Tarjeta" value={dinero(grupo.tarjeta)} />}
          {Object.entries(grupo.redes).map(([r, v]) => <FilaDato key={r} label={r} value={dinero(v)} sub />)}
          {grupo.transferencia > 0 && <FilaDato label="Transferencia" value={dinero(grupo.transferencia)} />}
          {Object.entries(grupo.bancos).map(([b, v]) => <FilaDato key={b} label={b} value={dinero(v)} sub />)}
          {grupo.otros > 0 && <FilaDato label="Otros" value={dinero(grupo.otros)} />}
        </div>
      )}
    </div>
  );
}

/** Fila de revisión: una venta que requiere atención; al tocarla se abre su detalle. */
function FilaRevision({ item, detalle, monto, onClick }: { item: VentaConMovimientos; detalle: string; monto: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full min-h-14 px-4 py-2 flex items-center gap-3 text-left border-b border-dashed border-border last:border-b-0 hover:bg-muted/60 transition-colors cursor-pointer touch-manipulation">
      <div className="min-w-0 flex-1 flex flex-col">
        <span className="t-cuerpo-fuerte uppercase text-secondary-foreground truncate">{item.venta.cliente_nombre || 'Sin cliente'}</span>
        <span className="t-meta text-muted-foreground truncate">{detalle}</span>
      </div>
      <span className="t-cuerpo-fuerte tabular-nums text-foreground shrink-0">{monto}</span>
      <ArrowRight size={16} className="text-muted-foreground shrink-0" />
    </button>
  );
}

function TodoEnOrden({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 text-success-foreground">
      <CheckCircle size={22} weight="fill" className="shrink-0" />
      <span className="t-cuerpo-fuerte">{texto}</span>
    </div>
  );
}

/**
 * Asistente de cierre de turno: revisa cobros, comprobantes y facturas del día y termina en un reporte A4
 * con las novedades de caja. Mientras avanzas, el paso y las novedades se guardan como borrador de la sesión,
 * para que abrir una venta desde una lista de revisión no haga perder el avance.
 */
export function AsistenteCierreTurno(props: AsistenteCierreTurnoProps) {
  const fecha = dayjs(props.date, 'DD MMM YYYY');
  // Solo el día en curso se cierra; los demás días solo muestran el historial de sus cierres.
  if (fecha.isValid() && !fecha.isSame(dayjs(), 'day')) {
    return <HistorialCierresDia fechaLarga={fecha.locale('es').format('dddd, D [de] MMMM - YYYY')} fechaDia={fecha.format('YYYY-MM-DD')} />;
  }
  return <CierreDelDia {...props} />;
}

function CierreDelDia({ date, items, onSelectVenta }: AsistenteCierreTurnoProps) {
  const { currentMesero, adminUser } = useAuth();
  // Quien cierra: por defecto el usuario con sesión, editable por si otra persona hace el cierre en ese equipo.
  const nombreSesion = currentMesero?.nombre || adminUser?.user_metadata?.full_name || adminUser?.email?.split('@')[0] || '';
  const [responsable, setResponsable] = useState('');
  const [intentado, setIntentado] = useState(false);
  const claveBorrador = `cierre-borrador:${date}`;
  const [paso, setPaso] = useState(0);
  const [novedades, setNovedades] = useState('');
  // Orígenes que cubre este cierre: quien cierra solo lo suyo omite el resto.
  const [origenes, setOrigenes] = useState<Set<OrigenCierre>>(new Set(TODOS_ORIGENES));
  // La página abre en el historial de cierres de hoy; "Crear cierre" inicia uno nuevo desde el paso 1.
  const [enHistorial, setEnHistorial] = useState(true);
  const [reporte, setReporte] = useState<CierreTurno | null>(null);
  // Cierre: confirmación y guardado. Al terminar se vuelve al historial.
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // El id se genera una vez: reintentar un guardado fallido no duplica el cierre.
  const cierreIdRef = useRef<string | null>(null);
  const guardadoEnNubeRef = useRef(false);
  // La foto del turno se toma en el primer intento: si marcar los cobros falla a medias, el reintento usa la misma.
  const fotoRef = useRef<{ resumen: ResumenCierre; datos: DatosTicketCierre } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(claveBorrador);
      const b = raw ? JSON.parse(raw) : null;
      setEnHistorial(!b?.enCurso);
      setPaso(typeof b?.paso === 'number' ? Math.min(Math.max(b.paso, 0), PASOS.length - 1) : 0);
      setNovedades(typeof b?.novedades === 'string' ? b.novedades : '');
      setResponsable(typeof b?.responsable === 'string' && b.responsable ? b.responsable : nombreSesion);
      const guardados = Array.isArray(b?.origenes) ? TODOS_ORIGENES.filter(o => b.origenes.includes(o)) : [];
      setOrigenes(new Set(guardados.length > 0 ? guardados : TODOS_ORIGENES));
    } catch { setEnHistorial(true); setPaso(0); setNovedades(''); setResponsable(nombreSesion); setOrigenes(new Set(TODOS_ORIGENES)); }
  }, [claveBorrador]);

  useEffect(() => {
    try { sessionStorage.setItem(claveBorrador, JSON.stringify({ enCurso: !enHistorial, paso, novedades, responsable, origenes: [...origenes] })); } catch { /* sin almacenamiento: no se guarda el borrador */ }
  }, [claveBorrador, enHistorial, paso, novedades, responsable, origenes]);

  const fechaParsed = useMemo(() => dayjs(date, 'DD MMM YYYY'), [date]);
  // Solo las ventas de los orígenes incluidos entran al cierre.
  const itemsCierre = useMemo(() => items.filter(i => origenes.has(i.venta.origen)), [items, origenes]);
  const resumen = useMemo(() => calcularResumenCierre(itemsCierre, fechaParsed), [itemsCierre, fechaParsed]);
  const omitidos = TODOS_ORIGENES.filter(o => !origenes.has(o));
  const alternarOrigen = (o: OrigenCierre) => setOrigenes(prev => {
    const next = new Set(prev);
    if (next.has(o)) { if (next.size > 1) next.delete(o); } else next.add(o);
    return next;
  });

  const fechaLarga = fechaParsed.isValid() ? fechaParsed.locale('es').format('dddd, D [de] MMMM - YYYY') : date;
  const ultimo = paso === PASOS.length - 1;
  const falta = !responsable.trim();
  const faltaNovedades = !novedades.trim();
  const armarDatos = (): DatosTicketCierre => ({
    fecha: fechaLarga,
    responsable: responsable.trim(),
    origenes: TODOS_ORIGENES.filter(o => origenes.has(o)).map(o => ORIGEN_CIERRE_TITULO[o]),
    omitidos: omitidos.map(o => ORIGEN_CIERRE_TITULO[o]),
    totalCobrado: resumen.totalCobrado,
    totalReembolsado: resumen.totalReembolsado,
    saldoPendiente: resumen.saldoPendiente,
    ventas: resumen.ventasValidas,
    anuladas: resumen.anuladas,
    pagos: resumen.pagos,
    porOrigen: TODOS_ORIGENES.filter(o => origenes.has(o)).map(o => {
      const g = resumen.cobrosPorOrigen[o];
      const lineas: Array<{ label: string; monto: number; sub?: boolean }> = [];
      if (g.efectivo > 0) lineas.push({ label: 'Efectivo', monto: g.efectivo });
      if (g.tarjeta > 0) lineas.push({ label: 'Tarjeta', monto: g.tarjeta });
      Object.entries(g.redes).forEach(([r, v]) => lineas.push({ label: r, monto: v, sub: true }));
      if (g.transferencia > 0) lineas.push({ label: 'Transferencia', monto: g.transferencia });
      Object.entries(g.bancos).forEach(([b, v]) => lineas.push({ label: b, monto: v, sub: true }));
      if (g.otros > 0) lineas.push({ label: 'Otros', monto: g.otros });
      return { titulo: ORIGEN_CIERRE_TITULO[o], total: g.total, lineas };
    }),
    sinComprobante: resumen.pagosSinComprobante.length,
    sinFactura: resumen.ventasSinFactura.length,
    creditos: { cantidad: resumen.creditos.length, total: resumen.totalCredito },
    novedades,
    detalle: {
      creditos: resumen.creditos.map(c => ({ cliente: c.item.venta.cliente_nombre || 'Sin cliente', referencia: limpiarReferencia(c.item.venta.referencia) || '', monto: c.monto })),
      sinComprobante: resumen.pagosSinComprobante.map(p => ({ cliente: p.item.venta.cliente_nombre || 'Sin cliente', metodo: METODO_TITULO[p.metodo] ?? p.metodo, monto: p.monto })),
      sinFactura: resumen.ventasSinFactura.map(i => ({ cliente: i.venta.cliente_nombre || 'Sin cliente', referencia: limpiarReferencia(i.venta.referencia) || '', monto: i.totalPagado })),
      pendientes: resumen.ventasPendientes.map(i => ({ cliente: i.venta.cliente_nombre || 'Sin cliente', referencia: limpiarReferencia(i.venta.referencia) || '', saldo: i.saldo })),
    },
  });

  const hayCobros = resumen.movimientosIncluidos.length > 0;
  // "Crear cierre" se habilita si hay algún cobro abierto hoy, sin importar los orígenes que se elijan después.
  // Ventas de hoy (no a crédito) que todavía no tienen ningún pago registrado: no entran al cierre y hay que avisarlo.
  const ventasSinPagoHoy = useMemo(() => items.filter(i =>
    !i.anulado && i.venta.tipo !== 'credito' && i.totalPagado <= 0 && i.movimientos.some(m => !m.anulado && dayjs(m.fecha).isSame(fechaParsed, 'day'))
  ), [items, fechaParsed]);
  const hayCobrosHoy = useMemo(() => calcularResumenCierre(items, fechaParsed).movimientosIncluidos.length > 0, [items, fechaParsed]);
  const pedirCierre = () => {
    setIntentado(true);
    if (falta) { showToast.error('Escribe el nombre de quien hace el cierre'); return; }
    if (faltaNovedades) { showToast.error('Escribe las novedades de caja (si no hubo, escribe "Sin novedades")'); return; }
    if (!hayCobros) { showToast.error('No hay cobros abiertos que cerrar con estos orígenes'); return; }
    setConfirmarCierre(true);
  };

  const cerrarTurno = async () => {
    setGuardando(true);
    try {
      const id = cierreIdRef.current ?? (cierreIdRef.current = crypto.randomUUID());
      const foto = fotoRef.current ?? (fotoRef.current = { resumen, datos: armarDatos() });
      if (!guardadoEnNubeRef.current) {
        await guardarCierreTurno({
          id,
          fechaDia: fechaParsed.format('YYYY-MM-DD'),
          usuarioId: currentMesero?.id || adminUser?.id,
          usuarioNombre: responsable.trim(),
          origenes: TODOS_ORIGENES.filter(o => origenes.has(o)),
          totalCobrado: resumen.totalCobrado,
          totalReembolsado: resumen.totalReembolsado,
          pagos: resumen.pagos,
          novedades: novedades.trim(),
          ticket: foto.datos,
        });
        guardadoEnNubeRef.current = true;
      }
      await marcarMovimientosCerrados(foto.resumen.movimientosIncluidos, id);
      try { sessionStorage.removeItem(claveBorrador); } catch { /* sin almacenamiento */ }
      setConfirmarCierre(false);
      reiniciarCierre();
      recargarHistorial();
      showToast.success('Turno cerrado', 'Quedó en el historial; ahí puedes imprimir el ticket o el reporte A4.');
    } catch (e) {
      console.error(e);
      // El cierre ya está guardado pero faltó marcar algún cobro: se puede reintentar sin duplicarlo.
      showToast.error(guardadoEnNubeRef.current ? 'El cierre se guardó, pero no se marcaron todos los cobros. Intenta de nuevo.' : 'No se pudo guardar el cierre. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  // Vuelve al historial con el formulario en blanco: el siguiente cierre siempre empieza de cero.
  const reiniciarCierre = () => {
    cierreIdRef.current = null;
    guardadoEnNubeRef.current = false;
    fotoRef.current = null;
    setNovedades('');
    setPaso(0);
    setIntentado(false);
    setOrigenes(new Set(TODOS_ORIGENES));
    setEnHistorial(true);
  };

  const crearCierre = () => {
    reiniciarCierre();
    setEnHistorial(false);
  };

  const { cierres: cierresHoy, cargando: cargandoHoy, error: errorHoy, recargar: recargarHistorial } = useCierresDelDia(fechaParsed.format('YYYY-MM-DD'));

  if (reporte) return <CierreReporteVista cierre={reporte} onVolver={() => setReporte(null)} />;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-16 px-6 border-b border-border bg-card flex items-center gap-3 shrink-0">
        <div className="min-w-0 mr-auto flex flex-col">
          <span className="t-titulo text-secondary-foreground truncate">Cierre de turno</span>
          <span className="t-meta text-muted-foreground truncate capitalize">{fechaLarga}</span>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {enHistorial ? (
            <Button type="button" onClick={crearCierre} disabled={!hayCobrosHoy} title={hayCobrosHoy ? undefined : 'No hay cobros abiertos hoy'}>
              <Plus size={18} weight="bold" /> Crear cierre
            </Button>
          ) : (
            <>
              {paso === 0 && (
                <Button type="button" variant="outline" onClick={() => setEnHistorial(true)}>
                  <ClockCounterClockwise size={18} weight="bold" /> Historial
                </Button>
              )}
              {paso > 0 && <Button type="button" variant="outline" onClick={() => setPaso(paso - 1)}>Atrás</Button>}
              {!ultimo ? (
                <Button type="button" onClick={() => setPaso(paso + 1)}>Continuar</Button>
              ) : (
                <Button type="button" onClick={pedirCierre} disabled={!hayCobros}>
                  <LockKey size={18} weight="bold" /> Cerrar turno
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="mx-auto w-full max-w-3xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 min-h-9 pointer-coarse:min-h-11">
            <span className="t-etiqueta text-muted-foreground">
              {enHistorial ? 'Cierres de hoy' : `Paso ${paso + 1} de ${PASOS.length} · ${PASOS[paso]}`}
            </span>
          </div>

          {!enHistorial && paso === 0 && (
            <section className={seccion}>
              <div className="flex flex-col gap-1">
                <h4 className={tituloSeccion}>Orígenes de este cierre</h4>
                <p className="t-meta text-muted-foreground">Deja solo los que te corresponden; los que quites se omiten y los cierra otra persona.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TODOS_ORIGENES.map(o => {
                  const Icono = ORIGEN_ICON[o];
                  return (
                    <FiltroChip key={o} activo={origenes.has(o)} onClick={() => alternarOrigen(o)}>
                      <Icono size={14} weight="bold" /> {ORIGEN_CIERRE_TITULO[o]}
                    </FiltroChip>
                  );
                })}
              </div>
            </section>
          )}

          {enHistorial && (hayCobrosHoy ? ventasSinPagoHoy.length > 0 : true) && (
            <section className={cn(seccion, 'p-0 gap-0 overflow-hidden', ventasSinPagoHoy.length > 0 && 'border-warning/40')}>
              <div className={cn('p-5 flex flex-col gap-1', ventasSinPagoHoy.length > 0 && 'bg-warning-soft')}>
                <h4 className={cn(tituloSeccion, ventasSinPagoHoy.length > 0 && 'text-warning-foreground')}>
                  {ventasSinPagoHoy.length > 0
                    ? `${ventasSinPagoHoy.length} ${ventasSinPagoHoy.length === 1 ? 'venta de hoy sin pago registrado' : 'ventas de hoy sin pago registrado'}`
                    : 'Nada por cerrar'}
                </h4>
                <p className={cn('t-meta', ventasSinPagoHoy.length > 0 ? 'text-warning-foreground' : 'text-muted-foreground')}>
                  {ventasSinPagoHoy.length > 0
                    ? (hayCobrosHoy
                      ? 'Estas ventas no entran al cierre hasta que registres su pago desde el detalle.'
                      : 'No puedes crear el cierre hasta que registres al menos un pago. Toca una venta para abrir su detalle y registrarlo.')
                    : 'No hay cobros abiertos hoy: no hubo ventas cobradas, o todo lo cobrado ya está en un cierre.'}
                </p>
              </div>
              {ventasSinPagoHoy.length > 0 && (
                <div className="border-t border-border">
                  {ventasSinPagoHoy.slice(0, 5).map(i => (
                    <FilaRevision key={i.venta.id} item={i}
                      detalle={limpiarReferencia(i.venta.referencia) || 'Sin referencia'}
                      monto={dinero(i.montoTotal)} onClick={() => onSelectVenta(i.venta.id)} />
                  ))}
                  {ventasSinPagoHoy.length > 5 && (
                    <div className="px-4 py-3 t-meta text-muted-foreground text-center border-t border-dashed border-border">
                      +{ventasSinPagoHoy.length - 5} más
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {enHistorial && (
            <ListaCierres cierres={cierresHoy} cargando={cargandoHoy} error={errorHoy} onVerReporte={setReporte} vacio={<p className="t-meta text-muted-foreground py-8 text-center">Aún no se ha hecho ningún cierre hoy. Pulsa «Crear cierre» para empezar uno.</p>} />
          )}

          {!enHistorial && paso === 0 && (
            <>
              <section className={seccion}>
                <h4 className={tituloSeccion}>Total cobrado</h4>
                <span className="t-hero tabular-nums text-foreground">{dinero(resumen.totalCobrado)}</span>
                <div className="flex flex-col gap-1">
                  {(['efectivo', 'tarjeta', 'transferencia'] as const).map(m => <FilaDato key={m} label={METODO_TITULO[m]} value={dinero(resumen.pagos[m])} />)}
                  {resumen.pagos.otros > 0 && <FilaDato label="Otros" value={dinero(resumen.pagos.otros)} />}
                  {resumen.totalReembolsado > 0 && <FilaDato label="Reembolsos" value={dinero(resumen.totalReembolsado)} />}
                  {resumen.saldoPendiente > 0.01 && <FilaDato label="Saldo pendiente de cobro" value={dinero(resumen.saldoPendiente)} />}
                </div>
              </section>

              {resumen.creditos.length > 0 && (
                <section className={cn(seccion, 'p-0 gap-0 overflow-hidden')}>
                  <div className="p-5 flex flex-col gap-1">
                    <h4 className={tituloSeccion}>Ventas a crédito del turno</h4>
                    <p className="t-meta text-muted-foreground">Quedan en el cierre como constancia del crédito, aunque todavía no tengan pagos. {resumen.creditos.length} por {dinero(resumen.totalCredito)}.</p>
                  </div>
                  <div className="border-t border-border">
                    {resumen.creditos.map(c => (
                      <FilaRevision key={c.item.venta.id} item={c.item}
                        detalle={limpiarReferencia(c.item.venta.referencia) || 'Sin referencia'}
                        monto={dinero(c.monto)} onClick={() => onSelectVenta(c.item.venta.id)} />
                    ))}
                  </div>
                </section>
              )}

              <section className={seccion}>
                <h4 className={tituloSeccion}>Cobros por origen</h4>
                <div className="flex flex-col divide-y divide-border">
                  {TODOS_ORIGENES.filter(o => origenes.has(o)).map(o => (
                    <CobrosOrigen key={o} titulo={ORIGEN_CIERRE_TITULO[o]} origen={o} grupo={resumen.cobrosPorOrigen[o]} />
                  ))}
                </div>
              </section>
            </>
          )}

          {!enHistorial && paso === 1 && (
            <section className={cn(seccion, 'p-0 gap-0 overflow-hidden')}>
              <div className="p-5 flex flex-col gap-1">
                <h4 className={tituloSeccion}>Cobros sin comprobante</h4>
                <p className="t-meta text-muted-foreground">Tarjetas, transferencias y otros cobros que no tienen comprobante adjunto. El efectivo no lo requiere. Toca uno para adjuntarlo.</p>
              </div>
              {resumen.pagosSinComprobante.length === 0 ? (
                <div className="px-5 pb-5"><TodoEnOrden texto="Todos los cobros tienen su comprobante." /></div>
              ) : (
                <div className="border-t border-border">
                  {resumen.pagosSinComprobante.map((p, i) => (
                    <FilaRevision key={`${p.item.venta.id}-${i}`} item={p.item}
                      detalle={`${METODO_TITULO[p.metodo] ?? p.metodo}${limpiarReferencia(p.item.venta.referencia) ? ` · ${limpiarReferencia(p.item.venta.referencia)}` : ''}`}
                      monto={dinero(p.monto)} onClick={() => onSelectVenta(p.item.venta.id)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {!enHistorial && paso === 2 && (
            <section className={cn(seccion, 'p-0 gap-0 overflow-hidden')}>
              <div className="p-5 flex flex-col gap-1">
                <h4 className={tituloSeccion}>Ventas sin factura</h4>
                <p className="t-meta text-muted-foreground">Ventas con dinero cobrado cuya factura falta o no cubre el último pago. {resumen.ventasFacturadas} de {resumen.ventasValidas} ya están facturadas.</p>
              </div>
              {resumen.ventasSinFactura.length === 0 ? (
                <div className="px-5 pb-5"><TodoEnOrden texto="Todas las ventas cobradas están facturadas." /></div>
              ) : (
                <div className="border-t border-border">
                  {resumen.ventasSinFactura.map(i => (
                    <FilaRevision key={i.venta.id} item={i}
                      detalle={limpiarReferencia(i.venta.referencia) || 'Sin referencia'}
                      monto={dinero(i.totalPagado)} onClick={() => onSelectVenta(i.venta.id)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {!enHistorial && paso === 3 && (
            <>
              <section className={seccion}>
                <h4 className={tituloSeccion}>Resumen del turno</h4>
                <div className="flex flex-col gap-1">
                  <FilaDato label="Orígenes incluidos" value={TODOS_ORIGENES.filter(o => origenes.has(o)).map(o => ORIGEN_CIERRE_TITULO[o]).join(', ')} />
                  <FilaDato label="Total cobrado" value={dinero(resumen.totalCobrado)} destacado />
                  <FilaDato label="Ventas" value={`${resumen.ventasValidas}${resumen.anuladas > 0 ? ` (+${resumen.anuladas} anuladas)` : ''}`} />
                  <FilaDato label="Saldo pendiente" value={dinero(resumen.saldoPendiente)} />
                  {resumen.creditos.length > 0 && <FilaDato label="Ventas a crédito" value={`${resumen.creditos.length} · ${dinero(resumen.totalCredito)}`} />}
                  <FilaDato label="Cobros sin comprobante" value={String(resumen.pagosSinComprobante.length)} />
                  <FilaDato label="Ventas sin factura" value={String(resumen.ventasSinFactura.length)} />
                </div>
              </section>

              <section className={seccion}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cierre-responsable" className="t-etiqueta! text-muted-foreground">Cierre realizado por *</Label>
                  <Input id="cierre-responsable" type="text" value={responsable} onChange={(e) => setResponsable(e.target.value)}
                    placeholder="Nombre de quien hace el cierre" aria-invalid={intentado && falta} className="h-12 text-base" />
                  {intentado && falta && <p className="t-meta text-destructive">Escribe el nombre de quien hace el cierre</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                <Label htmlFor="cierre-novedades" className="t-etiqueta! text-muted-foreground">Novedades de caja *</Label>
                <Textarea id="cierre-novedades" value={novedades} onChange={(e) => setNovedades(e.target.value)} aria-invalid={intentado && faltaNovedades}
                  placeholder="Ej. diferencia en caja, voucher pendiente, cliente que pagará mañana. Si no hubo nada, escribe «Sin novedades»." className="min-h-32 text-base" />
                {intentado && faltaNovedades && <p className="t-meta text-destructive">Escribe las novedades de caja</p>}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <Dialog open={confirmarCierre} onOpenChange={(o) => { if (!guardando) setConfirmarCierre(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="t-titulo">¿Cerrar el turno?</DialogTitle>
            <DialogDescription className="t-meta text-muted-foreground">
              Se guardará el cierre de {TODOS_ORIGENES.filter(o => origenes.has(o)).map(o => ORIGEN_CIERRE_TITULO[o]).join(', ')} por {dinero(resumen.totalCobrado)} cobrados.
              Los cobros de este resumen quedarán marcados como cerrados y el próximo cierre ya no los incluirá. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" disabled={guardando} onClick={() => setConfirmarCierre(false)}>Cancelar</Button>
            <Button type="button" disabled={guardando} onClick={cerrarTurno}>
              <LockKey size={18} weight="bold" /> {guardando ? 'Guardando…' : 'Cerrar turno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
