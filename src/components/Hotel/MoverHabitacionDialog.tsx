import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useUsuarioActual } from '../../hooks/useUsuarioActual';
import type { HabitacionHotel } from '../../lib/hotelHabitacionesApi';
import { nombreHuesped, type ReservaHotel } from '../../lib/hotelReservasApi';
import { EditorCabana } from './detalle/EditorCabana';

interface Props {
  r: ReservaHotel;
  habitaciones: HabitacionHotel[];
  /** Clave de la habitación a la que se soltó la reserva («tipo» o «tipo|unidad»). */
  destino: string;
  nombreDestino: string;
  onClose: () => void;
  /** Se movió: quien lo abrió recarga el calendario. */
  onHecho: () => void;
}

/**
 * Confirmación al arrastrar una reserva a otra habitación del calendario. Reutiliza el editor de «Cambiar habitación»: comprueba en
 * Cloudbeds que la habitación siga libre, muestra su tarifa y deja elegir cuál queda (la de la habitación nueva, la actual u otra).
 */
export function MoverHabitacionDialog({ r, habitaciones, destino, nombreDestino, onClose, onHecho }: Props) {
  // Usuario que opera (el local o, si no hay, el administrador): firma pagos y movimientos en el Centro de Ventas.
  const currentMesero = useUsuarioActual();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="t-titulo">Mover a {nombreDestino}</DialogTitle>
          <DialogDescription className="t-meta">{nombreHuesped(r)} · de {r.cabana} a {nombreDestino}, con las mismas fechas.</DialogDescription>
        </DialogHeader>
        <EditorCabana
          r={r} habitaciones={habitaciones} usuario={currentMesero?.nombre} destinoInicial={destino}
          onCancelar={onClose} onSucio={() => undefined} onGuardado={() => { onHecho(); onClose(); }}
        />
      </DialogContent>
    </Dialog>
  );
}
