import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { Girando, SkeletonFilas } from '../Espera';
import { Contador } from './Contador';
import { getDisponibilidad, type OfertaCabana } from '../../../lib/cloudbeds';
import { claveEnlace, habitacionDeClave, habitacionDeUnidad, tipoDeClave, unidadDeClave, type HabitacionHotel } from '../../../lib/hotelHabitacionesApi';
import { unidadesOcupadasDesdeCalendario } from '../../../lib/hotelCalendarioCache';
import { expandirOfertasPorUnidad } from '../../../lib/hotelUnidades';
import { agregarHabitacionAReservaHotel, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { dinero, etiquetaCampo, plural } from './formatos';

interface Props {
  r: ReservaHotel;
  habitaciones: HabitacionHotel[];
  usuario?: string;
  onCancelar: () => void;
  /** Reserva nueva ya creada. */
  onGuardado: () => void;
  onSucio: (sucio: boolean) => void;
}

/** Añadir otra habitación a la reserva: mismas fechas y mismo huésped; las dos quedan en un grupo. */
export function EditorAgregarHabitacion({ r, habitaciones, usuario, onCancelar, onGuardado, onSucio }: Props) {
  const [adultos, setAdultos] = useState(1);
  const [ninos, setNinos] = useState(0);
  const [ofertas, setOfertas] = useState<OfertaCabana[] | null>(null);
  const [error, setError] = useState('');
  const [elegida, setElegida] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [modoTarifa, setModoTarifa] = useState<'cloudbeds' | 'otra'>('cloudbeds');
  const [tarifaOtra, setTarifaOtra] = useState('');

  useEffect(() => {
    let vigente = true;
    setOfertas(null);
    setError('');
    setElegida(null);
    (async () => {
      const resp = await getDisponibilidad(r.llegada, r.salida, adultos, ninos);
      const ocupadas = habitaciones.some((h) => h.cloudbeds_room_id) ? await unidadesOcupadasDesdeCalendario(r.llegada, r.salida, 0).catch(() => null) : null;
      return expandirOfertasPorUnidad(resp.ofertas, habitaciones, ocupadas);
    })()
      .then((lista) => {
        if (!vigente) return;
        // La habitación que ya tiene la reserva no se ofrece (si es de tipo único); las unidades sueltas sí, salvo la propia.
        const propia = claveEnlace(r.room_type_id, r.room_id);
        setOfertas(lista.filter((o) => o.reservable && o.roomTypeID !== propia && !(r.room_id == null && o.roomTypeID === r.room_type_id && !habitaciones.some((h) => h.cloudbeds_room_id))));
      })
      .catch((e) => { if (vigente) setError(e instanceof Error ? e.message : 'No se pudo consultar Cloudbeds'); });
    return () => { vigente = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `habitaciones` cambia de identidad con cada recarga y no debe repetir la consulta
  }, [r.llegada, r.salida, r.room_type_id, r.room_id, adultos, ninos]);

  useEffect(() => { onSucio(elegida !== null); }, [elegida, onSucio]);

  const nombreDe = (o: OfertaCabana) => habitacionDeClave(habitaciones, o.roomTypeID)?.nombre ?? o.roomTypeName;
  const destino = useMemo(() => ofertas?.find((o) => o.roomTypeID === elegida) ?? null, [ofertas, elegida]);
  const otraValida = modoTarifa !== 'otra' || (Number.isFinite(parseFloat(tarifaOtra)) && parseFloat(tarifaOtra) >= 0);

  const guardar = async () => {
    if (!destino || !otraValida) return;
    setGuardando(true);
    setError('');
    try {
      const hab = habitacionDeClave(habitaciones, destino.roomTypeID);
      const { reserva, sync, mensaje } = await agregarHabitacionAReservaHotel(r, {
        roomTypeID: tipoDeClave(destino.roomTypeID),
        roomID: unidadDeClave(destino.roomTypeID),
        cabana: nombreDe(destino),
        codigo: hab?.codigo,
        codigoActual: habitacionDeUnidad(habitaciones, r.room_type_id, r.room_id)?.codigo,
        rateID: destino.rateID,
        adultos, ninos,
        totalEstadia: destino.totalRate,
        totalManual: modoTarifa === 'otra' ? parseFloat(tarifaOtra) : null,
        motivoTarifa: modoTarifa === 'otra' ? 'Tarifa fijada al añadir la habitación' : undefined,
      }, usuario);
      if (sync === 'sincronizada') showToast.success('Habitación añadida', `${reserva.cabana} se unió a la reserva`);
      else if (sync === 'pendiente') showToast.warning('Habitación añadida', mensaje || 'Quedó pendiente de subir a Cloudbeds');
      else { setError(mensaje || 'Cloudbeds rechazó la habitación'); onGuardado(); return; }
      onSucio(false);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo añadir la habitación');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className={etiquetaCampo}>Habitación adicional</span>
        <p className="t-cuerpo text-muted-foreground">Libres del {dayjs(r.llegada).format('D MMM')} al {dayjs(r.salida).format('D MMM')}, con el mismo huésped. Quedan en un grupo.</p>
      </div>
      <div className="flex flex-wrap gap-4">
        <Contador etiquetaTexto="Adultos" valor={adultos} min={1} max={10} onCambio={setAdultos} />
        <Contador etiquetaTexto="Niños" valor={ninos} min={0} max={10} onCambio={setNinos} />
      </div>
      {!ofertas && !error && <SkeletonFilas n={3} alto="h-14" />}
      {ofertas && ofertas.length === 0 && <p className="t-meta text-muted-foreground">No hay otra habitación libre en esas fechas para {plural(adultos + ninos, 'huésped', 'huéspedes')}.</p>}
      {ofertas && ofertas.length > 0 && (
        <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label="Habitación adicional">
          {ofertas.map((o) => {
            const activa = o.roomTypeID === elegida;
            return (
              <li key={o.roomTypeID}>
                <button type="button" role="radio" aria-checked={activa} onClick={() => setElegida(o.roomTypeID)}
                  className={cn('w-full min-h-12 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left cursor-pointer transition-colors', activa ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/60')}>
                  <span className="t-cuerpo-fuerte truncate">{nombreDe(o)}</span>
                  <span className="t-cuerpo-fuerte tabular-nums shrink-0">{dinero(o.totalRate)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {destino && (
        <div className="flex flex-col gap-1.5">
          <span className={etiquetaCampo}>Tarifa de la estadía</span>
          <div role="radiogroup" aria-label="Tarifa de la estadía" className="flex flex-col gap-1.5">
            {([['cloudbeds', 'La de Cloudbeds', dinero(destino.totalRate)], ['otra', 'Otra tarifa', '']] as const).map(([modo, titulo, valor]) => (
              <button key={modo} type="button" role="radio" aria-checked={modoTarifa === modo} onClick={() => setModoTarifa(modo)}
                className={cn('w-full min-h-11 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left cursor-pointer transition-colors', modoTarifa === modo ? 'border-primary bg-primary/5' : 'border-border hover:border-primary')}>
                <span className="t-cuerpo">{titulo}</span>
                {valor && <span className="t-cuerpo-fuerte tabular-nums">{valor}</span>}
              </button>
            ))}
          </div>
          {modoTarifa === 'otra' && (
            <Input value={tarifaOtra} onChange={(e) => setTarifaOtra(e.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Tarifa de la estadía" autoFocus className="h-11 text-base tabular-nums" />
          )}
          {modoTarifa === 'otra' && <p className="t-meta text-muted-foreground">Queda como tarifa manual del POS; Cloudbeds usa su tarifa.</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft text-destructive px-3 py-2 t-meta">
          <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Descartar</Button>
        <Button type="button" className="h-11 gap-2" onClick={() => void guardar()} disabled={!destino || !otraValida || guardando}>
          {guardando ? <><Girando /> Añadiendo…</> : destino ? `Añadir ${nombreDe(destino)}` : 'Elige una habitación'}
        </Button>
      </div>
    </div>
  );
}
