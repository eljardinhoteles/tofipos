import { Check, Printer, Bed, Scissors, ArrowCounterClockwise } from '@phosphor-icons/react';
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
          className="w-full h-10 font-bold"
          onClick={p.onConfirmarCocina}
          disabled={p.sinItemsCocina}
        >
          {!p.hayConfirmadaCocina ? <Check size={18} weight="bold" className="mr-1.5" /> : <Printer size={18} weight="bold" className="mr-1.5" />}
          {!p.hayConfirmadaCocina ? 'Confirmar' : p.hayNuevosCocina ? `Adicional (${p.nuevosCocinaCount})` : 'Reimprimir'}
        </Button>
        <Button
          variant="primarySoft" className="w-full h-10 font-bold" onClick={p.onPedirCuenta}
          disabled={p.total === 0 || !p.confirmada}
        >
          <Check size={18} weight="bold" className="mr-1.5" />
          Pedir Cuenta
        </Button>
        <Button
          variant="infoSoft" className="w-full h-10 font-bold" onClick={p.onCargarHabitacion}
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
          <Button variant="dangerGhost" className="w-full h-10 font-semibold" onClick={p.onAnular}>
            Anular
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="warningSoft" className="w-full h-10 font-bold" onClick={p.onPrecuenta}>
        <Printer size={18} weight="bold" className="mr-1.5" /> Pre-cuenta
      </Button>
      <Button
        variant="warning" className="w-full h-10 font-bold" onClick={p.onCobrar}
        disabled={p.total === 0}
      >
        <Check size={18} weight="bold" className="mr-1.5" /> Cobrar Cuenta
      </Button>
      <Button
        variant="specialSoft" className="w-full h-10 font-bold" onClick={p.onDividirCuenta}
        disabled={p.total === 0 || p.saldoPendiente <= 0.001}
        title={p.saldoPendiente <= 0.001 ? 'La cuenta ya está pagada en su totalidad' : undefined}
      >
        <Scissors size={18} weight="bold" className="mr-1.5" /> Dividir Cuenta
      </Button>
      <Button
        variant="secondary" className="w-full h-10 font-bold" onClick={p.onReabrir}
        disabled={p.hayCortesia}
        title={p.hayCortesia ? 'No se puede reabrir: esta cuenta ya tiene un ítem de cortesía aplicado' : undefined}
      >
        <ArrowCounterClockwise size={18} weight="bold" className="mr-1.5" /> Reabrir
      </Button>
    </div>
  );
}
