import { useState } from'react';
import { CaretLeft, CaretRight, Plus, Rows, CalendarBlank } from'@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from'@/components/ui/popover';
import { Calendar } from'@/components/ui/calendar';

import { useUI } from'../../context/UIContext';
import { cn } from'@/lib/utils';
import { SeccionesMesas } from'../Common/SeccionesMesas';
import { useIsMobile } from'../../hooks/useIsMobile';
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
 // Las secciones de Mesas (Mesas, Reservas, Planificador, Métricas) son de PC: en celular se navega con la barra inferior.
 const isMobile = useIsMobile();
 return (
 <PageHeader
 title="Reservas"
 tabs={isMobile ? undefined : <SeccionesMesas />}
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

const corto = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');

// Celda de la esquina, a la altura de la fila de meses: el rango visible; al tocarla abre el calendario para saltar a una fecha.
export function CalendarEsquinaFecha({ startDate, setStartDate, visibleDates }: Omit<CalendarNavProps, 'shiftDays' | 'goToday'>) {
 const [abierto, setAbierto] = useState(false);
 const ultima = visibleDates[visibleDates.length - 1];
 return (
 <Popover open={abierto} onOpenChange={setAbierto}>
 <PopoverTrigger asChild>
 <button type="button" title="Ir a una fecha" aria-label="Ir a una fecha"
 className="h-full w-full min-w-0 px-2 flex items-center justify-center gap-1.5 t-dato whitespace-nowrap cursor-pointer transition-colors bg-muted/60 hover:bg-muted focus-visible:outline-none focus-visible:bg-muted">
 <CalendarBlank size={14} weight="bold" className="shrink-0" />
 <span className="truncate">{visibleDates[0] ? corto(visibleDates[0]) : ''} – {ultima ? corto(ultima) : ''}</span>
 </button>
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
 setAbierto(false);
 }}
 />
 </PopoverContent>
 </Popover>
 );
}

// Celdas de la esquina, a la altura de la fila de días: ‹ Hoy ›. Cada control es una celda entera.
export function CalendarEsquinaNav({ shiftDays, goToday }: Pick<CalendarNavProps, 'shiftDays' | 'goToday'>) {
 const celda = 'flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-muted';
 return (
 <div className="h-full w-full flex divide-x divide-border/70">
 <button type="button" aria-label="Día anterior" title="Día anterior" onClick={() => shiftDays(-1)} className={cn(celda, 'w-11 shrink-0 hover:bg-muted')}><CaretLeft size={16} weight="bold" /></button>
 <button type="button" title="Ir a hoy" onClick={goToday} className={cn(celda, 'flex-1 min-w-0 bg-primary/15 hover:bg-primary/25 t-dato')}>Hoy</button>
 <button type="button" aria-label="Día siguiente" title="Día siguiente" onClick={() => shiftDays(1)} className={cn(celda, 'w-11 shrink-0 hover:bg-muted')}><CaretRight size={16} weight="bold" /></button>
 </div>
 );
}
