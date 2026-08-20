import { useEffect, useState } from 'react';
import { Percent, Check } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useRxAjustesIva } from '../../../hooks/useRxAjustesIva';
import { useIvaActivo } from '../../../hooks/useIvaActivo';

interface SidebarComandaIvaModalProps {
  opened: boolean;
  onClose: () => void;
  /** IVA efectivo actual de la comanda (override si tiene, si no el global). */
  currentPorcentaje: number;
  /** true si la comanda tiene un override propio (distinto del IVA global). */
  esOverride: boolean;
  onConfirm: (data: { porcentaje: number; preciosConIva: boolean } | null) => Promise<void>;
}

/**
 * Permite fijar manualmente el IVA de una comanda puntual (p. ej. dejarla en
 * 0%/exento), eligiendo entre las tasas configuradas en Ajustes. "Usar IVA
 * global" limpia el override para que la comanda vuelva a seguir el IVA
 * activo en vivo — mismo comportamiento que antes de fijar un override.
 */
export function SidebarComandaIvaModal({ opened, onClose, currentPorcentaje, esOverride, onConfirm }: SidebarComandaIvaModalProps) {
  const { ajustesIva } = useRxAjustesIva();
  const { porcentaje: porcentajeGlobal } = useIvaActivo();
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opened) setSelected(esOverride ? currentPorcentaje : null);
  }, [opened, esOverride, currentPorcentaje]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  // Tasas configuradas en Ajustes, más una opción explícita de 0% (exento)
  // si no existe ya una tasa en 0 entre las configuradas.
  const opciones = [...ajustesIva].sort((a, b) => a.porcentaje - b.porcentaje);
  const tieneExento = opciones.some(o => o.porcentaje === 0);
  if (!tieneExento) {
    opciones.unshift({ id: '__exento__', porcentaje: 0, precios_con_iva: false });
  }

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (selected === null) {
        await onConfirm(null);
      } else {
        const opcion = opciones.find(o => o.porcentaje === selected);
        await onConfirm({ porcentaje: selected, preciosConIva: !!opcion?.precios_con_iva });
      }
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
            <Percent size={18} weight="bold" className="text-primary" />
            IVA de esta comanda
          </DialogTitle>
          <DialogDescription>
            Fija una tasa distinta a la global solo para esta comanda (por ejemplo, 0% exento).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={cn(
              "flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-semibold transition-colors cursor-pointer",
              selected === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/60 text-foreground border-border hover:bg-muted"
            )}
          >
            <span>Usar IVA global ({porcentajeGlobal}%)</span>
            {selected === null && <Check size={16} weight="bold" />}
          </button>

          {opciones.map(o => (
            <button
              key={o.id ?? o.porcentaje}
              type="button"
              onClick={() => setSelected(o.porcentaje)}
              className={cn(
                "flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-semibold transition-colors cursor-pointer",
                selected === o.porcentaje
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/60 text-foreground border-border hover:bg-muted"
              )}
            >
              <span>{o.porcentaje === 0 ? '0% (Exento)' : `${o.porcentaje}%`}</span>
              {selected === o.porcentaje && <Check size={16} weight="bold" />}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
