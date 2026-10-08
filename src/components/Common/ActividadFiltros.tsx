import { WarningCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Filtros del panel de actividad (Todo / Cobros / Alertas) con el control
// segmentado del UI kit. Alertas se destaca en ámbar cuando hay algo que revisar.

export type FiltroActividad = 'todo' | 'cobros' | 'alertas';

interface ActividadFiltrosProps {
  valor: FiltroActividad;
  onChange: (filtro: FiltroActividad) => void;
  conteos: Record<FiltroActividad, number>;
}

function Conteo({ n, alerta }: { n: number; alerta?: boolean }) {
  return (
    <span className={cn('min-w-5 rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums font-extrabold',
      alerta && n > 0 ? 'bg-warning-soft text-warning-foreground' : 'bg-foreground/10 text-muted-foreground')}>
      {n}
    </span>
  );
}

export function ActividadFiltros({ valor, onChange, conteos }: ActividadFiltrosProps) {
  return (
    <div className="px-5 py-3 border-b border-border bg-background shrink-0">
      <Tabs value={valor} onValueChange={(v) => onChange(v as FiltroActividad)}>
        <TabsList aria-label="Filtrar actividad">
          <TabsTrigger value="todo">Todo <Conteo n={conteos.todo} /></TabsTrigger>
          <TabsTrigger value="cobros">Cobros <Conteo n={conteos.cobros} /></TabsTrigger>
          <TabsTrigger value="alertas">
            <WarningCircle size={14} weight="fill" className={conteos.alertas > 0 ? 'text-warning-foreground' : undefined} />
            Alertas <Conteo n={conteos.alertas} alerta />
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
