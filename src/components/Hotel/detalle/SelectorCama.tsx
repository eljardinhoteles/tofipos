import { useState } from 'react';
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
}

/** Tipo de cama de la reserva. Se cambia al instante y es solo del POS: no va a Cloudbeds ni afecta la disponibilidad. */
export function SelectorCama({ r, camas, puedeEditar, usuario, onCambio }: Props) {
  const [guardando, setGuardando] = useState(false);
  if (camas.length === 0 && !r.cama) return null;

  const cambiar = async (cama: string | null) => {
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
        <CamasSelect camas={camas} valor={r.cama} onChange={(v) => void cambiar(v)} disabled={guardando} etiqueta="Tipo de cama" />
      ) : (
        <span className="t-cuerpo-fuerte">{r.cama ?? '—'}</span>
      )}
    </div>
  );
}
