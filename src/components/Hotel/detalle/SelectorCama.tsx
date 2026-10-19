import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showToast } from '@/lib/toast';
import { cambiarCamaReservaHotel, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { etiquetaCampo } from './formatos';

const SIN_CAMA = '__sin__';

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
  // Si la cama guardada ya no está en la lista de la habitación, se sigue mostrando para no perderla de vista.
  const opciones = r.cama && !camas.includes(r.cama) ? [r.cama, ...camas] : camas;
  if (opciones.length === 0) return null;

  const cambiar = async (v: string) => {
    const cama = v === SIN_CAMA ? null : v;
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
        <Select value={r.cama ?? SIN_CAMA} onValueChange={(v) => void cambiar(v)} disabled={guardando}>
          <SelectTrigger className="data-[size=default]:h-11 w-full px-2.5 text-base rounded-2xl bg-card border-border shadow-xs" aria-label="Tipo de cama"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_CAMA} className="t-cuerpo">Sin definir</SelectItem>
            {opciones.map((c) => <SelectItem key={c} value={c} className="t-cuerpo">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <span className="t-cuerpo-fuerte">{r.cama ?? '—'}</span>
      )}
    </div>
  );
}
