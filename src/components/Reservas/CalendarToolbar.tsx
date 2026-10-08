import { useState } from'react';
import { CaretLeft, CaretRight, Plus, CalendarDot } from'@phosphor-icons/react';
import { type Reserva } from'../../db/database';
import { STATUS_LABEL } from'./reservaUtils';
import { Button, ButtonGroup } from'@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from'@/components/ui/popover';
import { Calendar } from'@/components/ui/calendar';

import { useUI } from'../../context/UIContext';
import { cn } from'@/lib/utils';
import { PageHeader, HeaderSearch, headerPrimaryButtonClass } from'../Common/PageHeader';

interface CalendarHeaderProps {
 visibleDates: Date[];
 search: string;
 setSearch: (s: string) => void;
 searchOpen: boolean;
 setSearchOpen: (o: boolean) => void;
 reservas: Reserva[];
 onResultClick: (r: Reserva) => void;
 onNewReserva: () => void;
}

// Header de Reservas: título, buscador con resultados y la acción principal.
export function CalendarHeader({ visibleDates, search, setSearch, searchOpen, setSearchOpen, reservas, onResultClick, onNewReserva }: CalendarHeaderProps) {
 const mes = visibleDates[0]?.toLocaleDateString('es-ES', { month:'long', year:'numeric'}) ?? '';
 // Con el formulario de nueva reserva abierto en el sidebar, el botón sobra.
 const { reservaView, selectedReservaId } = useUI();
 const creandoReserva = reservaView === 'nueva' && !selectedReservaId;
 return (
 <PageHeader
 title="Reservas"
 subtitle={<span className="inline-block first-letter:uppercase">{mes}</span>}
 search={
 <div className="relative">
 <HeaderSearch
 value={search}
 placeholder="Buscar reserva..."
 onChange={(v) => { setSearch(v); setSearchOpen(v.trim().length > 1); }}
 />
 {searchOpen && (
 <div className="absolute top-11 left-0 w-96 max-w-full bg-card text-foreground rounded-xl shadow-xl border border-border p-2 z-50 flex flex-col gap-1 max-h-60 overflow-y-auto">
 {reservas
 .filter(r => r.nombre.toLowerCase().includes(search.toLowerCase()))
 .map(r => (
 <div
 key={r.id}
 onClick={() => { onResultClick(r); setSearchOpen(false); }}
 className="p-2 rounded-xl cursor-pointer hover:bg-muted flex flex-col gap-0.5">
 <span className="font-extrabold text-xs text-foreground">{r.nombre}</span>
 <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold">
 <span>{r.fecha} · {r.hora}</span>
 <span className="px-1.5 py-0.5 rounded-xl bg-card border border-border text-muted-foreground font-bold uppercase">
 {STATUS_LABEL[r.estado] || r.estado}
 </span>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 }
 actions={(
 // Siempre montado: al cerrar el sidebar el contenido tarda 0.5 s en volver a su
 // ancho; si el botón apareciera de golpe se vería deslizarse. Se oculta al instante
 // y reaparece con un fundido retrasado, cuando el header ya se acomodó.
 <button type="button" onClick={onNewReserva} title="Nueva reserva" aria-label="Nueva reserva" tabIndex={creandoReserva ? -1 : 0}
 className={cn(headerPrimaryButtonClass, creandoReserva ? 'opacity-0 pointer-events-none' : 'opacity-100 transition-opacity duration-300 delay-300')}>
 <Plus size={18} weight="bold"/>
   <span className="hidden 2xl:inline">Nueva reserva</span>
 </button>
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
 <Button type="button" variant="ghost" title="Elegir fecha" className="h-8 px-2 min-w-0 flex-1 font-extrabold text-xs">
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
