import { useState } from 'react';
import dayjs from 'dayjs';
import { ArrowsClockwise, Bed, Calculator, CheckCircle, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showToast } from '@/lib/toast';
import { useAuth } from '../../context/AuthContext';
import { Girando } from './Espera';
import { Contador } from './detalle/Contador';
import { EPS, dinero, plural } from './detalle/formatos';
import { getDisponibilidad, type ReservaCloudbedsDetalle } from '../../lib/cloudbeds';
import { habitacionDeUnidad, type HabitacionHotel } from '../../lib/hotelHabitacionesApi';
import { adoptarGrupoCloudbeds, convertirGrupoCloudbeds, type ReservaHotel } from '../../lib/hotelReservasApi';
import { asegurarVentaHotel } from '../../lib/hotelCobros';
import { evaluarConversionGrupo } from '../../lib/hotelConversionGrupo';

interface Props {
  det: ReservaCloudbedsDetalle;
  habitaciones: HabitacionHotel[];
  onClose: () => void;
  onHecha: (reservas: ReservaHotel[]) => void;
}

/**
 * Adopta en el POS una reserva de Cloudbeds con varias habitaciones (WhatsApp, Booking, motor de reservas). Cloudbeds da el total
 * de toda la reserva, no el de cada habitación: la tarifa de cada una se escribe a mano, una por una, verificándola en Cloudbeds.
 * Se crea una reserva del POS por habitación (un grupo) y una sola venta que las cubre.
 */
