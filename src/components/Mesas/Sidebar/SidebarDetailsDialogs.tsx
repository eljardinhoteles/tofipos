import { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SubcuentaChips } from './habitacion/SubcuentaChips';
import { HabitacionOpcion } from './habitacion/HabitacionOpcion';

interface RoomChargeDialogProps {
  opened: boolean;
  onOpenChange: (open: boolean) => void;
  folio?: number | string;
  cuentas: any[];
  mesas: any[];
  procesando: boolean;
  onConfirm: (cuentaId: string, subcuentaId: string | null) => void | Promise<void>;
}

// Cargar la comanda a una habitación activa (y a una de sus subcuentas).
// La selección vive en el cuerpo, que Radix desmonta al cerrar: cada apertura
// empieza limpia sin necesidad de un efecto que la reinicie.
export function RoomChargeDialog({ opened, onOpenChange, procesando, ...resto }: RoomChargeDialogProps) {
  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!procesando) onOpenChange(open); }}>
      <DialogContent className="max-w-md p-6 gap-4 border border-border shadow-2xl">
        <RoomChargeBody onOpenChange={onOpenChange} procesando={procesando} {...resto} />
      </DialogContent>
    </Dialog>
  );
}

function RoomChargeBody({ onOpenChange, folio, cuentas, mesas, procesando, onConfirm }: Omit<RoomChargeDialogProps, 'opened'>) {
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [subcuentaId, setSubcuentaId] = useState<string | null>(null);
  const cuentaSel = cuentas.find((c) => c.id === cuentaId);
  const subs = cuentaSel?.subcuentas ?? [];

  return (
    <>
        <DialogHeader className="border-b border-border pb-3 text-left">
          <DialogTitle className="font-extrabold text-base text-foreground">
            Cargar a habitación abierta
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Selecciona una habitación activa para transferir la comanda #{folio}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
          {cuentas.map((cuenta) => (
            <HabitacionOpcion
              key={cuenta.id}
              mesaNombre={mesas.find((m) => m.id === cuenta.mesa_id)?.nombre}
              huesped={cuenta.huesped}
              seleccionada={cuentaId === cuenta.id}
              onSelect={() => { setCuentaId(cuenta.id); setSubcuentaId(null); }}
            />
          ))}
        </div>

        {subs.length > 0 && (
          <div className="flex flex-col gap-2 pt-3 border-t border-border">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cargar a la subcuenta</span>
            <SubcuentaChips subcuentas={subs} value={subcuentaId} onChange={setSubcuentaId} nombrePrincipal={cuentaSel?.principal_nombre || 'Principal'} />
          </div>
        )}

        <div className="flex flex-col gap-2 pt-3 border-t border-border">
          <Button
            type="button"
            onClick={() => { if (cuentaId) onConfirm(cuentaId, subcuentaId); }}
            disabled={!cuentaId || procesando}
            className="w-full bg-primary text-primary-foreground font-bold h-11 text-sm shadow-md gap-1.5">
            {procesando ? (<><CircleNotch size={18} className="animate-spin" /> Transfiriendo…</>) : 'Transferir a Habitación'}
          </Button>
          <Button
            type="button" variant="ghost" disabled={procesando} onClick={() => onOpenChange(false)}
            className="w-full text-muted-foreground">
            Cancelar
          </Button>
        </div>
    </>
  );
}

interface DividirMesaDialogProps {
  opened: boolean;
  onOpenChange: (open: boolean) => void;
  procesando: boolean;
  onConfirm: () => void | Promise<void>;
}

