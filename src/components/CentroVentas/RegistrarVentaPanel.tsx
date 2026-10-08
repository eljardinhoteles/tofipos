import { useState } from 'react';
import { ORIGEN_ICON } from '../Common/OrigenBadge';
import { BedIcon, ForkKnife, Door, X, Paperclip, CheckCircle, CreditCard, UserPlus } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
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
import { ClienteBuscador } from '../Common/ClienteBuscador';
import { ClienteFormModal } from '../Clientes/ClienteFormModal';
import type { VentaOrigen, VentaTipo } from '../../db/rxdb';

interface RegistrarVentaPanelProps {
  onCancel: () => void;
  onSuccess: (ventaId: string) => void;
}

const ORIGEN_OPTS: { value: VentaOrigen; label: string; icon: typeof ORIGEN_ICON.mesa }[] = [
  { value: 'reserva_hotel', label: 'Reserva hotel', icon: BedIcon },
  { value: 'reserva_restaurante', label: 'Reserva restaurante', icon: ForkKnife },
  { value: 'mesa', label: 'Mesa', icon: ORIGEN_ICON.mesa },
  { value: 'habitacion', label: 'Checkout habitación', icon: Door },
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
    if (!esCredito && metodo === 'tarjeta' && !redTarjeta) { showToast.error('Selecciona la red de cobro de la tarjeta'); return; }

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

  const etiqueta = "text-xs font-bold text-foreground";
  const seccion = "flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs";
  const tituloSeccion = "text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground";

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="px-6 py-4 flex items-start justify-between gap-4 shrink-0 border-b border-border bg-card">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-extrabold text-base text-foreground leading-tight">Registrar venta</h3>
          <span className="text-xs font-medium text-muted-foreground">
            Origen: de dónde sale. Tipo: cómo se cobra — cualquier combinación es válida.
          </span>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" onClick={onCancel} className="h-9 w-9 text-muted-foreground shrink-0">
          <X size={18} />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto @container">
        <div className="mx-auto w-full max-w-3xl p-6 flex flex-col gap-4">
          {/* Tipo de cobro */}
          <section className={seccion}>
            <h4 className={tituloSeccion}>Tipo de cobro</h4>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'directa', label: 'Directa', icon: CheckCircle },
                { value: 'credito', label: 'Crédito', icon: CreditCard },
              ] as const).map(({ value, label, icon: Icon }) => (
                <button
                  key={value} type="button" aria-pressed={tipo === value} onClick={() => setTipo(value)}
                  className={cn("h-11 rounded-xl border text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2",
                    tipo === value ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground hover:text-foreground")}
                >
                  <Icon size={16} weight="bold" /> {label}
                </button>
              ))}
            </div>
            <p className={cn("rounded-xl px-3 py-2 text-xs font-semibold leading-snug",
              esCredito ? "bg-warning-soft text-warning-foreground" : "bg-muted text-muted-foreground")}>
              {esCredito
                ? 'Queda registrada con saldo pendiente — se liquida después desde el detalle.'
                : 'Se cobra ahora mismo, con el método de pago que indiques abajo.'}
            </p>
          </section>

          {/* Origen */}
          <section className={seccion}>
            <h4 className={tituloSeccion}>Origen</h4>
            <div className="grid grid-cols-2 @xl:grid-cols-4 gap-2">
              {ORIGEN_OPTS.map(o => (
                <button
                  key={o.value} type="button" aria-pressed={origen === o.value} onClick={() => setOrigen(o.value)}
                  className={cn("py-3 px-2 rounded-xl border flex flex-col items-center gap-1.5 transition-colors cursor-pointer",
                    origen === o.value ? "bg-muted border-foreground text-foreground" : "bg-card border-border text-muted-foreground hover:text-foreground")}
                >
                  <o.icon size={22} weight={origen === o.value ? 'fill' : 'bold'} />
                  <span className="text-xs font-bold text-center leading-tight">{o.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Cliente */}
          <section className={seccion}>
            <div className="flex items-center justify-between">
              <h4 className={tituloSeccion}>Cliente {esCredito && <span className="text-destructive">*</span>}</h4>
              <button type="button" onClick={() => setNuevoClienteOpen(true)}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer">
                <UserPlus size={13} weight="bold" /> Nuevo cliente
              </button>
            </div>
            <ClienteBuscador
              value={clienteId}
              onChange={setClienteId}
              placeholder={esCredito ? 'Cliente / agencia (requerido)' : 'Buscar cliente registrado (opcional)'}
              inputClassName="h-10 pl-9 text-sm font-semibold"
            />
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>{esCredito ? 'Nombre de referencia (opcional)' : 'Nombre (si no está registrado)'}</Label>
              <Input type="text" placeholder="Ej. Juan Pérez" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-10 text-sm font-semibold" />
            </div>
          </section>

          {/* Monto y pago */}
          <section className={seccion}>
            <h4 className={tituloSeccion}>{esCredito ? 'Monto' : 'Cobro'}</h4>
            <div className={cn("grid gap-3", esCredito ? "grid-cols-1" : "grid-cols-1 @md:grid-cols-2")}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="venta-monto" className={etiqueta}>Monto</Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground pointer-events-none">$</span>
                  <Input id="venta-monto" type="number" inputMode="decimal" step="0.01" min={0} placeholder="0.00" value={monto}
                    onChange={(e) => setMonto(e.target.value)} className="h-10 pl-7 text-sm font-bold" />
                </div>
              </div>
              {!esCredito && (
                <div className="flex flex-col gap-1.5">
                  <Label className={etiqueta}>Método de pago</Label>
                  <Select value={metodo} onValueChange={(v) => setMetodo(v as typeof METODOS[number])}>
                    <SelectTrigger className="h-10 w-full px-3 text-sm font-semibold rounded-2xl bg-card border-border shadow-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METODOS.map(m => (
                        <SelectItem key={m} value={m} className="text-sm">{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {!esCredito && metodo === 'transferencia' && (
              <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className={etiqueta}>Banco destino</Label>
                  <Select value={bancoDestino || undefined} onValueChange={setBancoDestino}>
                    <SelectTrigger className="h-10 w-full px-3 text-sm font-semibold rounded-2xl bg-card border-border shadow-xs">
                      <SelectValue placeholder={bancos.length ? 'Selecciona' : 'Sin bancos configurados'} />
                    </SelectTrigger>
                    <SelectContent>
                      {bancos.map(b => (<SelectItem key={b} value={b} className="text-sm">{b}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className={etiqueta}>N.º de comprobante</Label>
                  <Input type="text" placeholder="Ej. 000123456" value={numeroComprobanteTransf}
                    onChange={(e) => setNumeroComprobanteTransf(e.target.value)} className="h-10 text-sm font-semibold" />
                </div>
              </div>
            )}

            {!esCredito && metodo === 'tarjeta' && (
              <div className="flex flex-col gap-1.5">
                <Label className={etiqueta}>Red de cobro *</Label>
                <Select value={redTarjeta || undefined} onValueChange={setRedTarjeta}>
                  <SelectTrigger className={cn("h-10 w-full px-3 text-sm font-semibold rounded-2xl bg-card border-border shadow-xs", !redTarjeta && "border-destructive/50")}>
                    <SelectValue placeholder={redesTarjeta.length ? 'Selecciona (obligatorio)' : 'Sin redes configuradas'} />
                  </SelectTrigger>
                  <SelectContent>
                    {redesTarjeta.map(r => (<SelectItem key={r} value={r} className="text-sm">{r}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>

          {/* Detalle */}
          <section className={seccion}>
            <h4 className={tituloSeccion}>Detalle</h4>
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Descripción / referencia (opcional)</Label>
              <Textarea placeholder="Ej. reserva del 12 al 15 de agosto" value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)} className="min-h-24 text-sm font-medium" />
            </div>
            {!esCredito && (
              <div className="flex flex-col gap-1.5">
                <Label className={etiqueta}>Comprobante de pago (opcional)</Label>
                <label className="flex items-center gap-2 h-11 px-3 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground cursor-pointer hover:bg-muted/60 hover:text-foreground transition-colors">
                  <Paperclip size={16} className="shrink-0" />
                  <span className="truncate">{comprobanteFile ? comprobanteFile.name : 'Adjuntar foto o PDF'}</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={(e) => setComprobanteFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="h-10 px-5 font-bold">
          Cancelar
        </Button>
        <Button
          type="button" onClick={handleSubmit}
          disabled={saving || (!esCredito && metodo === 'tarjeta' && !redTarjeta)}
          className="h-10 px-6 font-bold"
        >
          {saving ? 'Registrando…' : 'Registrar'}
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
