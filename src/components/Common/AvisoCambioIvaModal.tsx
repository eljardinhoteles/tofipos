import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Percent, ArrowRight, Gear, Receipt, CreditCard } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '../../context/AuthContext';
import { useRxAjustesIva } from '../../hooks/useRxAjustesIva';
import { calcularAvisoIva, type AvisoIva } from '../../lib/avisoIva';

// Aviso de cambio de IVA (p. ej. feriados en Ecuador: 15% → 8%). Se muestra una
// vez por sesión y día. Recuerda los tres lugares donde hay que cambiarlo a mano.

const STORAGE_PREFIX = 'pos_aviso_iva:';

function yaMostrado(clave: string) {
  try { return sessionStorage.getItem(STORAGE_PREFIX + clave) === '1'; } catch { return false; }
}

function marcarMostrado(clave: string) {
  try { sessionStorage.setItem(STORAGE_PREFIX + clave, '1'); } catch { /* sin sessionStorage: se mostrará de nuevo */ }
}

function fechaCorta(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function textos(aviso: AvisoIva) {
  const cambio = `${aviso.actual}% → ${aviso.destino.porcentaje}%`;
  const vigencia = `${fechaCorta(aviso.desde)} – ${fechaCorta(aviso.hasta)}`;
  if (aviso.tipo === 'revertir') {
    return {
      titulo: `Terminó el IVA temporal: vuelve al ${aviso.destino.porcentaje}%`,
      descripcion: `La tasa temporal (${vigencia}) ya terminó. Regresa a ${cambio}.`,
      cambio,
      pasos: [
        { icon: Gear, texto: `En el sistema: activa la tasa de ${aviso.destino.porcentaje}% en Ajustes → IVA.` },
        { icon: Receipt, texto: 'En las comandas abiertas: siguen con el IVA temporal. Cámbialo en cada una (menú de la comanda → IVA).' },
        { icon: CreditCard, texto: `En el terminal de tarjetas: vuelve a configurar el IVA al ${aviso.destino.porcentaje}%.` },
      ],
    };
  }
  const cuando = aviso.tipo === 'proximo' ? 'Mañana' : 'Hoy';
  const verbo = aviso.tipo === 'proximo' ? 'Mañana activa' : 'Activa';
  return {
    titulo: `${cuando} cambia el IVA: ${cambio}`,
    descripcion: `Tasa temporal vigente del ${vigencia}.`,
    cambio,
    pasos: [
      { icon: Gear, texto: `En el sistema: ${verbo.toLowerCase()} la tasa de ${aviso.destino.porcentaje}% en Ajustes → IVA.` },
      { icon: Receipt, texto: 'En las comandas abiertas: conservan el IVA anterior. Cámbialo en cada una (menú de la comanda → IVA).' },
      { icon: CreditCard, texto: `En el terminal de tarjetas: cambia el IVA al ${aviso.destino.porcentaje}% para que los cobros coincidan.` },
    ],
  };
}

export function AvisoCambioIvaModal() {
  const { ajustesIva } = useRxAjustesIva();
  const { currentMesero } = useAuth();
  const navigate = useNavigate();
  const aviso = useMemo(() => calcularAvisoIva(ajustesIva), [ajustesIva]);
  const [abierto, setAbierto] = useState<string | null>(null);

  // Abre el aviso una sola vez por sesión (y día) y lo marca como mostrado al instante.
  useEffect(() => {
    if (!aviso || yaMostrado(aviso.clave)) return;
    marcarMostrado(aviso.clave);
    setAbierto(aviso.clave);
  }, [aviso]);

  const esAdmin = !currentMesero || currentMesero.rol === 'admin';
  if (!aviso || abierto !== aviso.clave) return null;
  const t = textos(aviso);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setAbierto(null); }}>
      <DialogContent className="max-w-md gap-5">
        <DialogHeader className="text-left gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-warning-soft text-warning-foreground flex items-center justify-center shrink-0">
              <Percent size={24} weight="bold" />
            </div>
            <div className="flex items-center gap-2 font-black text-2xl text-foreground tabular-nums">
              {aviso.actual}% <ArrowRight size={18} weight="bold" className="text-muted-foreground" /> {aviso.destino.porcentaje}%
            </div>
          </div>
          <DialogTitle className="font-extrabold text-base">{t.titulo}</DialogTitle>
          <DialogDescription className="text-xs">{t.descripcion}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Qué debes cambiar</span>
          {t.pasos.map(({ icon: Icon, texto }, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-muted p-3">
              <div className="w-7 h-7 rounded-lg bg-card text-foreground flex items-center justify-center shrink-0 shadow-xs">
                <Icon size={16} weight="bold" />
              </div>
              <span className="text-sm font-semibold text-foreground leading-snug">{texto}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {esAdmin && (
            <Button
              variant="outline"
              onClick={() => { setAbierto(null); navigate('/v2/ajustes/iva'); }}
            >
              <Gear size={16} weight="bold" /> Ir a Ajustes → IVA
            </Button>
          )}
          <Button onClick={() => setAbierto(null)}>Entendido</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
