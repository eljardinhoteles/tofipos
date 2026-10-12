import { useState } from 'react';
import { Bank, CreditCard, Plus, Trash } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/toast';
import { Fila, Grupo, Seccion, Vacio } from '../../components/Ajustes/AjustesUI';
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
    <Seccion titulo={titulo} descripcion={descripcion}>
      <div className="flex items-center gap-2">
        <Input
          type="text" placeholder={placeholder} value={nuevo} aria-label={placeholder}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAgregar(); }}
          className="h-12 flex-1 min-w-0 text-base"
        />
        <Button type="button" onClick={handleAgregar} disabled={saving || !nuevo.trim()} className="h-12 shrink-0 gap-1.5 px-5">
          <Plus size={18} weight="bold" /> Agregar
        </Button>
      </div>
      <Grupo>
        {items.length === 0 ? (
          <Vacio>Sin opciones configuradas todavía.</Vacio>
        ) : (
          items.map((item) => (
            <Fila key={item} titulo={item} icono={<Icon size={18} className="text-muted-foreground shrink-0" />}>
              <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${item}`} onClick={() => handleQuitar(item)} disabled={saving}
                className="size-11 text-muted-foreground hover:text-destructive touch-manipulation">
                <Trash size={18} />
              </Button>
            </Fila>
          ))
        )}
      </Grupo>
    </Seccion>
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
    <div className="flex flex-col gap-6">
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
