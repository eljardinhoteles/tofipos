import { useMemo, useState } from 'react';
import {
  ForkKnife, ChefHat, Receipt, CurrencyDollar, Bed, XCircle, Gift, ArrowUUpLeft,
  SignIn, SignOut, FileText, UsersThree, Pulse, ArrowsClockwise, X,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { useUI } from '../../context/UIContext';
import { useActividadDia } from '../../hooks/useActividadDia';
import { ActividadFiltros, type FiltroActividad } from './ActividadFiltros';
import type { ActividadEvento, ActividadTipo, ActividadTono } from '../../lib/actividadDia';

// Drawer lateral con la actividad del día (mesas abiertas, cargos a habitación,
// cobros, anulaciones…), para revisar si algo se escapó. Se arma con los datos
// existentes: no guarda nada aparte.

const ICONOS: Record<ActividadTipo, React.ElementType> = {
  mesa_abierta: ForkKnife,
  cocina: ChefHat,
  cuenta: Receipt,
  cobrada: CurrencyDollar,
  cobro: CurrencyDollar,
  habitacion: Bed,
  anulacion: XCircle,
  cortesia: Gift,
  reembolso: ArrowUUpLeft,
  checkin: SignIn,
  checkout: SignOut,
  venta: FileText,
  reparto: UsersThree,
};

const TONOS: Record<ActividadTono, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success-soft text-success-foreground',
  info: 'bg-info-soft text-info-foreground',
  warning: 'bg-warning-soft text-warning-foreground',
  danger: 'bg-destructive-soft text-destructive',
  neutral: 'bg-muted text-muted-foreground',
};

const ES_COBRO = new Set<ActividadTipo>(['cobrada', 'cobro', 'reembolso']);

const hora = (ts: string) =>
  ts.length === 10 ? '' : new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

function Fila({ e }: { e: ActividadEvento }) {
  const Icono = ICONOS[e.tipo];
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <div className={cn('size-10 rounded-xl flex items-center justify-center shrink-0', TONOS[e.tono])}>
        <Icono size={20} weight="bold" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-extrabold text-foreground leading-tight">{e.titulo}</span>
        {e.detalle && <span className="text-xs font-medium text-muted-foreground leading-snug break-words">{e.detalle}</span>}
        {e.actor && <span className="text-[11px] font-semibold text-muted-foreground/80">{e.actor}</span>}
      </div>
      <span className="shrink-0 text-xs font-bold text-muted-foreground tabular-nums pt-0.5">{hora(e.ts)}</span>
    </li>
  );
}

export function ActividadDrawer() {
  const { actividadOpen, setActividadOpen } = useUI();
  const { eventos, cargando, refrescar, refrescando, actualizadoA } = useActividadDia(actividadOpen);
  const [filtro, setFiltro] = useState<FiltroActividad>('todo');

  const alertas = useMemo(() => eventos.filter(e => e.alerta), [eventos]);
  const cobros = useMemo(() => eventos.filter(e => ES_COBRO.has(e.tipo)), [eventos]);
  const visibles = filtro === 'alertas' ? alertas : filtro === 'cobros' ? cobros : eventos;

  const conteos = { todo: eventos.length, cobros: cobros.length, alertas: alertas.length };
  const fechaLarga = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const fecha = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);

  return (
    <Sheet open={actividadOpen} onOpenChange={setActividadOpen}>
      <SheetContent side="right" showCloseButton={false} className="data-[side=right]:w-full data-[side=right]:sm:max-w-[30rem] p-0 gap-0 bg-background data-[side=right]:border-l-0">
        {/* Misma altura (72 px) que el header de las páginas, en neutro (sin verde). */}
        <SheetHeader className="h-[72px] px-5 py-0 gap-0 shrink-0 bg-background border-b border-border justify-center">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-card shadow-xs flex items-center justify-center text-foreground shrink-0">
              <Pulse size={22} weight="bold" />
            </div>
            <div className="flex flex-col min-w-0 text-left flex-1">
              <SheetTitle className="font-extrabold text-base text-foreground leading-tight">Actividad de hoy</SheetTitle>
              <SheetDescription className="text-xs font-semibold text-muted-foreground leading-tight truncate">
                {fecha}
                {actualizadoA && ` · actualizado ${actualizadoA.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`}
              </SheetDescription>
            </div>
            {/* Acciones del drawer: actualizar y cerrar. */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                className={cn("size-9 rounded-xl bg-card shadow-xs text-foreground hover:bg-muted inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-95", 'disabled:opacity-60')}
                onClick={refrescar}
                disabled={refrescando}
                title="Actualizar"
                aria-label="Actualizar actividad"
              >
                <ArrowsClockwise size={18} weight="bold" className={refrescando ? 'animate-spin' : ''} />
              </button>
              <SheetClose asChild>
                <button type="button" className="size-9 rounded-xl bg-card shadow-xs text-foreground hover:bg-muted inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-95" aria-label="Cerrar">
                  <X size={18} weight="bold" />
                </button>
              </SheetClose>
            </div>
          </div>
        </SheetHeader>

        <ActividadFiltros valor={filtro} onChange={setFiltro} conteos={conteos} />

        <div className="flex-1 min-h-0 overflow-y-auto">
          {cargando && eventos.length === 0 ? (
            <div className="p-8 text-center text-xs font-semibold text-muted-foreground">Cargando actividad…</div>
          ) : visibles.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Pulse size={36} className="text-muted-foreground/50" />
              <span className="text-sm font-bold text-foreground">
                {filtro === 'alertas' ? 'Sin alertas hoy' : 'Sin actividad todavía'}
              </span>
              <span className="text-xs text-muted-foreground">
                {filtro === 'alertas' ? 'No hay anulaciones, cortesías ni reembolsos.' : 'Aquí aparecerá lo que ocurra durante el día.'}
              </span>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {visibles.map(e => <Fila key={e.id} e={e} />)}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-2.5 text-[11px] font-medium text-muted-foreground bg-background">
          Se arma con los datos del día; algunas horas son aproximadas.
        </div>
      </SheetContent>
    </Sheet>
  );
}