export function AdoptarGrupoDialog({ det, habitaciones, onClose, onHecha }: Props) {
  const { currentMesero } = useAuth();
  const [filas, setFilas] = useState(() => {
    // Cloudbeds da el total de cada habitación dentro de la reserva (a veces con impuestos incluidos): se reparte el hospedaje
    // del desglose en proporción a esos totales, de modo que la suma cuadre. Sin totales por habitación, se escribe a mano.
    const totales = det.habitaciones.map((h) => h.total ?? 0);
    const suma = totales.reduce((a, t) => a + t, 0);
    const hospedaje = det.desglose && det.desglose.hospedaje > 0 ? det.desglose.hospedaje : suma;
    let acumulado = 0;
    const sugeridas = suma > 0 && totales.every((t) => t > 0)
      ? totales.map((t, i) => {
        const v = i === totales.length - 1 ? Math.round((hospedaje - acumulado) * 100) / 100 : Math.round((hospedaje * t / suma) * 100) / 100;
        acumulado += v;
        return v.toFixed(2);
      })
      : totales.map(() => '');
    return det.habitaciones.map((h, i) => ({
      roomTypeID: h.roomTypeID,
      roomID: h.roomID ?? null,
      cabana: habitacionDeUnidad(habitaciones, h.roomTypeID, h.roomID)?.nombre ?? h.nombreUnidad ?? h.nombre,
      adultos: Math.max(1, h.adultos),
      ninos: Math.max(0, h.ninos),
      tarifa: sugeridas[i],
    }));
  });
  const [tarifasDeCloudbeds] = useState(() => det.habitaciones.length > 0 && det.habitaciones.every((h) => (h.total ?? 0) > 0));
  const [guardando, setGuardando] = useState(false);
  const [confirmandoConv, setConfirmandoConv] = useState(false);
  const [calculando, setCalculando] = useState(false);

  const cambiar = (i: number, patch: Partial<(typeof filas)[number]>) => setFilas((a) => a.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const tarifas = filas.map((f) => parseFloat(f.tarifa));
  const completas = tarifas.every((t) => Number.isFinite(t) && t >= 0) && filas.every((f) => f.tarifa.trim() !== '');
  const suma = tarifas.reduce((a, t) => a + (Number.isFinite(t) ? t : 0), 0);
  // Contra qué se compara: el hospedaje de Cloudbeds (sin extras ni impuestos que se cargan aparte), o su total si no lo desglosa.
  const esperado = det.desglose?.hospedaje ?? det.total;
  const dif = Math.round((suma - esperado) * 100) / 100;
  const noches = dayjs(det.salida).diff(dayjs(det.llegada), 'day');
  const huesped = `${det.huesped.nombre} ${det.huesped.apellido}`.trim() || 'Huésped';

  const confirmar = async () => {
    if (!completas) return;
    setGuardando(true);
    try {
      const creadas = await adoptarGrupoCloudbeds(det, filas.map((f, i) => ({ roomTypeID: f.roomTypeID, roomID: f.roomID, cabana: f.cabana, adultos: f.adultos, ninos: f.ninos, tarifa: tarifas[i] })), { usuarioNombre: currentMesero?.nombre });
      // Una sola venta para todo el grupo, para que los pagos se registren dentro de ella. Si falla, el primer pago la crea.
      try { await asegurarVentaHotel(creadas[0], currentMesero?.id, creadas); } catch (e) {
        console.warn('No se pudo crear la venta del grupo adoptado', e);
        showToast.warning('El grupo quedó adoptado, pero no su venta', 'Se creará con el primer pago, o usa «Verificar enlace».');
      }
      showToast.success(`Grupo adoptado · ${plural(creadas.length, 'habitación', 'habitaciones')}`, `${huesped} · ${dayjs(det.llegada).format('DD/MM')} al ${dayjs(det.salida).format('DD/MM')}`);
      onHecha(creadas);
    } catch (e) {
      showToast.fallo('adoptar el grupo', e);
      setGuardando(false);
    }
  };

  const conversion = evaluarConversionGrupo(det, habitaciones);
  const llenas = filas.filter((f) => f.tarifa.trim() !== '').length;
  const [igual, setIgual] = useState('');
  const aplicarIgual = () => { if (Number.isFinite(parseFloat(igual))) setFilas((a) => a.map((f) => ({ ...f, tarifa: igual }))); };

  // Cotiza cada habitación en Cloudbeds con sus adultos y niños (el mismo cálculo del editor de fechas: la habitación ocupada por esta
  // misma reserva igual devuelve su tarifa) y rellena las tarifas. Es la tarifa estándar: si la original tenía descuentos o precio
  // especial, la diferencia sale abajo y se corrige a mano.
  const calcularTarifas = async () => {
    setCalculando(true);
    try {
      const res = await Promise.allSettled(filas.map((f) => getDisponibilidad(det.llegada, det.salida, f.adultos, f.ninos, { roomTypeIDs: [f.roomTypeID] })));
      const falladas: string[] = [];
      setFilas((a) => a.map((f, i) => {
        const r = res[i];
        const o = r.status === 'fulfilled' ? r.value.ofertas.find((x) => x.roomTypeID === f.roomTypeID) : undefined;
        const total = o ? (o.totalRate > 0 ? o.totalRate : o.noches.reduce((t, n) => t + n.rate, 0)) : 0;
        if (!o || !(total > 0)) { falladas.push(f.cabana); return f; }
        return { ...f, tarifa: total.toFixed(2) };
      }));
      if (falladas.length > 0) showToast.warning('No se pudo calcular algunas tarifas', `Escríbelas a mano: ${falladas.join(', ')}`);
      else showToast.success('Tarifas calculadas con Cloudbeds', 'Revísalas contra el hospedaje de Cloudbeds antes de adoptar.');
    } catch (e) {
      showToast.fallo('calcular las tarifas', e);
    } finally {
      setCalculando(false);
    }
  };

  const convertir = async () => {
    if (!completas) return;
    setGuardando(true);
    try {
      const lineas = filas.map((f, i) => ({ roomTypeID: f.roomTypeID, roomID: f.roomID, cabana: f.cabana, codigo: habitacionDeUnidad(habitaciones, f.roomTypeID, f.roomID)?.codigo ?? null, adultos: f.adultos, ninos: f.ninos, tarifa: tarifas[i] }));
      const { reservas, resultados } = await convertirGrupoCloudbeds(det, lineas, { usuarioId: currentMesero?.id, usuarioNombre: currentMesero?.nombre });
      const vivas = reservas.filter((_, i) => resultados[i].sync !== 'error');
      if (vivas.length > 1) {
        try { await asegurarVentaHotel(vivas[0], currentMesero?.id, vivas); } catch (e) {
          console.warn('No se pudo crear la venta del grupo convertido', e);
          showToast.warning('El grupo se convirtió, pero no su venta', 'Se creará con el primer pago, o usa «Verificar enlace».');
        }
      }
      const rechazadas = reservas.filter((_, i) => resultados[i].sync === 'error');
      const pendientes = resultados.filter((r) => r.sync === 'pendiente').length;
      if (rechazadas.length > 0) {
        showToast.error(`Cloudbeds rechazó ${rechazadas.map((r) => r.cabana).join(', ')}`, 'La reserva original ya estaba cancelada: crea esas habitaciones de nuevo con «Nueva reserva».');
      }
      if (pendientes > 0) showToast.warning(`${plural(pendientes, 'habitación quedó', 'habitaciones quedaron')} sin subir a Cloudbeds`, 'Están guardadas en el POS y se reintentan solas. Revísalas en «Por sincronizar».');
      if (rechazadas.length === 0 && pendientes === 0) showToast.success(`Grupo convertido · ${plural(vivas.length, 'reserva', 'reservas')}`, `${huesped} · ${dayjs(det.llegada).format('DD/MM')} al ${dayjs(det.salida).format('DD/MM')}`);
      onHecha(vivas.length > 0 ? vivas : reservas);
    } catch (e) {
      showToast.fallo('convertir el grupo', e);
      setGuardando(false);
      setConfirmandoConv(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !guardando) onClose(); }}>
      {/* Con muchas habitaciones solo se desplaza la lista: el encabezado y el resumen con los botones quedan siempre a la vista. */}
      <DialogContent className="max-w-2xl max-h-[92dvh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="t-titulo flex items-center gap-2"><UsersThree size={20} aria-hidden /> Adoptar grupo de Cloudbeds · {plural(filas.length, 'habitación', 'habitaciones')}</DialogTitle>
          <DialogDescription className="t-meta">
            {huesped} · {dayjs(det.llegada).format('D MMM')} → {dayjs(det.salida).format('D MMM')} · {plural(noches, 'noche', 'noches')} · {det.fuente ?? 'Cloudbeds'} · reserva {det.reservationID}.
            {tarifasDeCloudbeds ? 'Las tarifas salen del total de cada habitación en Cloudbeds: revísalas.' : 'Cloudbeds trae un solo total: escribe la tarifa de cada habitación verificándola allá.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 t-meta text-muted-foreground">
          <span className="flex items-center gap-3">
            <span><b className="text-foreground tabular-nums">{llenas} de {filas.length}</b> tarifas escritas</span>
            <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => void calcularTarifas()} disabled={calculando || guardando} title="Cotiza cada habitación en Cloudbeds con sus adultos y niños">
              {calculando ? <Girando /> : <Calculator size={14} weight="bold" />} Calcular con Cloudbeds
            </Button>
          </span>
          <label className="flex items-center gap-1.5">
            Misma tarifa para todas $
            <Input value={igual} onChange={(e) => setIgual(e.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Tarifa para todas las habitaciones"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarIgual(); } }} className="h-9 w-24 text-base tabular-nums" />
            <Button type="button" variant="outline" className="h-9" onClick={aplicarIgual} disabled={!Number.isFinite(parseFloat(igual))}>Aplicar</Button>
          </label>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-border bg-card">
          <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto_auto_6.5rem] items-center gap-3 bg-muted px-3 py-1.5 t-etiqueta text-muted-foreground">
            <span>Habitación</span><span className="w-[7.5rem] text-center">Adultos</span><span className="w-[7.5rem] text-center">Niños</span><span>Tarifa $</span>
          </div>
          <ul className="divide-y divide-border">
            {filas.map((f, i) => (
              <li key={`${f.roomTypeID}-${f.roomID ?? i}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto_6.5rem] items-center gap-3 px-3 py-2">
                <span className="flex items-center gap-2 t-cuerpo-fuerte min-w-0"><Bed size={16} className="text-muted-foreground shrink-0" aria-hidden /><span className="truncate" title={f.cabana}>{f.cabana}</span></span>
                <span className="w-[7.5rem] flex justify-center"><Contador etiquetaTexto={`Adultos de ${f.cabana}`} valor={f.adultos} min={1} max={20} onCambio={(n) => cambiar(i, { adultos: n })} compacto enLinea /></span>
                <span className="w-[7.5rem] flex justify-center"><Contador etiquetaTexto={`Niños de ${f.cabana}`} valor={f.ninos} min={0} max={20} onCambio={(n) => cambiar(i, { ninos: n })} compacto enLinea /></span>
                <Input value={f.tarifa} onChange={(e) => cambiar(i, { tarifa: e.target.value })} inputMode="decimal" placeholder="0.00" aria-label={`Tarifa de ${f.cabana}`} className="h-10 text-base tabular-nums" />
              </li>
            ))}
          </ul>
        </div>

        <details className="rounded-xl border border-border bg-card px-3 py-2 t-meta group/conv">
          <summary className="flex items-center gap-2 cursor-pointer list-none t-cuerpo-fuerte">
            <ArrowsClockwise size={16} aria-hidden className="text-muted-foreground shrink-0" />
            <span className="flex-1">Convertir en reservas individuales (opcional)</span>
            {conversion.convertible
              ? <span className="flex items-center gap-1 text-success"><CheckCircle size={16} weight="fill" aria-hidden /> Se puede</span>
              : <span className="flex items-center gap-1 text-warning-foreground"><WarningCircle size={16} weight="fill" aria-hidden /> No se puede</span>}
          </summary>
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-muted-foreground">Cancelaría esta reserva en Cloudbeds y crearía una reserva por habitación desde el POS, para gestionarlas una a una (habitación, fechas, personas, cancelar una sola). Escribe antes la tarifa de cada habitación.</p>
            {conversion.bloqueos.length > 0 && (
              <ul className="list-disc pl-5 text-destructive flex flex-col gap-0.5">{conversion.bloqueos.map((b) => <li key={b}>{b}</li>)}</ul>
            )}
            <ul className="list-disc pl-5 text-muted-foreground flex flex-col gap-0.5">{conversion.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
            {conversion.convertible && !confirmandoConv && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setConfirmandoConv(true)} disabled={!completas || guardando} title={completas ? undefined : 'Escribe primero la tarifa de cada habitación'}>Convertir en reservas individuales…</Button>
              </div>
            )}
            {conversion.convertible && confirmandoConv && (
              <div className="flex flex-col gap-2 rounded-xl bg-destructive-soft p-3">
                <span className="t-cuerpo-fuerte text-destructive">¿Cancelar la reserva {det.reservationID} en Cloudbeds y crear {plural(filas.length, 'reserva nueva', 'reservas nuevas')}?</span>
                <span className="text-destructive">Se cancela primero en Cloudbeds y después se crea cada habitación. Esto no se puede deshacer. Si ya migraste los pagos al Centro de Ventas, continúa.</span>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setConfirmandoConv(false)} disabled={guardando}>No</Button>
                  <Button type="button" variant="destructive" onClick={() => void convertir()} disabled={guardando}>{guardando ? <><Girando /> Convirtiendo…</> : 'Sí, convertir'}</Button>
                </div>
              </div>
            )}
          </div>
        </details>

        <div className="flex flex-col gap-0.5 rounded-xl bg-muted/60 px-3 py-2 t-meta tabular-nums">
          <span className="flex justify-between"><span className="text-muted-foreground">Suma de tarifas</span><b className="text-foreground">{dinero(suma)}</b></span>
          <span className="flex justify-between"><span className="text-muted-foreground">Hospedaje en Cloudbeds</span><b className="text-foreground">{dinero(esperado)}</b></span>
          {completas && Math.abs(dif) > EPS && <span className="text-warning-foreground">Difieren en {dinero(Math.abs(dif))}: revisa las tarifas (puedes adoptar igual).</span>}
          {completas && Math.abs(dif) <= EPS && <span className="text-success">Las tarifas cuadran con Cloudbeds.</span>}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button type="button" onClick={() => void confirmar()} disabled={!completas || guardando}>{guardando ? <><Girando /> Adoptando…</> : 'Adoptar grupo'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
