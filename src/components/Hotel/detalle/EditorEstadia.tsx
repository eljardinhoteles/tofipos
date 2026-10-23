import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { ArrowRight, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateRangePickerField } from '@/components/ui/date-range-picker-field';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import { getDisponibilidad, type OfertaCabana } from '../../../lib/cloudbeds';
import { ajustarVentaPorCambioHotel, cambiarFechasGrupoReservasHotel, cambiarFechasReservaHotel, cambiarPlanReservaHotel, leerReservaHotel, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { Contador } from './Contador';
import { SelectorPlan } from './SelectorPlan';
import { copiaDePlan, type PlanAlimentacion } from '../../../lib/hotelPlanesApi';
import { dinero, etiquetaCampo, fechaCorta, plural } from './formatos';

const MAX_NOCHES = 30;

interface Props {
  /** Qué se edita: las fechas (en grupo, a todas las habitaciones) o los huéspedes de esta habitación. */
  modo: 'fechas' | 'huespedes';
  r: ReservaHotel;
  /** Reservas vigentes del mismo grupo (incluida esta). */
  grupo: ReservaHotel[];
  usuario?: string;
  /** Planes de alimentación activos: en «huéspedes» se puede cambiar el plan junto con los huéspedes. */
  planes?: PlanAlimentacion[];
  /** Solo el plan (reservas de canales externos: sus huéspedes no se tocan). */
  soloPlan?: boolean;
  /** Fechas ya puestas (p. ej. al arrastrar la reserva en el calendario): se calcula la tarifa al abrir. */
  fechasIniciales?: { llegada: string; salida: string };
  onCancelar: () => void;
  onGuardado: () => void;
  onSucio: (sucio: boolean) => void;
}

interface Cotizacion {
  /** Tarifa estimada de Cloudbeds para el rango nuevo (suma de las noches). */
  total: number;
  /** Noches nuevas que Cloudbeds no tiene libres. */
  bloqueadas: string[];
  capacidad: number | null;
  /** Cloudbeds no devolvió la habitación para esa ocupación (no cabe). */
  noAdmite: boolean;
}

/**
 * Cambiar fechas y huéspedes de una reserva. Se calcula lo que cambia ANTES de guardar: la habitación ocupada por esta misma
 * reserva aparece «no disponible» en sus propias noches, así que solo se exige que estén libres las noches NUEVAS. Si es de un
 * grupo se puede aplicar la misma fecha a todas las habitaciones (cada una se valida en Cloudbeds al guardar).
 */
export function EditorEstadia({ modo, r, grupo, usuario, planes = [], soloPlan, fechasIniciales, onCancelar, onGuardado, onSucio }: Props) {
  const [llegada, setLlegada] = useState(fechasIniciales?.llegada ?? r.llegada);
  const [salida, setSalida] = useState(fechasIniciales?.salida ?? r.salida);
  const [adultos, setAdultos] = useState(r.adultos);
  const [ninos, setNinos] = useState(r.ninos);
  const [planId, setPlanId] = useState<string | null>(r.plan_alimentacion?.id ?? null);
  const [aTodoElGrupo, setATodoElGrupo] = useState(grupo.length > 1);
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const noches = dayjs(salida).diff(dayjs(llegada), 'day');
  const fechasOk = noches >= 1 && noches <= MAX_NOCHES;
  const cambiaFechas = modo === 'fechas' && (llegada !== r.llegada || salida !== r.salida);
  const cambiaGente = modo === 'huespedes' && (adultos !== r.adultos || ninos !== r.ninos);
  const cambiaPlan = modo === 'huespedes' && planes.length > 0 && planId !== (r.plan_alimentacion?.id ?? null);
  const hayCambios = cambiaFechas || cambiaGente || cambiaPlan;
  // Fechas o huéspedes se calculan antes con Cloudbeds; cambiar solo el plan no necesita calcular.
  const necesitaCalculo = cambiaFechas || cambiaGente;
  // Un grupo adoptado de Cloudbeds (una reserva con varias habitaciones) cambia siempre todo junto y solo en el POS.
  const adoptadoDeCloudbeds = !!r.cloudbeds_grupo_ref && grupo.length > 1;
  const modoGrupo = modo === 'fechas' && (adoptadoDeCloudbeds || aTodoElGrupo) && grupo.length > 1;
  // En grupo solo se cambian las fechas (cada habitación conserva sus huéspedes).
  const hayCambiosEfectivos = modoGrupo ? cambiaFechas : hayCambios;

  useEffect(() => { onSucio(hayCambios); }, [hayCambios, onSucio]);

  const alCambiar = () => { setCot(null); setError(''); };
  // Con fechas ya puestas se calcula al abrir (en grupo no hay vista previa: se valida al guardar).
  useEffect(() => { if (fechasIniciales && modo === 'fechas' && !(r.grupo_id && grupo.length > 1)) void calcular(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const calcular = async () => {
    if (!fechasOk) return;
    setCalculando(true);
    setError('');
    try {
      const resp = await getDisponibilidad(llegada, salida, adultos, ninos, { roomTypeIDs: [r.room_type_id] });
      const o: OfertaCabana | undefined = resp.ofertas.find((x) => x.roomTypeID === r.room_type_id);
      if (!o) { setCot({ total: 0, bloqueadas: [], capacidad: null, noAdmite: true }); return; }
      const nuevas = o.noches.filter((n) => !(n.date >= r.llegada && n.date < r.salida));
      setCot({
        // totalRate es lo que Cloudbeds cobra por la ocupación pedida (incluye adultos o niños extra); la suma por noche, no.
        total: o.totalRate > 0 ? o.totalRate : o.noches.reduce((a, n) => a + n.rate, 0),
        bloqueadas: nuevas.filter((n) => !n.disponible).map((n) => n.date),
        capacidad: o.capacidad ?? null,
        noAdmite: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar Cloudbeds');
    } finally {
      setCalculando(false);
    }
  };

  const excede = cot?.capacidad != null && adultos + ninos > cot.capacidad;
  const problema = cot ? (cot.noAdmite ? `La habitación no admite ${plural(adultos, 'adulto', 'adultos')}${ninos ? ` y ${plural(ninos, 'niño', 'niños')}` : ''}.`
    : excede ? `La habitación admite hasta ${cot.capacidad} personas.`
    : cot.bloqueadas.length > 0 ? `No hay disponibilidad las noches del ${cot.bloqueadas.map(fechaCorta).join(', ')}.` : '') : '';
  // En grupo no hay vista previa (cada habitación tiene su propia tarifa): se valida al guardar.
  const puedeGuardar = fechasOk && hayCambiosEfectivos && !guardando && (modoGrupo || !necesitaCalculo || (cot !== null && !problema));

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      if (modoGrupo) {
        const g = await cambiarFechasGrupoReservasHotel(grupo, llegada, salida);
        if (g.fallos.length > 0) showToast.warning(`${g.cambiadas} de ${grupo.length} habitaciones cambiadas`, g.fallos.map((f) => `${f.cabana}: ${f.mensaje}`).join(' · '));
        else if (g.tarifaManualRevisar > 0) showToast.warning('Fechas del grupo actualizadas', `${g.tarifaManualRevisar} con tarifa manual del POS: no cambió, revísala si hace falta.`);
        else if (adoptadoDeCloudbeds) showToast.warning('Fechas del grupo actualizadas en el POS', 'Cámbialas también en Cloudbeds, y revisa las tarifas si cambió la duración.');
        else showToast.success('Fechas del grupo actualizadas', 'Cloudbeds recalculó las tarifas si cambió la duración.');
      } else {
        if (cambiaFechas || cambiaGente) {
          const res = await cambiarFechasReservaHotel(r, llegada, salida, { adultos, ninos, usuario, totalEstimado: cot && !cot.noAdmite ? cot.total : null });
          if (r.cloudbeds_grupo_ref) showToast.warning('Estadía actualizada solo en el POS', 'Cámbiala también en Cloudbeds. La tarifa no cambió: revísala si hace falta.');
          else if (res.tarifaManualRevisar) showToast.warning('Estadía actualizada', 'La tarifa del POS es manual y no cambió: revísala si hace falta.');
          else showToast.success('Estadía actualizada', 'Cloudbeds recalculó la tarifa si cambió la duración.');
        }
        if (cambiaPlan) {
          // Con los huéspedes ya guardados: el importe del plan nuevo se calcula con los adultos y niños vigentes.
          const base = (cambiaGente ? await leerReservaHotel(r.id) : null) ?? r;
          const elegido = planes.find((x) => x.id === planId);
          await cambiarPlanReservaHotel(base, elegido ? copiaDePlan(elegido) : null, usuario);
          if (!cambiaGente) showToast.success(elegido ? 'Plan actualizado' : 'Plan quitado');
        }
      }
      // La venta del Centro de Ventas acompaña el cambio de tarifa: se ajusta por la diferencia, sin tocar nada más.
      const aj = await ajustarVentaPorCambioHotel(modoGrupo ? grupo : [r], modo === 'huespedes' ? (cambiaGente ? 'Cambio de huéspedes desde el Hotel' : 'Plan de alimentación') : 'Cambio de fechas desde el Hotel');
      if (aj !== 0) showToast.info('Venta ajustada', `Se agregó un ajuste de ${aj > 0 ? '+' : '−'}${dinero(Math.abs(aj))} en el Centro de Ventas.`);
      onSucio(false);
      onGuardado();
    } catch (e) {
      // Cloudbeds rechazó el cambio (sin disponibilidad, restricción…): se muestra la razón y no se guarda nada.
      setError(e instanceof Error ? e.message : 'Cloudbeds no aceptó el cambio');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {modo === 'fechas' && <div className="flex flex-col gap-1.5">
        <span className={etiquetaCampo}>Llegada y salida</span>
        <DateRangePickerField desde={llegada} hasta={salida} minimo={dayjs().subtract(1, 'day').format('YYYY-MM-DD')} maxNoches={MAX_NOCHES}
          sufijo={fechasOk ? plural(noches, 'noche', 'noches') : undefined} onChange={(d, h) => { setLlegada(d); setSalida(h); alCambiar(); }} aria-label="Cambiar llegada y salida" />
      </div>}

      {modo === 'huespedes' && !soloPlan && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <Contador etiquetaTexto="Adultos" valor={adultos} min={1} max={20} onCambio={(n) => { setAdultos(n); alCambiar(); }} />
          <Contador etiquetaTexto="Niños" valor={ninos} min={0} max={20} onCambio={(n) => { setNinos(n); alCambiar(); }} />
        </div>
      )}

      {modo === 'huespedes' && planes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={etiquetaCampo}>Plan de alimentación</span>
          <SelectorPlan planes={planes} valor={planId} onChange={setPlanId} adultos={adultos} ninos={ninos} noches={dayjs(r.salida).diff(dayjs(r.llegada), 'day')} />
        </div>
      )}

      {modo === 'fechas' && grupo.length > 1 && adoptadoDeCloudbeds && (
        <p className="t-meta rounded-xl bg-muted text-muted-foreground px-3 py-2">Este grupo viene de Cloudbeds: las fechas cambian en todas las habitaciones a la vez y solo en el POS. Cámbialas también en Cloudbeds.</p>
      )}

      {modo === 'fechas' && grupo.length > 1 && !adoptadoDeCloudbeds && (
        <label className="flex items-start gap-3 py-1 cursor-pointer">
          <Checkbox checked={aTodoElGrupo} onCheckedChange={(v) => { setATodoElGrupo(v === true); alCambiar(); }} className="mt-0.5" />
          <span className="flex flex-col">
            <span className="t-cuerpo-fuerte">Aplicar las fechas a todo el grupo ({grupo.length} habitaciones)</span>
            <span className="t-meta text-muted-foreground">Cada habitación se valida por separado en Cloudbeds; los huéspedes de cada una no cambian.</span>
          </span>
        </label>
      )}

      {!modoGrupo && cot && !cot.noAdmite && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-y border-border py-3" aria-label="Antes y después">
          <div className="flex flex-col gap-0.5">
            <span className={etiquetaCampo}>Antes</span>
            <span className="t-cuerpo-fuerte">{fechaCorta(r.llegada)} → {fechaCorta(r.salida)}</span>
            <span className="t-meta text-muted-foreground">{plural(r.adultos, 'adulto', 'adultos')}{r.ninos ? `, ${plural(r.ninos, 'niño', 'niños')}` : ''}</span>
            <span className="t-meta text-muted-foreground">Cloudbeds {dinero(r.total_cloudbeds ?? r.total_estadia)}</span>
          </div>
          <ArrowRight size={18} className="text-muted-foreground" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <span className={etiquetaCampo}>Después</span>
            <span className="t-cuerpo-fuerte">{fechaCorta(llegada)} → {fechaCorta(salida)}</span>
            <span className="t-meta text-muted-foreground">{plural(adultos, 'adulto', 'adultos')}{ninos ? `, ${plural(ninos, 'niño', 'niños')}` : ''}</span>
            <span className="t-meta text-muted-foreground">Cloudbeds ≈ {dinero(cot.total)} <span className="opacity-70">(estimada)</span></span>
          </div>
        </div>
      )}
      {!modoGrupo && r.tarifa_manual && cot && !problema && (
        <p className="t-meta text-muted-foreground">La tarifa del POS es manual ({dinero(r.total_estadia)}) y se conserva; Cloudbeds usará la suya.</p>
      )}

      {(problema || error) && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft text-destructive px-3 py-2 t-meta">
          <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" /> {problema || error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Descartar</Button>
        {!modoGrupo && necesitaCalculo && cot === null ? (
          <Button type="button" className="h-11 gap-2" onClick={() => void calcular()} disabled={!fechasOk || !hayCambios || calculando}>
            {calculando ? <><Girando /> Calculando…</> : 'Calcular cambio'}
          </Button>
        ) : (
          <Button type="button" className="h-11 gap-2" onClick={() => void guardar()} disabled={!puedeGuardar}>
            {guardando ? <><Girando /> Guardando…</> : 'Guardar cambios'}
          </Button>
        )}
      </div>
    </div>
  );
}
