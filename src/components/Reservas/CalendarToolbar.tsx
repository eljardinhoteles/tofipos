import { CaretLeft, CaretRight, Plus, MagnifyingGlass, XCircle } from'@phosphor-icons/react';
import { type Reserva } from'../../db/database';
import { STATUS_LABEL } from'./reservaUtils';
import { Input } from'@/components/ui/input';

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

 return (
 <header className="h-14 px-6 bg-background border-b border-border flex items-center justify-between shadow-xs shrink-0 z-10 w-full">
 <div className="flex items-center gap-3 w-full justify-between">
 <div className="flex items-center gap-2">
 <button
 type="button"onClick={onNewReserva}
 className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-xs transition-colors">
 <Plus size={18} weight="bold"/>
 </button>

 <div className="w-[1px] h-6 bg-border"/>

 <button
 type="button"onClick={() => shiftDays(-1)}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <CaretLeft size={16} weight="bold"/>
 </button>

 <span className="font-extrabold text-sm text-foreground px-2 capitalize">
 {visibleDates[0]?.toLocaleDateString('es-ES', { month:'long', year:'numeric'})}
 </span>

 <button
 type="button"onClick={goToday}
 className="px-3 py-1.5 rounded-lg bg-muted text-foreground font-bold text-xs cursor-pointer transition-colors">
 Hoy
 </button>

 <button
 type="button"onClick={() => shiftDays(1)}
 className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <CaretRight size={16} weight="bold"/>
 </button>
 </div>

 <div className="relative w-64">
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
 </div>
 </header>
 );
}
