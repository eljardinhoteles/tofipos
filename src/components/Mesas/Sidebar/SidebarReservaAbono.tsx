import { useState } from 'react';
import { Paperclip, Check, CircleNotch } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMetodosPagoConfig } from '../../../hooks/useMetodosPagoConfig';
import { ReservaHeader } from './ReservaHeader';
import { PagoComprobanteLink } from './PagoComprobanteLink';
import { cn } from '@/lib/utils';

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'otros'] as const;
type Metodo = typeof METODOS[number];

interface SidebarReservaAbonoProps {
  nombre: string;
  saldoPendiente: number;
  /** Movimientos de pago/reembolso ya registrados en la venta de la reserva. */
  pagos: any[];
  onBack: () => void;
  onClose: () => void;
  onConfirm: (data: {
    monto: number;
    metodo: Metodo;
    bancoDestino?: string;
    numeroComprobante?: string;
    redTarjeta?: string;
    comprobanteFile?: File | null;
  }) => Promise<void>;
}

const selectClass = 'h-12 w-full px-3 text-base font-semibold rounded-2xl bg-card border-border shadow-xs';
const etiqueta = 'text-xs font-bold text-foreground';

/**
 * Registrar abono de una reserva: página dentro del mismo sidebar (mismo patrón
 * que Cambiar cliente / Cobrar cuenta), no un modal encima. Registra un
 * movimiento 'pago' en Centro de Ventas (ver SidebarReservaDetail.handleAbonar).
 */
