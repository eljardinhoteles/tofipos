import { memo, useState } from 'react';
import { CalendarDot, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Button, ButtonGroup } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DIAS, inicioDe, inicioPorDefecto, sumarDias } from '../../lib/planificadorFechas';

interface Props {
  inicio: Date;
  empiezaHoy: boolean;
  onCambiar: (inicio: Date) => void;
}

// Navegación de fechas: va en la esquina de la cuadrícula (sobre la columna de etiquetas), igual que en el
// calendario de Reservas: anterior · mes (abre el calendario, que trae el botón "Ir a hoy") · siguiente.
export const NavegacionPlan = memo(function NavegacionPlan({ inicio, empiezaHoy, onCambiar }: Props) {
  const [abierto, setAbierto] = useState(false);
  // Solo el mes en curso (el del primer día visible), como en el calendario de Reservas.
  const mes = inicio.toLocaleDateString('es-ES', { month: 'long' });
  return (
    <div className="flex items-center w-full">
      <ButtonGroup className="flex-1 min-w-0">
        <Button type="button" variant="ghost" size="icon" title="Días anteriores" aria-label="Días anteriores"
          onClick={() => onCambiar(sumarDias(inicio, -DIAS))} className="h-8 w-7 shrink-0 text-muted-foreground">
          <CaretLeft size={14} weight="bold" />
        </Button>
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" title="Elegir fecha" className="h-8 px-2 min-w-0 flex-1 t-dato">
              <span className="inline-block first-letter:uppercase truncate">{mes}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="p-2 border-b border-border">
              <Button type="button" variant="outline" className="w-full gap-2" disabled={empiezaHoy}
                onClick={() => { onCambiar(inicioPorDefecto()); setAbierto(false); }}>
                <CalendarDot size={16} weight="bold" /> Ir a hoy
              </Button>
            </div>
            <Calendar
              mode="single"
              selected={inicio}
              defaultMonth={inicio}
              onSelect={(date) => {
                if (!date) return;
                onCambiar(inicioDe(date));
                setAbierto(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <Button type="button" variant="ghost" size="icon" title="Días siguientes" aria-label="Días siguientes"
          onClick={() => onCambiar(sumarDias(inicio, DIAS))} className="h-8 w-7 shrink-0 text-muted-foreground">
          <CaretRight size={14} weight="bold" />
        </Button>
      </ButtonGroup>
    </div>
  );
});
