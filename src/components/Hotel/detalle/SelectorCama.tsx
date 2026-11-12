import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/toast';
import { cambiarCamaReservaHotel, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { etiquetaCampo } from './formatos';
import { CamasSelect } from './CamasSelect';

interface Props {
  r: ReservaHotel;
  /** Camas que admite la habitación (ajustes de habitación). */
  camas: string[];
  /** Quien puede gestionar el hotel; si no, solo se ve. */
  puedeEditar: boolean;
  usuario?: string;
  onCambio: (r: ReservaHotel) => void;
  /** Si se pasa, aparece «Descartar» y se llama al cerrar sin guardar. */
  onDescartar?: () => void;
}

/** Tipo de cama de la reserva. Se cambia al instante y es solo del POS: no va a Cloudbeds ni afecta la disponibilidad. */
export function SelectorCama({ r, camas, puedeEditar, usuario, onCambio, onDescartar }: Props) {
  const [guardando, setGuardando] = useState(false);
  // La cama se elige y solo se guarda con «Guardar»: un toque de más no la cambia.
  const [borrador, setBorrador] = useState<string | null>(r.cama);
  if (camas.length === 0 && !r.cama) return null;

  const guardar = async () => {
    const cama = borrador;
    setGuardando(true);
    try {
      onCambio(await cambiarCamaReservaHotel(r, cama, usuario));
      showToast.success(cama ? 'Cama actualizada' : 'Cama quitada', 'Solo en el POS: no cambia Cloudbeds ni la disponibilidad.');
    } catch (e) {
      showToast.fallo('cambiar la cama', e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className={etiquetaCampo}>Cama</span>
      {puedeEditar ? (
        <>
          <CamasSelect camas={camas} valor={borrador} onChange={setBorrador} disabled={guardando} etiqueta="Tipo de cama" />
          <div className="flex justify-end gap-2">
            {onDescartar && <Button type="button" variant="ghost" className="h-11" onClick={onDescartar} disabled={guardando}>Descartar</Button>}
            <Button type="button" className="h-11" onClick={() => void guardar()} disabled={guardando || borrador === r.cama}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </>
      ) : (
        <span className="t-cuerpo-fuerte">{r.cama ?? '—'}</span>
      )}
    </div>
  );
}
