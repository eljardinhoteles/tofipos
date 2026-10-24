import { useState } from'react';
import { CaretLeft, CaretRight, Plus, CalendarDot, Rows, CalendarBlank } from'@phosphor-icons/react';
import { Button, ButtonGroup } from'@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from'@/components/ui/popover';
import { Calendar } from'@/components/ui/calendar';

import { useUI } from'../../context/UIContext';
import { cn } from'@/lib/utils';
import { SeccionesMesas } from'../Common/SeccionesMesas';
import { PageHeader, headerPrimaryButtonClass, headerIconButtonClass } from'../Common/PageHeader';

interface CalendarHeaderProps {
 visibleDates: Date[];
 onNewReserva: () => void;
 vista: 'calendario' | 'lista';
 onCambiarVista: () => void;
}

// Header de Reservas: título, secciones y la acción principal (el buscador está en la vista de lista).
export function CalendarHeader({ visibleDates, onNewReserva, vista, onCambiarVista }: CalendarHeaderProps) {
 const mes = visibleDates[0]?.toLocaleDateString('es-ES', { month:'long', year:'numeric'}) ?? '';
 // Con el formulario de nueva reserva abierto en el sidebar, el botón sobra.
 const { reservaView, selectedReservaId } = useUI();
 const creandoReserva = reservaView === 'nueva' && !selectedReservaId;
 return (
 <PageHeader
 title="Reservas"
 tabs={<SeccionesMesas />}
 subtitle={<span className="inline-block first-letter:uppercase">{vista === 'lista' ? 'Próximas reservas' : mes}</span>}
 actions={(
 // Siempre montado: al cerrar el sidebar el contenido tarda 0.5 s en volver a su
 // ancho; si el botón apareciera de golpe se vería deslizarse. Se oculta al instante
 // y reaparece con un fundido retrasado, cuando el header ya se acomodó.
 <div className={cn('flex items-center gap-2', creandoReserva ? 'opacity-0 pointer-events-none' : 'opacity-100 transition-opacity duration-300 delay-300')}>
 <button type="button" onClick={onCambiarVista} className={headerIconButtonClass} tabIndex={creandoReserva ? -1 : 0}
 title={vista === 'lista' ? 'Ver calendario' : 'Ver lista'} aria-label={vista === 'lista' ? 'Ver calendario' : 'Ver lista'}>
 {vista === 'lista' ? <CalendarBlank size={18} weight="bold" /> : <Rows size={18} weight="bold" />}
 </button>
 <button type="button" onClick={onNewReserva} title="Nueva reserva" aria-label="Nueva reserva" tabIndex={creandoReserva ? -1 : 0}
 className={headerPrimaryButtonClass}>
 <Plus size={18} weight="bold"/>
   <span className="hidden 2xl:inline">Nueva reserva</span>
 </button>
 </div>
 )}
 />
 );
}

interface CalendarNavProps {
 startDate: Date;
 setStartDate: (d: Date) => void;
 shiftDays: (n: number) => void;
 goToday: () => void;
 visibleDates: Date[];
}

// Navegación de fechas compacta: va en la primera celda del calendario (la
// esquina sobre la columna de zonas), en una sola fila.
export function CalendarNav({ startDate, setStartDate, shiftDays, goToday, visibleDates }: CalendarNavProps) {
 const [monthPickerOpen, setMonthPickerOpen] = useState(false);
 const mes = visibleDates[0]?.toLocaleDateString('es-ES', { month:'long' }) ?? '';
 return (
 <div className="flex items-center gap-1.5 w-full">
 <ButtonGroup className="flex-1 min-w-0">
 <Button type="button" variant="ghost" size="icon" title="Días anteriores" onClick={() => shiftDays(-1)} className="h-8 w-7 shrink-0 text-muted-foreground">
 <CaretLeft size={14} weight="bold"/>
 </Button>
 <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
 <PopoverTrigger asChild>
 <Button type="button" variant="ghost" title="Elegir fecha" className="h-8 px-2 min-w-0 flex-1 t-dato">
 <span className="inline-block first-letter:uppercase truncate">{mes}</span>
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0" align="start">
 <Calendar
 mode="single"
 selected={startDate}
 defaultMonth={startDate}
 onSelect={(date) => {
 if (!date) return;
 date.setHours(0, 0, 0, 0);
 setStartDate(date);
 setMonthPickerOpen(false);
 }}
 />
 </PopoverContent>
 </Popover>
 <Button type="button" variant="ghost" size="icon" title="Días siguientes" onClick={() => shiftDays(1)} className="h-8 w-7 shrink-0 text-muted-foreground">
 <CaretRight size={14} weight="bold"/>
 </Button>
 </ButtonGroup>
 <Button type="button" variant="outline" size="icon" title="Ir a hoy" aria-label="Ir a hoy" onClick={goToday} className="h-8 w-8 shrink-0">
 <CalendarDot size={16} weight="bold"/>
 </Button>
 </div>
 );
}
