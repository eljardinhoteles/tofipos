import { useState } from 'react';
import { Bank, CreditCard, Plus, X } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { showToast } from '@/lib/toast';
import { useMetodosPagoConfig } from '../../hooks/useMetodosPagoConfig';

// Sección reutilizada para ambas listas (bancos y redes de tarjeta): mismo
// patrón agregar/quitar, solo cambia el título, ícono y datos.
function ListaEditable({
  icon: Icon, titulo, descripcion, items, placeholder, onGuardar,
}: {
  icon: typeof Bank;
  titulo: string;
  descripcion: string;
  items: string[];
  placeholder: string;
  onGuardar: (nuevos: string[]) => Promise<void>;
}) {
  const [nuevo, setNuevo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAgregar = async () => {
    const valor = nuevo.trim();
    if (!valor) return;
    if (items.some(i => i.toLowerCase() === valor.toLowerCase())) {
      showToast.error('Ya existe en la lista');
      return;
    }
    setSaving(true);
    try {
      await onGuardar([...items, valor]);
      setNuevo('');
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleQuitar = async (valor: string) => {
    setSaving(true);
    try {
      await onGuardar(items.filter(i => i !== valor));
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo eliminar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
          <Icon size={20} weight="bold" />
        </div>
        <div className="flex flex-col">
          <h3 className="font-extrabold text-base text-foreground">{titulo}</h3>
          <p className="text-xs text-muted-foreground">{descripcion}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="text" placeholder={placeholder} value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAgregar(); }}
          className="h-9 text-xs flex-1"
        />
        <Button type="button" size="sm" onClick={handleAgregar} disabled={saving || !nuevo.trim()}>
          <Plus size={14} weight="bold" /> Agregar
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground font-semibold text-center py-4">
          Sin opciones configuradas todavía.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map(item => (
            <span
              key={item}
              className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-muted border border-border text-xs font-bold text-foreground"
            >
              {item}
              <button
                type="button" onClick={() => handleQuitar(item)} disabled={saving}
                className="w-4 h-4 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X size={11} weight="bold" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Ajustes > Métodos de pago — listas administrables de bancos destino
 * (transferencias) y redes de tarjeta (TC) que se ofrecen al registrar un
 * pago en el Centro de Ventas.
 */
export default function AjustesMetodosPago() {
  const { bancos, redesTarjeta, guardarBancos, guardarRedesTarjeta } = useMetodosPagoConfig();

  return (
    <div className="flex flex-col gap-6 py-6">
      <ListaEditable
        icon={Bank}
        titulo="Bancos destino"
        descripcion="Aparecen al registrar un pago por transferencia."
        items={bancos}
        placeholder="Ej. Banco Pichincha"
        onGuardar={guardarBancos}
      />
      <ListaEditable
        icon={CreditCard}
        titulo="Redes de tarjeta"
        descripcion="Aparecen al registrar un pago con tarjeta."
        items={redesTarjeta}
        placeholder="Ej. Visa"
        onGuardar={guardarRedesTarjeta}
      />
    </div>
  );
}
