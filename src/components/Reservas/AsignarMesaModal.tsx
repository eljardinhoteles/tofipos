import { useMemo, useState } from 'react';
import { Clock, Users, CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { type Reserva } from '../../db/database';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { updateRxComanda, updateRxMesa, updateRxReserva } from '../../db/rxdb';
import { isOperativeComanda } from '../../db/comandaState';

interface AsignarMesaModalProps {
  /** Reserva a la que se asigna mesa (null = cerrado). */
  reserva: Reserva | null;
  mesas: any[];
  comandas: any[];
  onClose: () => void;
}

// Asignar mesa a una reserva del día e iniciar el servicio. Compartido por el
// calendario de Reservas y la franja "Reservas de hoy" de Mesas.
export function AsignarMesaModal({ reserva, mesas, comandas, onClose }: AsignarMesaModalProps) {
  const [mesaSeleccionada, setMesaSeleccionada] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // Mismas mesas que ofrece "Cambiar mesa": libres de verdad (sin comanda
  // operativa apuntándoles, aunque mesa.estado quede desfasado), sin
  // habitaciones y sin las mesas sintéticas (reserva_/delivery_/local_).
  const mesasLibres = useMemo(() => {
    const ocupadas = new Set(comandas.filter(c => isOperativeComanda(c)).map(c => c.mesa_id));
    return mesas
      .filter(m =>
        m.estado !== 'cuenta' &&
        !ocupadas.has(m.id) &&
        m.piso?.toLowerCase() !== 'reservas' &&
        m.piso?.toLowerCase() !== 'habitaciones' &&
        !/^(reserva_|delivery_|local_)/.test(m.id)
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));
  }, [mesas, comandas]);

  if (!reserva) return null;

  const handleAssignSubmit = async () => {
    if (!mesaSeleccionada || !reserva.comanda_id) return;
    setIsAssigning(true);
    try {
      const mesa = mesas.find(m => m.id === mesaSeleccionada);
      await updateRxComanda(reserva.comanda_id, {
        mesa_id: mesaSeleccionada,
        mesa_nombre: mesa?.nombre || mesaSeleccionada,
        personas: reserva.personas,
      });
      await updateRxMesa(mesaSeleccionada, { estado: 'ocupada' });
      await updateRxReserva(reserva.id, { estado: 'completada', mesa_id: mesaSeleccionada });
      showToast.success('Servicio iniciado', 'Reserva asignada a la mesa.');
      onClose();
    } catch (e) {
      console.error(e);
      showToast.error('Error', 'No se pudo asignar la mesa.');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isAssigning) onClose(); }}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>Asignar mesa</DialogTitle>
          <DialogDescription className="sr-only">Elige una mesa libre para iniciar el servicio de la reserva</DialogDescription>
        </DialogHeader>

        <div className="p-3 bg-muted/60 rounded-xl flex flex-col gap-1">
          <span className="font-extrabold text-sm text-foreground">{reserva.nombre}</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-semibold">
            <span className="flex items-center gap-1"><Clock size={14} /> {reserva.hora}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Users size={14} /> {reserva.personas} pers</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs font-bold text-foreground">Mesa disponible</Label>
          {mesasLibres.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No hay mesas libres disponibles en este momento.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto py-1">
              {mesasLibres.map(m => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={mesaSeleccionada === m.id}
                  onClick={() => setMesaSeleccionada(mesaSeleccionada === m.id ? null : m.id)}
                  title={m.piso || 'Sin zona'}
                  className={cn('aspect-square rounded-xl border flex flex-col items-center justify-center font-black text-base transition-colors cursor-pointer',
                    mesaSeleccionada === m.id
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted')}>
                  {m.nombre.replace(/^Mesa\s*/i, '')}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isAssigning} className="font-bold">
            Cancelar
          </Button>
          <Button type="button" disabled={!mesaSeleccionada || isAssigning} onClick={handleAssignSubmit} className="font-bold gap-1.5">
            <CheckCircle size={18} weight="bold" />
            {isAssigning ? 'Iniciando…' : 'Iniciar servicio'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
