import { useState } from'react';
import { CaretLeft, CaretRight, Plus, MagnifyingGlass, XCircle } from'@phosphor-icons/react';
import { type Reserva } from'../../db/database';
import { STATUS_LABEL } from'./reservaUtils';
import { Input } from'@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from'@/components/ui/popover';
import { Calendar } from'@/components/ui/calendar';

interface CalendarToolbarProps {
 startDate: Date;
 setStartDate: (d: Date) => void;
 shiftDays: (n: number) => void;
 goToday: () => void;
 visibleDates: Date[];
 search: string;
 setSearch: (s: string) => void;
 searchOpen: boolean;
 setSearchOpen: (o: boolean) => void;
 reservas: Reserva[];
 onResultClick: (r: Reserva) => void;
 onNewReserva: () => void;
}

export function CalendarToolbar({
 startDate,
 setStartDate,
 visibleDates,
 shiftDays,
 goToday,
 search,
 setSearch,
 searchOpen,
 setSearchOpen,
 reservas,
 onResultClick,
 onNewReserva
}: CalendarToolbarProps) {
 const [monthPickerOpen, setMonthPickerOpen] = useState(false);

 return (
 <header className="h-14 px-6 bg-card border-b border-border flex items-center justify-between shadow-xs shrink-0 gap-4">
 <div className="flex items-center gap-3 shrink-0">
 <button
 type="button"title="Nueva reserva"onClick={onNewReserva}
 className="w-9 h-9 rounded-lg bg-primary active:scale-95 text-primary-foreground flex items-center justify-center transition-all shadow-xs cursor-pointer">
 <Plus size={18} weight="bold"/>
 </button>

 <div className="w-[1px] h-6 bg-border shrink-0"/>

 <button
 type="button"title="Días anteriores"onClick={() => shiftDays(-1)}
 className="w-9 h-9 rounded-lg bg-muted active:scale-95 text-muted-foreground flex items-center justify-center transition-all cursor-pointer">
 <CaretLeft size={16} weight="bold"/>
 </button>

 <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
 <PopoverTrigger asChild>
 <button
 type="button"
 className="font-extrabold text-sm text-foreground px-2 capitalize rounded-lg hover:bg-muted transition-colors cursor-pointer"
 >
 {visibleDates[0]?.toLocaleDateString('es-ES', { month:'long', year:'numeric'})}
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
 setMonthPickerOpen(false);
 }}
 />
 </PopoverContent>
 </Popover>

 <button
 type="button"onClick={goToday}
 className="px-3 py-1.5 rounded-lg bg-muted active:scale-95 text-foreground font-bold text-xs transition-all cursor-pointer">
 Hoy
 </button>

 <button
 type="button"title="Días siguientes"onClick={() => shiftDays(1)}
 className="w-9 h-9 rounded-lg bg-muted active:scale-95 text-muted-foreground flex items-center justify-center transition-all cursor-pointer">
 <CaretRight size={16} weight="bold"/>
 </button>
 </div>

 <div className="relative w-64 shrink-0">
 <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"/>
 <Input
 type="text"placeholder="Buscar reserva..."value={search}
 onChange={(e) => {
 setSearch(e.target.value);
 setSearchOpen(e.target.value.trim().length > 1);
 }}
 className="pl-9 pr-8 h-9 text-xs"/>
 {search && (
 <button
 type="button"onClick={() => { setSearch(''); setSearchOpen(false); }}
 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
 <XCircle size={14} />
 </button>
 )}

 {searchOpen && (
 <div className="absolute top-11 right-0 w-72 bg-card rounded-xl shadow-xl border border-border p-2 z-50 flex flex-col gap-1 max-h-60 overflow-y-auto">
 {reservas
 .filter(r => r.nombre.toLowerCase().includes(search.toLowerCase()))
 .map(r => (
 <div
 key={r.id}
 onClick={() => { onResultClick(r); setSearchOpen(false); }}
 className="p-2 rounded-lg cursor-pointer flex flex-col gap-0.5">
 <span className="font-extrabold text-xs text-foreground">{r.nombre}</span>
 <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold">
 <span>{r.fecha} · {r.hora}</span>
 <span className="px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-bold uppercase">
 {STATUS_LABEL[r.estado] || r.estado}
 </span>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </header>
 );
}
