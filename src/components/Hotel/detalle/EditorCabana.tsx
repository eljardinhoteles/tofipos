import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { WarningCircle } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import { SkeletonFilas } from '../Espera';
import { getDisponibilidad, type OfertaCabana } from '../../../lib/cloudbeds';
import { claveEnlace, habitacionDeClave, tipoDeClave, unidadDeClave, type HabitacionHotel } from '../../../lib/hotelHabitacionesApi';
import { unidadesOcupadasDesdeCalendario } from '../../../lib/hotelCalendarioCache';
import { expandirOfertasPorUnidad } from '../../../lib/hotelUnidades';
import { ajustarVentaPorCambioHotel, cambiarCabanaReservaHotel, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { dinero, etiquetaCampo, plural } from './formatos';

interface Props {
  r: ReservaHotel;
  habitaciones: HabitacionHotel[];
  usuario?: string;
  onCancelar: () => void;
  onGuardado: () => void;
  onSucio: (sucio: boolean) => void;
  /** Habitación ya elegida (clave «tipo» o «tipo|unidad»), p. ej. al arrastrar una reserva en el calendario: no se muestra la lista. */
  destinoInicial?: string;
}

/** Cambiar la reserva a otra habitación libre en las mismas fechas, con la tarifa de cada una para estos huéspedes. */
export function EditorCabana({ r, habitaciones, usuario, onCancelar, onGuardado, onSucio, destinoInicial }: Props) {
  const [ofertas, setOfertas] = useState<OfertaCabana[] | null>(null);
  const [error, setError] = useState('');
  const [elegida, setElegida] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Tarifa que queda: la de la habitación nueva, la actual, u otra que se escribe. Por defecto, una tarifa manual se conserva.
  const [modoTarifa, setModoTarifa] = useState<'nueva' | 'mantener' | 'otra'>(r.tarifa_manual ? 'mantener' : 'nueva');
  const [tarifaOtra, setTarifaOtra] = useState('');

  useEffect(() => {
    let vigente = true;
    // Los tipos con varias unidades se reparten entre sus unidades según el calendario; la propia unidad de la reserva no se ofrece.
    const propia = claveEnlace(r.room_type_id, r.room_id);
    (async () => {
      const resp = await getDisponibilidad(r.llegada, r.salida, r.adultos, r.ninos);
      const ocupadas = habitaciones.some((h) => h.cloudbeds_room_id) ? await unidadesOcupadasDesdeCalendario(r.llegada, r.salida, 0).catch(() => null) : null;
      return expandirOfertasPorUnidad(resp.ofertas, habitaciones, ocupadas);
    })()
      .then((lista) => {
        if (!vigente) return;
        if (destinoInicial) {
          // Con destino fijo solo importa esa habitación: si ya no está libre en Cloudbeds, se dice y no se ofrece nada más.
          const o = lista.find((x) => x.roomTypeID === destinoInicial && x.reservable);
          setOfertas(o ? [o] : []);
          if (o) setElegida(o.roomTypeID); else setError('Esa habitación ya no está libre para esas fechas en Cloudbeds.');
          return;
        }
        setOfertas(lista.filter((o) => o.reservable && o.roomTypeID !== propia && !(r.room_id == null && o.roomTypeID === r.room_type_id)));
      })
      .catch((e) => { if (vigente) setError(e instanceof Error ? e.message : 'No se pudo consultar Cloudbeds'); });
    return () => { vigente = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `habitaciones` cambia de identidad con cada recarga y no debe repetir la consulta
  }, [r.llegada, r.salida, r.adultos, r.ninos, r.room_type_id, r.room_id]);

  useEffect(() => { onSucio(elegida !== null); }, [elegida, onSucio]);

  const nombreDe = (o: OfertaCabana) => habitacionDeClave(habitaciones, o.roomTypeID)?.nombre ?? o.roomTypeName;
  const actual = r.total_cloudbeds ?? r.total_estadia;
  const destino = ofertas?.find((o) => o.roomTypeID === elegida) ?? null;

  const otraValida = modoTarifa !== 'otra' || (Number.isFinite(parseFloat(tarifaOtra)) && parseFloat(tarifaOtra) >= 0);
  const guardar = async () => {
    if (!destino || !otraValida) return;
    setGuardando(true);
    setError('');
    try {
      const nueva = await cambiarCabanaReservaHotel(r, { roomTypeID: tipoDeClave(destino.roomTypeID), roomID: unidadDeClave(destino.roomTypeID), nombre: nombreDe(destino) }, { usuario, totalEstimado: destino.totalRate, tarifa: { modo: modoTarifa, total: parseFloat(tarifaOtra) } });
      const aj = await ajustarVentaPorCambioHotel([r], 'Cambio de habitación desde el Hotel');
      showToast.success('Habitación cambiada', `${r.cabana} → ${nueva.cabana}${aj !== 0 ? ` · venta ajustada ${aj > 0 ? '+' : '−'}${dinero(Math.abs(aj))}` : ''}`);
      onSucio(false);
      onGuardado();
    } catch (e) {
      // Cloudbeds no aceptó el cambio: se muestra la razón y no se guarda nada.
      setError(e instanceof Error ? e.message : 'Cloudbeds no aceptó el cambio');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className={etiquetaCampo}>Habitación nueva</span>
        <p className="t-cuerpo text-muted-foreground">Libres del {dayjs(r.llegada).format('D MMM')} al {dayjs(r.salida).format('D MMM')} para {plural(r.adultos + r.ninos, 'huésped', 'huéspedes')}.</p>
      </div>
      {!ofertas && !error && <SkeletonFilas n={3} alto="h-14" />}
      {ofertas && ofertas.length === 0 && !destinoInicial && <p className="t-meta text-muted-foreground">No hay otra habitación libre en esas fechas para estos huéspedes.</p>}
      {ofertas && ofertas.length > 0 && (
        <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label="Habitación nueva">
          {ofertas.map((o) => {
            const dif = Math.round((o.totalRate - actual) * 100) / 100;
            const activa = o.roomTypeID === elegida;
            return (
              <li key={o.roomTypeID}>
                <button type="button" role="radio" aria-checked={activa} onClick={() => setElegida(o.roomTypeID)}
                  className={cn('w-full min-h-12 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left cursor-pointer transition-colors', activa ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/60')}>
                  <span className="t-cuerpo-fuerte truncate">{nombreDe(o)}</span>
                  <span className="flex flex-col items-end shrink-0">
                    <span className="t-cuerpo-fuerte tabular-nums">{dinero(o.totalRate)}</span>
                    {Math.abs(dif) >= 0.005 && <span className="t-meta text-muted-foreground tabular-nums">{dif > 0 ? '+' : '−'}{dinero(Math.abs(dif))} vs. actual</span>}
                  </span>
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
            {([
              ['nueva', 'La de la habitación nueva', dinero(destino.totalRate)],
              ['mantener', 'Mantener la tarifa actual', dinero(r.total_estadia)],
              ['otra', 'Otra tarifa', ''],
            ] as const).map(([modo, titulo, valor]) => (
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
          {modoTarifa !== 'nueva' && <p className="t-meta text-muted-foreground">Queda como tarifa manual del POS: no cambia sola cuando Cloudbeds la recalcule. Cloudbeds usa la tarifa de la habitación nueva.</p>}
        </div>
      )}
      {r.cama && elegida && <p className="t-meta text-muted-foreground">La cama «{r.cama}» se quita: cada habitación tiene las suyas.</p>}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft text-destructive px-3 py-2 t-meta">
          <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Descartar</Button>
        <Button type="button" className="h-11 gap-2" onClick={() => void guardar()} disabled={!destino || !otraValida || guardando}>
          {guardando ? <><Girando /> Cambiando…</> : destino ? `Cambiar a ${nombreDe(destino)}` : 'Elige una habitación'}
        </Button>
      </div>
    </div>
  );
}
