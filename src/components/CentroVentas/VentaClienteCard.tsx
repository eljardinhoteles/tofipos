import { useState, useMemo } from 'react';
import { PencilSimple, X, Check, User, IdentificationCard, Phone, EnvelopeSimple, MapPin, Buildings, Copy, CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import { useRxClientes } from '../../hooks/useRxClientes';
import { updateRxVenta } from '../../db/rxdb';
import type { RxVenta, RxCliente } from '../../db/rxdb';
import { ClienteSelector } from '@/components/Common/ClienteSelector';

interface VentaClienteCardProps {
  venta: RxVenta;
}

const TIPO_CLIENTE_LABEL: Record<string, string> = {
  persona_natural: 'Persona natural',
  juridico: 'Jurídico',
  extranjero: 'Extranjero',
  agencia: 'Agencia',
};

// Fila de dato con botón de copiar — usado tanto en Contacto como en
// Facturación para no repetir el mismo patrón de icono + texto + copiar.
function DatoRow({ icon: Icon, value }: { icon: typeof Phone; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast.error('No se pudo copiar');
    }
  };

  return (
    <div className="flex items-center gap-2 text-muted-foreground group">
      <Icon size={12} className="shrink-0" />
      <span className="text-foreground font-semibold truncate flex-1 min-w-0">{value}</span>
      <button
        type="button" onClick={handleCopy} title="Copiar"
        className={cn(
          "shrink-0 transition-colors cursor-pointer",
          copied ? "text-emerald-600" : "text-muted-foreground/50 hover:text-primary"
        )}
      >
        {copied ? <CheckCircle size={12} weight="fill" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

/**
 * Datos de cliente + facturación de la venta, con edición inline directa
 * (sin pasar por el historial de movimientos — cambiar el cliente es una
 * corrección de datos, no un evento de dinero). Contacto y facturación se
 * muestran en la misma fila, en 2 columnas; cada dato es copiable. Solo se
 * muestran los campos que el cliente tenga cargados.
 */
export function VentaClienteCard({ venta }: VentaClienteCardProps) {
  const { clientes } = useRxClientes();
  const [editing, setEditing] = useState(false);
  const [clienteId, setClienteId] = useState(venta.cliente_id ?? '');
  const [nombreLibre, setNombreLibre] = useState(venta.cliente_nombre ?? '');
  const [saving, setSaving] = useState(false);

  const clienteVinculado = useMemo(
    () => (venta.cliente_id ? clientes.find((c: any) => c.id === venta.cliente_id) : null),
    [clientes, venta.cliente_id]
  );

  const startEdit = () => {
    setClienteId(venta.cliente_id ?? '');
    setNombreLibre(venta.cliente_nombre ?? '');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cliente = clientes.find((c: any) => c.id === clienteId);
      await updateRxVenta(venta.id, {
        cliente_id: clienteId || undefined,
        cliente_nombre: nombreLibre.trim() || cliente?.nombre || undefined,
      });
      showToast.success('Cliente actualizado');
      setEditing(false);
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo actualizar el cliente');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2 pt-3 border-t border-border">
        <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Cliente</span>
        <ClienteSelector
          value={nombreLibre}
          placeholder="Buscar cliente o escribir nombre libre..."
          onChange={(nombre) => {
            setNombreLibre(nombre);
            setClienteId('');
          }}
          onSelect={(cliente: RxCliente) => setClienteId(cliente.id)}
        />
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={saving} className="h-9 flex-1">
            <X size={14} /> Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} className="h-9 flex-1">
            <Check size={14} /> Guardar
          </Button>
        </div>
      </div>
    );
  }

  const c = clienteVinculado;
  const tieneContacto = c && (c.telefono || c.email || c.direccion);
  const tieneFacturacion = c && (c.nombre_factura || c.numero_doc || c.direccion_fiscal || c.email_factura);

  return (
    <div className="flex flex-col gap-2 pt-3 border-t border-border">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Cliente</span>
        <button
          type="button" onClick={startEdit}
          className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
          title="Cambiar cliente"
        >
          <PencilSimple size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <User size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-extrabold text-foreground">{venta.cliente_nombre || 'Sin cliente'}</span>
        {c?.tipo_cliente && (
          <span className="text-[10px] font-bold text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            {TIPO_CLIENTE_LABEL[c.tipo_cliente] ?? c.tipo_cliente}
          </span>
        )}
      </div>

      {(tieneContacto || tieneFacturacion) && (
        <div className="grid grid-cols-2 gap-4">
          {tieneContacto && (
            <div className="flex flex-col gap-1 text-xs min-w-0">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Contacto</span>
              {c.telefono && <DatoRow icon={Phone} value={c.telefono} />}
              {c.email && <DatoRow icon={EnvelopeSimple} value={c.email} />}
              {c.direccion && <DatoRow icon={MapPin} value={c.direccion} />}
            </div>
          )}

          {tieneFacturacion && (
            <div className="flex flex-col gap-1 text-xs min-w-0">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Buildings size={11} /> Facturación
              </span>
              {c.nombre_factura && <DatoRow icon={User} value={c.nombre_factura} />}
              {c.numero_doc && (
                <DatoRow icon={IdentificationCard} value={c.tipo_doc ? `${c.tipo_doc.toUpperCase()}: ${c.numero_doc}` : c.numero_doc} />
              )}
              {c.direccion_fiscal && <DatoRow icon={MapPin} value={c.direccion_fiscal} />}
              {c.email_factura && <DatoRow icon={EnvelopeSimple} value={c.email_factura} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
