import { useState } from 'react';
import { BedIcon, ForkKnife, Table, X, Paperclip, CheckCircle, CreditCard, UserPlus } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { useRxClientes } from '../../hooks/useRxClientes';
import { useMetodosPagoConfig } from '../../hooks/useMetodosPagoConfig';
import { useAuth } from '../../context/AuthContext';
import { createRxVenta, agregarVentaMovimiento } from '../../db/rxdb';
import { subirComprobante } from '@/lib/comprobantes';
import { ClienteFormModal } from '../Clientes/ClienteFormModal';
import type { VentaOrigen, VentaTipo } from '../../db/rxdb';

interface RegistrarVentaPanelProps {
  onCancel: () => void;
  onSuccess: (ventaId: string) => void;
}

const ORIGEN_OPTS: { value: VentaOrigen; label: string; icon: typeof Table }[] = [
  { value: 'reserva_hotel', label: 'Reserva hotel', icon: BedIcon },
  { value: 'reserva_restaurante', label: 'Reserva restaurante', icon: ForkKnife },
  { value: 'mesa', label: 'Mesa', icon: Table },
];

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'otros'] as const;

/**
 * Registro manual de una venta — origen (de dónde sale) y tipo (cómo se
 * cobra) son independientes: cualquier origen puede ser directa o crédito.
 * El flujo operativo (Mesas) siempre crea directa; este formulario es para
 * registrar manualmente lo que no pasó por ahí, o para dar de alta un
 * crédito corporativo desde cero.
 */
