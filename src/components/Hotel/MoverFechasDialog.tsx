import dayjs from 'dayjs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '../../context/AuthContext';
import { nombreHuesped, type ReservaHotel } from '../../lib/hotelReservasApi';
import { EditorEstadia } from './detalle/EditorEstadia';

interface Props {
  r: ReservaHotel;
  /** Reservas vigentes del mismo grupo (incluida esta); una sola si no es de grupo. */
  grupo: ReservaHotel[];
  llegada: string;
  salida: string;
  onClose: () => void;
  /** Se movieron las fechas: quien lo abrió recarga el calendario. */
  onHecho: () => void;
}

/**
 * Confirmación al arrastrar una reserva a otras fechas en el calendario (misma habitación y duración). Reutiliza el editor de fechas
 * con las nuevas ya puestas: calcula la tarifa en Cloudbeds, comprueba que las noches nuevas estén libres y muestra antes y después.
 */
export function MoverFechasDialog({ r, grupo, llegada, salida, onClose, onHecho }: Props) {
  const { currentMesero } = useAuth();
  const f = (d: string) => dayjs(d).format('D MMM');
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="t-titulo">Mover fechas</DialogTitle>
          <DialogDescription className="t-meta">{nombreHuesped(r)} · {r.cabana} · del {f(r.llegada)} → {f(r.salida)} al {f(llegada)} → {f(salida)}.</DialogDescription>
        </DialogHeader>
        <EditorEstadia
          modo="fechas" r={r} grupo={grupo} usuario={currentMesero?.nombre} fechasIniciales={{ llegada, salida }}
          onCancelar={onClose} onSucio={() => undefined} onGuardado={() => { onHecho(); onClose(); }}
        />
      </DialogContent>
    </Dialog>
  );
}
