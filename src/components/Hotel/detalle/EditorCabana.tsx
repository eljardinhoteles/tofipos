import { useEffect, useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import { SkeletonFilas } from '../Espera';
import { getDisponibilidad, type OfertaCabana } from '../../../lib/cloudbeds';
import type { HabitacionHotel } from '../../../lib/hotelHabitacionesApi';
import { ajustarVentaPorCambioHotel, cambiarCabanaReservaHotel, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { dinero, etiquetaCampo, plural } from './formatos';

interface Props {
  r: ReservaHotel;
  habitaciones: HabitacionHotel[];
  usuario?: string;
  onCancelar: () => void;
  onGuardado: () => void;
  onSucio: (sucio: boolean) => void;
}

/** Cambiar la reserva a otra cabaña libre en las mismas fechas, con la tarifa de cada una para estos huéspedes. */
export function EditorCabana({ r, habitaciones, usuario, onCancelar, onGuardado, onSucio }: Props) {
  const [ofertas, setOfertas] = useState<OfertaCabana[] | null>(null);
  const [error, setError] = useState('');
  const [elegida, setElegida] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    getDisponibilidad(r.llegada, r.salida, r.adultos, r.ninos)
      .then((resp) => { if (vigente) setOfertas(resp.ofertas.filter((o) => o.reservable && o.roomTypeID !== r.room_type_id)); })
      .catch((e) => { if (vigente) setError(e instanceof Error ? e.message : 'No se pudo consultar Cloudbeds'); });
    return () => { vigente = false; };
  }, [r.llegada, r.salida, r.adultos, r.ninos, r.room_type_id]);

  useEffect(() => { onSucio(elegida !== null); }, [elegida, onSucio]);

  const nombreDe = (o: OfertaCabana) => habitaciones.find((h) => h.cloudbeds_room_type_id === o.roomTypeID)?.nombre ?? o.roomTypeName;
  const actual = r.total_cloudbeds ?? r.total_estadia;
  const destino = ofertas?.find((o) => o.roomTypeID === elegida) ?? null;

  const guardar = async () => {
    if (!destino) return;
    setGuardando(true);
    setError('');
    try {
      const nueva = await cambiarCabanaReservaHotel(r, { roomTypeID: destino.roomTypeID, nombre: nombreDe(destino) }, { usuario, totalEstimado: destino.totalRate });
      const aj = await ajustarVentaPorCambioHotel([r], 'Cambio de cabaña desde el Hotel');
      showToast.success('Cabaña cambiada', `${r.cabana} → ${nueva.cabana}${aj !== 0 ? ` · venta ajustada ${aj > 0 ? '+' : '−'}${dinero(Math.abs(aj))}` : ''}`);
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
      <span className={etiquetaCampo}>Cabañas libres del {r.llegada.split('-').reverse().join('/')} al {r.salida.split('-').reverse().join('/')} para {plural(r.adultos + r.ninos, 'huésped', 'huéspedes')}</span>
      {!ofertas && !error && <SkeletonFilas n={3} alto="h-14" />}
      {ofertas && ofertas.length === 0 && <p className="t-meta text-muted-foreground">No hay otra cabaña libre en esas fechas para estos huéspedes.</p>}
      {ofertas && ofertas.length > 0 && (
        <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label="Cabaña nueva">
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
      {r.tarifa_manual && elegida && <p className="t-meta text-muted-foreground">La tarifa del POS es manual ({dinero(r.total_estadia)}) y se conserva; Cloudbeds usará la de la cabaña nueva.</p>}
      {r.cama && elegida && <p className="t-meta text-muted-foreground">La cama «{r.cama}» se quita: cada cabaña tiene las suyas.</p>}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft text-destructive px-3 py-2 t-meta">
          <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Descartar</Button>
        <Button type="button" className="h-11 gap-2" onClick={() => void guardar()} disabled={!destino || guardando}>
          {guardando ? <><Girando /> Cambiando…</> : destino ? `Cambiar a ${nombreDe(destino)}` : 'Elige una cabaña'}
        </Button>
      </div>
    </div>
  );
}
