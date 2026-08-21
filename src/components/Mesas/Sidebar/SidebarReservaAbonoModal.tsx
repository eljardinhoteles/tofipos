import { useState } from 'react';
import { CreditCard, Paperclip } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useMetodosPagoConfig } from '../../../hooks/useMetodosPagoConfig';

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'otros'] as const;
type Metodo = typeof METODOS[number];

interface SidebarReservaAbonoModalProps {
  opened: boolean;
  onClose: () => void;
  saldoPendiente: number;
  onConfirm: (data: {
    monto: number;
    metodo: Metodo;
    bancoDestino?: string;
    numeroComprobante?: string;
    redTarjeta?: string;
    comprobanteFile?: File | null;
  }) => Promise<void>;
}

/**
 * Registra un abono de reserva como movimiento 'pago' en Centro de Ventas
 * (ver SidebarReservaDetail.handleAbonar) — mismo modelo de datos y mismos
 * campos de método de pago que RegistrarVentaPanel, para que el abono
 * aparezca en Centro de Ventas exactamente igual que cualquier otro cobro.
 */
export function SidebarReservaAbonoModal({ opened, onClose, saldoPendiente, onConfirm }: SidebarReservaAbonoModalProps) {
  const { bancos, redesTarjeta } = useMetodosPagoConfig();
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  const [bancoDestino, setBancoDestino] = useState('');
  const [numeroComprobante, setNumeroComprobante] = useState('');
  const [redTarjeta, setRedTarjeta] = useState('');
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setMonto('');
    setMetodo('efectivo');
    setBancoDestino('');
    setNumeroComprobante('');
    setRedTarjeta('');
    setComprobanteFile(null);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) return;
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
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard size={18} weight="bold" className="text-primary" />
            Registrar Abono
          </DialogTitle>
          <DialogDescription>
            Saldo pendiente: <span className="font-extrabold text-foreground">${saldoPendiente.toFixed(2)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Monto a abonar</Label>
            <Input
              type="number" placeholder="0.00" value={monto} autoFocus
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Método de pago</Label>
            <Select value={metodo} onValueChange={(v) => setMetodo(v as Metodo)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METODOS.map(m => (
                  <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {metodo === 'transferencia' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>Banco destino</Label>
                <Select value={bancoDestino || undefined} onValueChange={setBancoDestino}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={bancos.length ? 'Selecciona' : 'Sin bancos'} />
                  </SelectTrigger>
                  <SelectContent>
                    {bancos.map(b => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>N.º comprobante</Label>
                <Input
                  type="text" placeholder="Ej. 000123" value={numeroComprobante}
                  onChange={(e) => setNumeroComprobante(e.target.value)}
                />
              </div>
            </div>
          )}

          {metodo === 'tarjeta' && (
            <div className="flex flex-col gap-1.5">
              <Label>Red de cobro</Label>
              <Select value={redTarjeta || undefined} onValueChange={setRedTarjeta}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={redesTarjeta.length ? 'Selecciona' : 'Sin redes'} />
                </SelectTrigger>
                <SelectContent>
                  {redesTarjeta.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Comprobante de pago (opcional)</Label>
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-muted border border-dashed border-border text-xs font-bold text-muted-foreground cursor-pointer hover:bg-muted/70 transition-colors">
              <Paperclip size={14} className="shrink-0" />
              <span className="truncate">{comprobanteFile ? comprobanteFile.name : 'Adjuntar foto o PDF'}</span>
              <input
                type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => setComprobanteFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving || !monto}>
            Registrar Abono
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