// Confirmación antes de convertir una mesa en Mesa Múltiple (evita toques accidentales).
export function DividirMesaDialog({ opened, onOpenChange, procesando, onConfirm }: DividirMesaDialogProps) {
  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!procesando) onOpenChange(open); }}>
      <DialogContent className="max-w-sm p-6 gap-4">
        <DialogHeader className="text-left">
          <DialogTitle className="font-extrabold text-base">¿Dividir la mesa en varias cuentas?</DialogTitle>
          <DialogDescription className="text-sm">
            La orden actual pasará a ser la primera cuenta y se creará una segunda vacía, para repartir los productos entre ellas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 font-bold" disabled={procesando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="h-11 font-bold" disabled={procesando} onClick={onConfirm}>
            {procesando ? <CircleNotch size={16} className="animate-spin" /> : 'Dividir'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CambiarMesaDialogProps {
  opened: boolean;
  onOpenChange: (open: boolean) => void;
  folio?: number | string;
  mesas: any[];
  seleccionada: any | null;
  onSelect: (mesa: any) => void;
  onConfirm: () => void | Promise<void>;
}

// Mover la orden a otra mesa libre.
export function CambiarMesaDialog({ opened, onOpenChange, folio, mesas, seleccionada, onSelect, onConfirm }: CambiarMesaDialogProps) {
  return (
    <Dialog open={opened} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cambiar Mesa</DialogTitle>
          <DialogDescription>
            Selecciona la nueva mesa para la orden #{folio}. Solo se muestran mesas libres.
          </DialogDescription>
        </DialogHeader>
        {mesas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No hay mesas libres disponibles en este momento.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 max-h-80 overflow-y-auto py-1">
            {mesas.map((mesa) => (
              <button
                key={mesa.id}
                type="button"
                onClick={() => onSelect(mesa)}
                className={cn('aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 font-black text-base transition-colors cursor-pointer',
                  seleccionada?.id === mesa.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-muted/40 hover:bg-muted')}>
                {mesa.nombre.replace(/^Mesa\s*/i, '')}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!seleccionada} onClick={onConfirm}>
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CuentaConPendientesDialogProps {
  opened: boolean;
  onOpenChange: (open: boolean) => void;
  /** Unidades que aún no se han enviado a cocina. */
  pendientes: number;
  onConfirm: () => void;
}

// Aviso al pedir la cuenta con productos sin enviar a cocina: no bloquea, deja
// la decisión al mesero.
export function CuentaConPendientesDialog({ opened, onOpenChange, pendientes, onConfirm }: CuentaConPendientesDialogProps) {
  return (
    <Dialog open={opened} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-6 gap-4">
        <DialogHeader className="text-left">
          <DialogTitle className="font-extrabold text-base">Hay productos sin enviar a cocina</DialogTitle>
          <DialogDescription className="text-sm">
            {pendientes === 1 ? 'Hay 1 producto' : `Hay ${pendientes} productos`} que no se {pendientes === 1 ? 'ha' : 'han'} enviado a cocina. ¿Pedir la cuenta de todos modos?
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 font-bold" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="h-11 font-bold" onClick={onConfirm}>Pedir cuenta</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface AnticipoDetalleDialogProps {
  opened: boolean;
  onOpenChange: (open: boolean) => void;
  disponible: number;
  /** Ventas de Centro de Ventas que contienen el anticipo de la mesa. */
  ventas: Array<{ venta: any; disponible: number }>;
}

const fmt = (n: number) => `$${n.toFixed(2)}`;
const METODOS: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', credito_agencia: 'Crédito agencia', otros: 'Otros' };

// Detalle del anticipo de la mesa: sale de los movimientos de la venta en
// Centro de Ventas (abonos, anticipo ya aplicado a otras cuentas, devoluciones).
export function AnticipoDetalleDialog({ opened, onOpenChange, disponible, ventas }: AnticipoDetalleDialogProps) {
  return (
    <Dialog open={opened} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 gap-4">
        <DialogHeader className="text-left">
          <DialogTitle className="font-extrabold text-base">Anticipo de la mesa</DialogTitle>
          <DialogDescription className="text-sm">
            Disponible: <span className="font-black text-info-foreground">{fmt(disponible)}</span>. Detalle tomado del registro en Centro de Ventas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 max-h-[55dvh] overflow-y-auto pr-1">
          {ventas.map(({ venta, disponible: dispV }) => {
            const movs = [...(venta.movimientos ?? [])]
              .filter((m: any) => !m.anulado && (m.tipo === 'pago' || m.tipo === 'reembolso' || (m.tipo === 'comentario' && m.motivo?.startsWith('Anticipo aplicado: $') && !m.motivo.startsWith('Anticipo aplicado: $0.00'))))
              .sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
            return (
              <div key={venta.id} className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/60">
                  <span className="text-xs font-extrabold text-foreground truncate">{venta.referencia || 'Venta'}</span>
                  <span className="text-xs font-black text-info-foreground shrink-0">{fmt(dispV)}</span>
                </div>
                <div className="flex flex-col divide-y divide-border">
                  {movs.map((m: any) => {
                    const fecha = new Date(m.fecha);
                    const esPago = m.tipo === 'pago';
                    const esDevolucion = m.tipo === 'reembolso';
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-foreground truncate">
                            {esPago ? 'Anticipo recibido' : esDevolucion ? 'Devolución' : 'Aplicado a una cuenta'}
                            {esPago && m.metodo_pago ? ` · ${METODOS[m.metodo_pago] ?? m.metodo_pago}` : ''}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {fecha.toLocaleDateString('es', { day: '2-digit', month: 'short' })} {fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                            {!esPago && m.motivo ? ` · ${m.motivo.replace('Anticipo aplicado: ', '')}` : ''}
                            {esPago && m.transferencia_referencia ? ` · Ref. ${m.transferencia_referencia}` : ''}
                          </span>
                        </div>
                        <span className={cn('text-sm font-black shrink-0', esPago ? 'text-foreground' : 'text-muted-foreground')}>
                          {esPago ? '+' : '−'}{fmt(esPago || esDevolucion ? (m.monto ?? 0) : Number(/\$([\d.]+)/.exec(m.motivo ?? '')?.[1] ?? 0))}
                        </span>
                      </div>
                    );
                  })}
                  {movs.length === 0 && <span className="px-3 py-2 text-xs text-muted-foreground">Sin movimientos.</span>}
                </div>
              </div>
            );
          })}
        </div>

        <Button variant="outline" className="h-11 font-bold" onClick={() => onOpenChange(false)}>Cerrar</Button>
      </DialogContent>
    </Dialog>
  );
}
