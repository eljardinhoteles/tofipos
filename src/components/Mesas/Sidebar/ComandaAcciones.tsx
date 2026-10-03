import { Check, Printer, Bed, Scissors, ArrowCounterClockwise } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ComandaAccionesProps {
  /** Cuenta ya pedida: pasa de los botones de servicio a los de cobro. */
  enCuenta: boolean;
  total: number;
  saldoPendiente: number;
  // Servicio (cuenta aún no pedida)
  hayConfirmadaCocina: boolean;
  hayNuevosCocina: boolean;
  nuevosCocinaCount: number;
  sinItemsCocina: boolean;
  confirmada: boolean;
  sinProductos: boolean;
  mesaSinItems: boolean;
  onConfirmarCocina: () => void;
  onPedirCuenta: () => void;
  onCargarHabitacion: () => void;
  onCerrarVacia: () => void;
  onAnular: () => void;
  // Cobro (cuenta pedida)
  hayCortesia: boolean;
  onPrecuenta: () => void;
  onCobrar: () => void;
  onDividirCuenta: () => void;
  onReabrir: () => void;
}

// Botonera de la comanda: en servicio (confirmar, pedir cuenta, cargar a
// habitación, anular) y en cuenta pedida (pre-cuenta, cobrar, dividir, reabrir).
export function ComandaAcciones(p: ComandaAccionesProps) {
  if (!p.enCuenta) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={!p.hayConfirmadaCocina ? 'default' : 'secondary'}
          className={cn('w-full h-10 font-bold', !p.hayConfirmadaCocina ? '' : 'bg-muted text-foreground')}
          onClick={p.onConfirmarCocina}
          disabled={p.sinItemsCocina}
        >
          {!p.hayConfirmadaCocina ? <Check size={18} weight="bold" className="mr-1.5" /> : <Printer size={18} weight="bold" className="mr-1.5" />}
          {!p.hayConfirmadaCocina ? 'Confirmar' : p.hayNuevosCocina ? `Adicional (${p.nuevosCocinaCount})` : 'Reimprimir'}
        </Button>
        <Button
          variant="secondary" className="w-full h-10 font-bold text-primary bg-primary/10" onClick={p.onPedirCuenta}
          disabled={p.total === 0 || !p.confirmada}
        >
          <Check size={18} weight="bold" className="mr-1.5" />
          Pedir Cuenta
        </Button>
        <Button
          variant="secondary" className="w-full h-10 font-bold text-blue-600 bg-blue-50" onClick={p.onCargarHabitacion}
          disabled={p.sinProductos || !p.confirmada}
        >
          <Bed size={18} weight="bold" className="mr-1.5" /> Cargar Hab.
        </Button>
        {p.mesaSinItems ? (
          // Mesa abierta sin ningún pedido (el cliente se fue): se cierra
          // directo, sin diálogo de motivo.
          <Button variant="destructive" className="w-full h-10 font-bold" onClick={p.onCerrarVacia}>
            Cerrar mesa
          </Button>
        ) : (
          <Button variant="ghost" className="w-full h-10 font-bold text-destructive" onClick={p.onAnular}>
            Anular
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="secondary" className="w-full h-10 font-bold text-amber-600 bg-amber-50" onClick={p.onPrecuenta}>
        <Printer size={18} weight="bold" className="mr-1.5" /> Pre-cuenta
      </Button>
      <Button
        className="w-full h-10 font-bold bg-orange-500 hover:bg-orange-600 text-white" onClick={p.onCobrar}
        disabled={p.total === 0}
      >
        <Check size={18} weight="bold" className="mr-1.5" /> Cobrar Cuenta
      </Button>
      <Button
        variant="secondary" className="w-full h-10 font-bold text-violet-600 bg-violet-50" onClick={p.onDividirCuenta}
        disabled={p.total === 0 || p.saldoPendiente <= 0.001}
        title={p.saldoPendiente <= 0.001 ? 'La cuenta ya está pagada en su totalidad' : undefined}
      >
        <Scissors size={18} weight="bold" className="mr-1.5" /> Dividir Cuenta
      </Button>
      <Button
        variant="secondary" className="w-full h-10 font-bold text-muted-foreground bg-muted" onClick={p.onReabrir}
        disabled={p.hayCortesia}
        title={p.hayCortesia ? 'No se puede reabrir: esta cuenta ya tiene un ítem de cortesía aplicado' : undefined}
      >
        <ArrowCounterClockwise size={18} weight="bold" className="mr-1.5" /> Reabrir
      </Button>
    </div>
  );
}
