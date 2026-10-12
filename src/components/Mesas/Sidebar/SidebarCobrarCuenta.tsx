import { Printer, CircleNotch, Check } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { ReservaHeader } from './ReservaHeader';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ComandaTotales } from './ComandaTotales';

interface SidebarCobrarCuentaProps {
  folio: number | string;
  mesaNombre: string;
  subtotal: number;
  iva: number;
  ivaPorcentaje: number;
  total: number;
  totalPagado: number;
  /** Lo que falta por cobrar de la cuenta, sin descontar el anticipo. */
  saldoPendiente: number;
  /** Anticipo de la mesa disponible (0 = no hay, no se ofrece). */
  anticipo: number;
  /** Cuánto del anticipo se aplica a esta cuenta (0 hasta min(anticipo, saldo)). */
  anticipoUsar: number;
  onAnticipoUsarChange: (monto: number) => void;
  /** No quedan otras cuentas abiertas en la mesa: lo que sobre del anticipo ya no tiene dónde aplicarse. */
  ultimaCuentaDeMesa: boolean;
  closePayerName: string;
  setClosePayerName: (val: string) => void;
  /** Cierre en curso: bloquea los botones (evita dobles clics). */
  procesando: boolean;
  onBack: () => void;
  onConfirm: (imprimir: boolean) => void;
}

// Página "Cobrar" dentro del mismo sheet de la mesa (mismo patrón que
// SidebarCambiarCliente / SidebarSplit): reutiliza ComandaTotales para el
// resumen y no monta ningún modal encima.
export function SidebarCobrarCuenta({
  folio, mesaNombre, subtotal, iva, ivaPorcentaje, total, totalPagado, saldoPendiente,
  anticipo, anticipoUsar, onAnticipoUsarChange, ultimaCuentaDeMesa,
  closePayerName, setClosePayerName, procesando, onBack, onConfirm,
}: SidebarCobrarCuentaProps) {
  const hayAnticipo = anticipo > 0.001;
  const maxUsar = Math.min(anticipo, saldoPendiente);
  const cobrarAhora = Math.max(0, saldoPendiente - anticipoUsar);
  const sobrante = Math.max(0, anticipo - anticipoUsar);

  return (
    <div className="h-full w-full bg-card flex flex-col overflow-hidden shadow-xl">
      <ReservaHeader tono="neutro" titulo="Cobrar cuenta" subtitulo={`Comanda #${folio} · ${mesaNombre}`} onBack={() => { if (!procesando) onBack(); }} />

      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <ComandaTotales
          tarjeta
          subtotal={subtotal}
          iva={iva}
          ivaPorcentaje={ivaPorcentaje}
          total={total}
          totalPagado={totalPagado}
          saldoPendiente={saldoPendiente}
        />

        {hayAnticipo && (
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-info-soft">
            <div className="flex items-center justify-between">
              <Label className="t-dato! text-info-foreground">Anticipo disponible</Label>
              <span className="t-cuerpo-fuerte text-info-foreground">${anticipo.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number" step="0.01" min={0} max={maxUsar} value={anticipoUsar || ''} placeholder="0.00"
                onChange={(e) => onAnticipoUsarChange(Math.min(maxUsar, Math.max(0, parseFloat(e.target.value) || 0)))}
                className="h-10 font-bold"
              />
              <Button type="button" variant="outline" className="h-10 font-bold shrink-0 bg-card" onClick={() => onAnticipoUsarChange(maxUsar)}>Todo</Button>
              <Button type="button" variant="outline" className="h-10 font-bold shrink-0 bg-card" onClick={() => onAnticipoUsarChange(0)}>Nada</Button>
            </div>
            <p className="t-meta text-info-foreground">
              {sobrante > 0.005
                ? `Quedan $${sobrante.toFixed(2)} de anticipo sin usar.`
                : 'Se descuenta de lo que se cobra ahora.'}
            </p>
          </div>
        )}

        {sobrante > 0.005 && ultimaCuentaDeMesa && (
          <div className="p-3 rounded-2xl bg-warning-soft text-warning-foreground t-dato leading-snug">
            Sobran ${sobrante.toFixed(2)} de anticipo y es la última cuenta de la mesa. Al cobrar, ese dinero ya no se puede aplicar a otra cuenta: devuélvelo al cliente y regístralo como reembolso en Centro de Ventas.
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cobrar-pagador" className="t-meta! text-muted-foreground">Nombre de quien paga</Label>
          <Input
            id="cobrar-pagador"
            type="text"
            placeholder="Ej: Juan Pérez"
            value={closePayerName}
            onChange={(e) => setClosePayerName(e.target.value)}
            className="h-12 t-fila"
          />
        </div>

        <p className="t-meta text-muted-foreground">
          El cobro queda registrado para anclarlo en Centro de Ventas y la mesa se libera si no quedan otras cuentas abiertas.
        </p>
      </main>

      <footer className="p-4 border-t border-border shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <span className="t-etiqueta text-muted-foreground">A cobrar ahora</span>
          <span className="t-cifra text-foreground">${cobrarAhora.toFixed(2)}</span>
        </div>
        <Button className="w-full h-12 font-bold gap-2" disabled={procesando} onClick={() => onConfirm(true)}>
          {procesando ? (<><CircleNotch size={18} className="animate-spin" /> Cobrando…</>) : (<><Printer size={18} weight="bold" /> Cobrar e imprimir</>)}
        </Button>
        <Button variant="outline" className="w-full h-11 font-bold gap-2" disabled={procesando} onClick={() => onConfirm(false)}>
          <Check size={18} weight="bold" /> Solo cobrar
        </Button>
      </footer>
    </div>
  );
}
