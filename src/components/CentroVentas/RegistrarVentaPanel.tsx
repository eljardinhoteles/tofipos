import { useState } from 'react';
import { ORIGEN_ICON, ORIGEN_CLASSES } from '../Common/OrigenBadge';
import { BedIcon, ForkKnife, Door, CheckCircle, CreditCard, UserPlus, FloppyDisk } from '@phosphor-icons/react';
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
import { RedCobroRadios } from '../Common/RedCobroRadios';
import { ComprobanteAdjunto } from '../Common/ComprobanteAdjunto';
import { EstadoBadge } from '../Common/EstadoBadge';
import { OrigenBadge } from '../Common/OrigenBadge';
import { documentoCliente } from '../../lib/documentoCliente';
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
  { value: 'habitacion', label: 'Consumo habitación', icon: Door },
];

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'otros'] as const;

/**
 * Registro manual de una venta — origen (de dónde sale) y tipo (cómo se
 * cobra) son independientes: cualquier origen puede ser directa o crédito.
 * El flujo operativo (Mesas) siempre crea directa; este formulario es para
 * registrar manualmente lo que no pasó por ahí, o para dar de alta un
 * crédito corporativo desde cero.
 */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 min-w-0">
      <span className="t-etiqueta text-muted-foreground">{etiqueta}</span>
      <span className="t-fila text-foreground min-w-0 break-words">{valor}</span>
    </div>
  );
}