export function RegistrarVentaPanel({ onCancel, onSuccess }: RegistrarVentaPanelProps) {
  const { clientes } = useRxClientes();
  const { currentMesero } = useAuth();
  const { bancos, redesTarjeta } = useMetodosPagoConfig();

  const [origen, setOrigen] = useState<VentaOrigen>('reserva_hotel');
  const [tipo, setTipo] = useState<VentaTipo>('directa');
  const [saving, setSaving] = useState(false);

  const [clienteId, setClienteId] = useState('');
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<typeof METODOS[number]>('efectivo');
  const [bancoDestino, setBancoDestino] = useState('');
  const [numeroComprobanteTransf, setNumeroComprobanteTransf] = useState('');
  const [redTarjeta, setRedTarjeta] = useState('');
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [nuevoClienteOpen, setNuevoClienteOpen] = useState(false);

  const cliente = clientes.find((c: any) => c.id === clienteId);
  const esCredito = tipo === 'credito';

  const handleSubmit = async () => {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { showToast.error('Ingresa un monto válido'); return; }
    if (esCredito && !clienteId) { showToast.error('Selecciona el cliente/agencia para la venta a crédito'); return; }

    setSaving(true);
    try {
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const referencia = descripcion.trim() || `${ORIGEN_OPTS.find(o => o.value === origen)?.label} — ${nombre.trim() || cliente?.nombre || 'Sin nombre'}`;

      const venta = await createRxVenta({
        id: crypto.randomUUID(),
        origen,
        tipo,
        cliente_id: clienteId || undefined,
        cliente_nombre: nombre.trim() || cliente?.nombre || undefined,
        referencia,
        organization_id: orgId,
        usuario_id: currentMesero?.id,
      }, montoNum);

      // Directa: se cobra de una vez al registrar, el ajuste inicial queda
      // saldado con un movimiento de pago por el mismo monto (con su propio
      // comprobante si se adjuntó). Crédito: nace solo con el ajuste — queda
      // con saldo pendiente hasta liquidar.
      if (tipo === 'directa') {
        let comprobante_url: string | undefined;
        if (comprobanteFile) {
          comprobante_url = await subirComprobante(comprobanteFile, orgId, venta.id);
        }
        await agregarVentaMovimiento({
          venta_id: venta.id,
          tipo: 'pago',
          monto: montoNum,
          metodo_pago: metodo,
          transferencia_banco: metodo === 'transferencia' ? (bancoDestino || undefined) : undefined,
          transferencia_referencia: metodo === 'transferencia' ? (numeroComprobanteTransf.trim() || undefined) : undefined,
          tarjeta_red: metodo === 'tarjeta' ? (redTarjeta || undefined) : undefined,
          comprobante_url,
          usuario_id: currentMesero?.id,
        });
      }

      showToast.success('Venta registrada');
      onSuccess(venta.id);
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo registrar la venta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(
      "flex flex-col gap-5 rounded-2xl border-2 p-5 transition-colors",
      esCredito ? "border-rose-200 bg-rose-50/30" : "border-emerald-200 bg-emerald-50/30"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="font-extrabold text-base text-foreground leading-tight">Registrar venta</h3>
          <span className="text-[11px] text-muted-foreground">
            Origen: de dónde sale. Tipo: cómo se cobra — cualquier combinación es válida.
          </span>
        </div>
        <button type="button" onClick={onCancel} className="text-muted-foreground shrink-0">
          <X size={18} />
        </button>
      </div>

      {/* Tipo — decide el acento visual de todo el formulario */}
      <div className="flex flex-col gap-2">
        <Label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Tipo de cobro</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button" onClick={() => setTipo('directa')}
            className={cn("py-3 rounded-xl border-2 text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5",
              tipo === 'directa' ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-card border-border text-muted-foreground")}
          >
            <CheckCircle size={15} weight="bold" /> Directa
          </button>
          <button
            type="button" onClick={() => setTipo('credito')}
            className={cn("py-3 rounded-xl border-2 text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5",
              tipo === 'credito' ? "bg-rose-600 text-white border-rose-600 shadow-sm" : "bg-card border-border text-muted-foreground")}
          >
            <CreditCard size={15} weight="bold" /> Crédito
          </button>
        </div>
        <p className={cn("text-[11px] font-semibold", esCredito ? "text-rose-700" : "text-emerald-700")}>
          {esCredito
            ? 'Queda registrada con saldo pendiente — se liquida después desde el detalle.'
            : 'Se cobra ahora mismo, con el método de pago que indiques abajo.'}
        </p>
      </div>

      {/* Origen */}
      <div className="flex flex-col gap-2">
        <Label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Origen</Label>
        <div className="grid grid-cols-3 gap-2">
          {ORIGEN_OPTS.map(o => (
            <button
              key={o.value}
              type="button" onClick={() => setOrigen(o.value)}
              className={cn("p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer",
                origen === o.value ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-muted-foreground")}
            >
              <o.icon size={20} weight="bold" />
              <span className="text-[11px] font-extrabold text-center">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Cliente primero, nombre libre como fallback */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">
              Cliente {esCredito && <span className="text-rose-600">*</span>}
            </Label>
            <button
              type="button" onClick={() => setNuevoClienteOpen(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
            >
              <UserPlus size={12} weight="bold" /> Nuevo cliente
            </button>
          </div>
          <Select value={clienteId || undefined} onValueChange={setClienteId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={esCredito ? 'Cliente / agencia (requerido)' : 'Cliente registrado (opcional)'} />
            </SelectTrigger>
            <SelectContent>
              {clientes.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">
            {esCredito ? 'Nombre de referencia (opcional)' : 'Nombre del cliente (si no está registrado)'}
          </Label>
          <Input
            type="text" placeholder="Ej. Juan Pérez"
            value={nombre} onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-bold text-muted-foreground">Monto</Label>
            <Input
              type="number" placeholder="0.00" value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          {!esCredito && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground">Método de pago</Label>
              <Select value={metodo} onValueChange={(v) => setMetodo(v as typeof METODOS[number])}>
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
          )}
        </div>

        {/* Detalle según método — banco+comprobante para transferencia, red para tarjeta */}
        {!esCredito && metodo === 'transferencia' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground">Banco destino</Label>
              <Select value={bancoDestino || undefined} onValueChange={setBancoDestino}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={bancos.length ? 'Selecciona' : 'Sin bancos configurados'} />
                </SelectTrigger>
                <SelectContent>
                  {bancos.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] font-bold text-muted-foreground">N.º de comprobante</Label>
              <Input
                type="text" placeholder="Ej. 000123456" value={numeroComprobanteTransf}
                onChange={(e) => setNumeroComprobanteTransf(e.target.value)}
              />
            </div>
          </div>
        )}

        {!esCredito && metodo === 'tarjeta' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-bold text-muted-foreground">Red de cobro</Label>
            <Select value={redTarjeta || undefined} onValueChange={setRedTarjeta}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={redesTarjeta.length ? 'Selecciona' : 'Sin redes configuradas'} />
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
          <Label className="text-[11px] font-bold text-muted-foreground">Descripción / referencia (opcional)</Label>
          <Textarea
            placeholder="Ej. reserva del 12 al 15 de agosto" value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        {/* Comprobante al final — último paso antes de confirmar */}
        {!esCredito && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-bold text-muted-foreground">Comprobante de pago (opcional)</Label>
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-muted border border-dashed border-border text-xs font-bold text-muted-foreground cursor-pointer hover:bg-muted/70 transition-colors">
              <Paperclip size={14} className="shrink-0" />
              <span className="truncate">{comprobanteFile ? comprobanteFile.name : 'Adjuntar foto o PDF'}</span>
              <input
                type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => setComprobanteFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button
          type="button" onClick={handleSubmit} disabled={saving}
          className={esCredito ? "bg-rose-600 hover:bg-rose-700 text-white" : ""}
        >
          Registrar
        </Button>
      </div>

      <ClienteFormModal
        opened={nuevoClienteOpen}
        onClose={() => setNuevoClienteOpen(false)}
        onCreatedGoToCuenta={(nuevoId) => setClienteId(nuevoId)}
      />
    </div>
  );
}