export function SidebarReservaAbono({ nombre, saldoPendiente, pagos, onBack, onClose, onConfirm }: SidebarReservaAbonoProps) {
  const { bancos, redesTarjeta } = useMetodosPagoConfig();
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  const [bancoDestino, setBancoDestino] = useState('');
  const [numeroComprobante, setNumeroComprobante] = useState('');
  const [redTarjeta, setRedTarjeta] = useState('');
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // El abono nunca puede superar lo que falta por cobrar de la reserva.
  const montoNum = parseFloat(monto);
  const excedeSaldo = Number.isFinite(montoNum) && montoNum > saldoPendiente + 0.005;
  const sinSaldo = saldoPendiente <= 0.005;
  const falta = metodo === 'tarjeta' && !redTarjeta;
  const totalAbonado = pagos.reduce((acc, m) => acc + (m.tipo === 'reembolso' ? -(m.monto ?? 0) : (m.monto ?? 0)), 0);

  const handleSubmit = async () => {
    if (!montoNum || montoNum <= 0 || excedeSaldo || falta) return;
    setSaving(true);
    try {
      await onConfirm({
        monto: montoNum,
        metodo,
        bancoDestino: metodo === 'transferencia' ? (bancoDestino || undefined) : undefined,
        numeroComprobante: metodo === 'transferencia' ? (numeroComprobante.trim() || undefined) : undefined,
        redTarjeta: metodo === 'tarjeta' ? (redTarjeta || undefined) : undefined,
        comprobanteFile,
      });
      onBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full w-full bg-card flex flex-col overflow-hidden shadow-xl">
      <ReservaHeader badge={null} titulo="Registrar abono" subtitulo={nombre} onBack={saving ? undefined : onBack} onClose={onClose} />

      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="rounded-2xl bg-muted/60 p-4 flex items-center justify-between">
          <span className="text-sm font-bold text-muted-foreground">Saldo pendiente</span>
          <span className="text-2xl font-black text-foreground">${saldoPendiente.toFixed(2)}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="abono-monto" className={etiqueta}>Monto a abonar</Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground pointer-events-none">$</span>
              <Input id="abono-monto" type="number" inputMode="decimal" step="0.01" min={0} max={saldoPendiente} placeholder="0.00"
                value={monto} autoFocus disabled={sinSaldo} onChange={(e) => setMonto(e.target.value)}
                className={`h-12 pl-8 text-lg font-black ${excedeSaldo ? 'border-destructive text-destructive' : ''}`} />
            </div>
            {!sinSaldo && (
              <Button type="button" variant="outline" className="h-12 px-4 font-bold shrink-0" onClick={() => setMonto(saldoPendiente.toFixed(2))}>
                Saldo
              </Button>
            )}
          </div>
          {excedeSaldo && (
            <span className="text-xs font-bold text-destructive">El abono no puede superar el saldo pendiente (${saldoPendiente.toFixed(2)}).</span>
          )}
          {sinSaldo && (
            <span className="text-xs text-muted-foreground">No hay saldo pendiente: la reserva ya está cubierta o aún no tiene productos.</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className={etiqueta}>Método de pago</Label>
          <Select value={metodo} onValueChange={(v) => setMetodo(v as Metodo)}>
            <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              {METODOS.map(m => (<SelectItem key={m} value={m} className="text-sm">{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        {metodo === 'transferencia' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Banco destino</Label>
              <Select value={bancoDestino || undefined} onValueChange={setBancoDestino}>
                <SelectTrigger className={selectClass}><SelectValue placeholder={bancos.length ? 'Selecciona' : 'Sin bancos configurados'} /></SelectTrigger>
                <SelectContent>{bancos.map(b => (<SelectItem key={b} value={b} className="text-sm">{b}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>N.º de comprobante</Label>
              <Input type="text" placeholder="Ej. 000123456" value={numeroComprobante} onChange={(e) => setNumeroComprobante(e.target.value)} className="h-12 text-base font-semibold" />
            </div>
          </div>
        )}

        {metodo === 'tarjeta' && (
          <div className="flex flex-col gap-1.5">
            <Label className={etiqueta}>Red de cobro *</Label>
            <Select value={redTarjeta || undefined} onValueChange={setRedTarjeta}>
              <SelectTrigger className={`${selectClass} ${!redTarjeta ? 'border-destructive/50' : ''}`}>
                <SelectValue placeholder={redesTarjeta.length ? 'Selecciona (obligatorio)' : 'Sin redes configuradas'} />
              </SelectTrigger>
              <SelectContent>{redesTarjeta.map(r => (<SelectItem key={r} value={r} className="text-sm">{r}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className={etiqueta}>Comprobante de pago (opcional)</Label>
          <label className="flex items-center gap-2 h-12 px-3 rounded-2xl border border-dashed border-border text-sm font-semibold text-muted-foreground cursor-pointer hover:bg-muted/60 hover:text-foreground transition-colors">
            <Paperclip size={16} className="shrink-0" />
            <span className="truncate">{comprobanteFile ? comprobanteFile.name : 'Adjuntar foto o PDF'}</span>
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setComprobanteFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        {/* Abonos ya registrados */}
        <section className="flex flex-col gap-2 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Abonos registrados</h4>
            {pagos.length > 0 && <span className="text-xs font-black text-foreground">Total ${totalAbonado.toFixed(2)}</span>}
          </div>
          {pagos.length === 0 ? (
            <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-xs font-medium text-muted-foreground">Todavía no hay abonos en esta reserva.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
              {pagos.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-foreground capitalize">{m.tipo === 'reembolso' ? 'Reembolso' : 'Abono'} · {m.metodo_pago}</span>
                    <span className="text-xs text-muted-foreground">
                      {(m.fecha || m.created_at) ? new Date(m.fecha || m.created_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      {m.transferencia_banco ? ` · ${m.transferencia_banco}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.comprobante_url && <PagoComprobanteLink url={m.comprobante_url} />}
                    <span className={cn('text-sm font-black tabular-nums', m.tipo === 'reembolso' ? 'text-destructive' : 'text-foreground')}>
                      {m.tipo === 'reembolso' ? '-' : '+'}${(m.monto ?? 0).toFixed(2)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="p-4 border-t border-border shrink-0">
        <Button className="w-full h-12 font-bold gap-2" disabled={saving || !monto || excedeSaldo || sinSaldo || falta} onClick={handleSubmit}>
          {saving ? (<><CircleNotch size={18} className="animate-spin" /> Registrando…</>) : (<><Check size={18} weight="bold" /> Registrar abono</>)}
        </Button>
      </footer>
    </div>
  );
}