export function RegistrarVentaPanel({ onCancel, onSuccess }: RegistrarVentaPanelProps) {
  const { clientes } = useRxClientes();
  const { currentMesero } = useAuth();
  const { bancos, redesTarjeta } = useMetodosPagoConfig();

  const [origen, setOrigen] = useState<VentaOrigen>('reserva_hotel');
  const [tipo, setTipo] = useState<VentaTipo>('directa');
  const [saving, setSaving] = useState(false);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [intentado, setIntentado] = useState(false);

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

  const continuar = () => {
    if (esCredito && !clienteId) { showToast.error('Selecciona el cliente/agencia para la venta a crédito'); return; }
    setPaso(2);
  };

  const falta = {
    monto: !(parseFloat(monto) > 0),
    red: !esCredito && metodo === 'tarjeta' && !redTarjeta,
    numero: !esCredito && metodo === 'transferencia' && !numeroComprobanteTransf.trim(),
  };

  const revisar = () => {
    setIntentado(true);
    if (falta.monto || falta.red || falta.numero) { showToast.error('Completa los campos marcados en rojo'); return; }
    setPaso(3);
  };


  const handleSubmit = async () => {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { showToast.error('Ingresa un monto válido'); return; }
    if (esCredito && !clienteId) { showToast.error('Selecciona el cliente/agencia para la venta a crédito'); return; }
    if (!esCredito && metodo === 'tarjeta' && !redTarjeta) { showToast.error('Selecciona la red de cobro de la tarjeta'); return; }
    if (!esCredito && metodo === 'transferencia' && !numeroComprobanteTransf.trim()) { showToast.error('Ingresa el número de comprobante de la transferencia'); return; }

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

  const etiqueta = "t-etiqueta! text-muted-foreground";
  const seccion = "flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs";
  const tituloSeccion = "t-etiqueta text-muted-foreground";
  const datos = "grid grid-cols-1 @md:grid-cols-2 gap-x-6 gap-y-5";

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="h-16 px-6 border-b border-border bg-card flex items-center gap-3 shrink-0">
        <div className="min-w-0 mr-auto flex flex-col">
          {paso === 3 ? (
            <span className="t-titulo text-secondary-foreground">Revisar información</span>
          ) : (cliente || nombre.trim()) ? (
            <>
              <span className="t-titulo uppercase text-secondary-foreground truncate">{cliente?.nombre || nombre.trim()}</span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="t-meta text-muted-foreground truncate">{(cliente && documentoCliente(cliente)) || 'Sin documento'}</span>
                <EstadoBadge tono={esCredito ? 'destructive' : 'success'}>{esCredito ? 'Crédito' : 'Directa'}</EstadoBadge>
              </span>
            </>
          ) : (
            <span className="t-titulo text-secondary-foreground">Registrar venta</span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
        {paso === 1 && (
          <>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="button" onClick={continuar} disabled={esCredito ? !clienteId : !clienteId && !nombre.trim()}>
              Continuar
            </Button>
          </>
        )}
        {paso === 2 && (
          <>
            <Button type="button" variant="outline" onClick={() => setPaso(1)}>
              Atrás
            </Button>
            <Button type="button" onClick={revisar}>
              Continuar
            </Button>
          </>
        )}
        {paso === 3 && (
          <>
            <Button type="button" variant="outline" onClick={() => setPaso(2)} disabled={saving}>
              Atrás
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={saving}>
              <FloppyDisk size={18} weight="bold" /> {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto @container">
        <div className="mx-auto w-full max-w-3xl p-6 flex flex-col gap-4">
          <span className="t-etiqueta text-muted-foreground">
            Paso {paso} de 3 · {paso === 1 ? 'Cliente y tipo de cobro' : paso === 2 ? 'Tipo de venta y cobro' : 'Revisión'}
          </span>
          {paso === 3 ? (
            <>
              <section className={seccion}>
                <div className="flex items-center justify-between">
                  <h4 className={tituloSeccion}>Cliente</h4>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPaso(1)}>Editar</Button>
                </div>
                <div className={datos}>
                  <Dato etiqueta="Nombre" valor={<span className="uppercase">{cliente?.nombre || nombre.trim() || 'Sin nombre'}</span>} />
                  <Dato etiqueta="Documento" valor={(cliente && documentoCliente(cliente)) || 'Sin documento'} />
                  <Dato etiqueta="Tipo de cobro" valor={<EstadoBadge tono={esCredito ? 'destructive' : 'success'}>{esCredito ? 'Crédito' : 'Directa'}</EstadoBadge>} />
                </div>
              </section>

              <section className={seccion}>
                <div className="flex items-center justify-between">
                  <h4 className={tituloSeccion}>Venta</h4>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPaso(2)}>Editar</Button>
                </div>
                <div className={datos}>
                  <Dato etiqueta="Monto" valor={<span className="t-valor">${(parseFloat(monto) || 0).toFixed(2)}</span>} />
                  <Dato etiqueta="Origen" valor={<OrigenBadge origen={origen} />} />
                  {!esCredito && <Dato etiqueta="Método de pago" valor={metodo.charAt(0).toUpperCase() + metodo.slice(1)} />}
                  {!esCredito && metodo === 'transferencia' && bancoDestino && <Dato etiqueta="Banco destino" valor={bancoDestino} />}
                  {!esCredito && metodo === 'transferencia' && <Dato etiqueta="N.º de comprobante" valor={numeroComprobanteTransf.trim()} />}
                  {!esCredito && metodo === 'tarjeta' && <Dato etiqueta="Red de cobro" valor={redTarjeta} />}
                  {!esCredito && comprobanteFile && <Dato etiqueta="Comprobante" valor={comprobanteFile.name} />}
                  {esCredito && <Dato etiqueta="Saldo" valor="Queda pendiente de cobro" />}
                </div>
              </section>

              {descripcion.trim() && (
                <section className={seccion}>
                  <div className="flex items-center justify-between">
                    <h4 className={tituloSeccion}>Detalle</h4>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPaso(2)}>Editar</Button>
                  </div>
                  <Dato etiqueta="Descripción" valor={descripcion.trim()} />
                </section>
              )}
            </>
          ) : paso === 1 ? (
            <>
          {/* Cliente */}
          <section className={seccion}>
            <div className="flex items-center justify-between">
              <h4 className={tituloSeccion}>Cliente {esCredito && <span className="text-destructive">*</span>}</h4>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNuevoClienteOpen(true)} className="gap-1 text-primary">
                <UserPlus size={14} weight="bold" /> Nuevo cliente
              </Button>
            </div>
            <ClienteBuscador
              value={clienteId}
              onChange={setClienteId}
              placeholder={esCredito ? 'Cliente / agencia (requerido)' : 'Buscar cliente registrado (opcional)'}
              inputClassName="h-10 pl-9 t-cuerpo"
            />
            {esCredito && !clienteId && <p className="t-meta text-destructive">Selecciona un cliente o agencia para la venta a crédito</p>}
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>{esCredito ? 'Nombre de referencia (opcional)' : 'Nombre (si no está registrado)'}</Label>
              <Input type="text" placeholder="Ej. Juan Pérez" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-12 text-base" />
            </div>
          </section>

          {/* Tipo de cobro */}
          <section className={seccion}>
            <h4 className={tituloSeccion}>Tipo de cobro</h4>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'directa', label: 'Directa', icon: CheckCircle },
                { value: 'credito', label: 'Crédito', icon: CreditCard },
              ] as const).map(({ value, label, icon: Icon }) => (
                <Button
                  key={value} type="button" aria-pressed={tipo === value} onClick={() => setTipo(value)}
                  variant={tipo === value ? 'default' : 'outline'}
                  className={cn("h-12 gap-2 text-muted-foreground hover:text-foreground",
                    tipo === value && (value === 'credito' ? "bg-destructive border-destructive text-white hover:text-white" : "bg-success border-success text-white hover:text-white"))}
                >
                  <Icon size={16} weight="bold" /> {label}
                </Button>
              ))}
            </div>
            <p className={cn("rounded-2xl px-3 py-2 t-dato leading-snug",
              esCredito ? "bg-warning-soft text-warning-foreground" : "bg-muted text-muted-foreground")}>
              {esCredito
                ? 'Queda registrada con saldo pendiente — se liquida después desde el detalle.'
                : 'Se cobra ahora mismo, con el método de pago que indiques abajo.'}
            </p>
          </section>

            </>
          ) : (
            <>
          {/* Origen */}
          <section className={seccion}>
            <h4 className={tituloSeccion}>Origen</h4>
            <div className="grid grid-cols-2 @xl:grid-cols-4 gap-2">
              {ORIGEN_OPTS.map(o => (
                <button
                  key={o.value} type="button" aria-pressed={origen === o.value} onClick={() => setOrigen(o.value)}
                  className={cn("py-3 px-2 rounded-2xl border flex flex-col items-center gap-1.5 transition-colors cursor-pointer",
                    origen === o.value ? ORIGEN_CLASSES[o.value] : "bg-card border-border text-muted-foreground hover:text-foreground")}
                >
                  <o.icon size={22} weight={origen === o.value ? 'fill' : 'bold'} />
                  <span className="t-dato text-center leading-tight">{o.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Monto y pago */}
          <section className={seccion}>
            <div className={cn("grid gap-3", esCredito ? "grid-cols-1" : "grid-cols-1 @md:grid-cols-2")}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="venta-monto" className={etiqueta}>Monto</Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 t-cuerpo-fuerte text-muted-foreground pointer-events-none">$</span>
                  <Input id="venta-monto" type="number" inputMode="decimal" step="0.01" min={0} placeholder="0.00" value={monto}
                    onChange={(e) => setMonto(e.target.value)} aria-invalid={intentado && falta.monto} className="h-12 pl-7 text-base" />
                </div>
                {intentado && falta.monto && <p className="t-meta text-destructive">Ingresa un monto mayor a 0</p>}
              </div>
              {!esCredito && (
                <div className="flex flex-col gap-1.5">
                  <Label className={etiqueta}>Método de pago</Label>
                  <Select value={metodo} onValueChange={(v) => setMetodo(v as typeof METODOS[number])}>
                    <SelectTrigger className="data-[size=default]:h-12 w-full px-2.5 text-base rounded-2xl bg-card border-border shadow-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METODOS.map(m => (
                        <SelectItem key={m} value={m} className="t-cuerpo">{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
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
                    <SelectTrigger className="data-[size=default]:h-12 w-full px-2.5 text-base rounded-2xl bg-card border-border shadow-xs">
                      <SelectValue placeholder={bancos.length ? 'Selecciona' : 'Sin bancos configurados'} />
                    </SelectTrigger>
                    <SelectContent>
                      {bancos.map(b => (<SelectItem key={b} value={b} className="t-cuerpo">{b}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className={etiqueta}>N.º de comprobante *</Label>
                  <Input type="text" placeholder="Ej. 000123456" value={numeroComprobanteTransf}
                    onChange={(e) => setNumeroComprobanteTransf(e.target.value)} aria-invalid={intentado && falta.numero} className="h-12 text-base" />
                  {intentado && falta.numero && <p className="t-meta text-destructive">Ingresa el número de comprobante</p>}
                </div>
              </div>
            )}

            {!esCredito && metodo === 'tarjeta' && (
              <div className="flex flex-col gap-1.5">
                <Label className={etiqueta}>Red de cobro *</Label>
                <RedCobroRadios redes={redesTarjeta} value={redTarjeta} onChange={setRedTarjeta} invalido={intentado && falta.red} />
                {intentado && falta.red && <p className="t-meta text-destructive">Selecciona la red de cobro</p>}
              </div>
            )}

            {!esCredito && (
              <div className="flex flex-col gap-1.5">
                <Label className={etiqueta}>Comprobante de pago (opcional)</Label>
                <ComprobanteAdjunto file={comprobanteFile} onChange={setComprobanteFile} />
              </div>
            )}
          </section>

          {/* Detalle */}
          <section className={seccion}>
            <div className="flex flex-col gap-1.5">
              <Label className={etiqueta}>Descripción / referencia (opcional)</Label>
              <Textarea placeholder="Ej. reserva del 12 al 15 de agosto" value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)} className="min-h-24 text-base" />
            </div>
          </section>
            </>
          )}
        </div>
      </div>

      <ClienteFormModal
        opened={nuevoClienteOpen}
        onClose={() => setNuevoClienteOpen(false)}
        onCreatedGoToCuenta={(nuevoId) => setClienteId(nuevoId)}
      />
    </div>
  );
}
