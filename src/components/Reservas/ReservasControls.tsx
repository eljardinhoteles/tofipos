import { createPortal } from'react-dom';
import { Plus } from'@phosphor-icons/react';
import { FilterChips } from'../Common/FilterChips';

type DateFilter ='todas'|'hoy'|'manana'|'semana';

interface ReservasControlsProps {
 filter: DateFilter;
 onFilterChange: (f: DateFilter) => void;
 onNewReserva: () => void;
}

export function ReservasControls({ filter, onFilterChange, onNewReserva }: ReservasControlsProps) {
 return (
 <>
 {createPortal(
 <FilterChips
 value={filter}
 onChange={v => onFilterChange(v as DateFilter)}
 options={[
 { value:'todas', label:'Todas'},
 { value:'hoy', label:'Hoy'},
 { value:'manana', label:'Mañana'},
 { value:'semana', label:'Próximos 7 días'},
 ]}
 scrollable
 />,
 document.getElementById('subheader-portal') || document.body
 )}

 {createPortal(
 <button
 type="button"onClick={onNewReserva}
 className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-extrabold text-xs shadow-md flex items-center gap-1.5 cursor-pointer">
 <Plus size={16} weight="bold"/> Nueva Reserva
 </button>,
 document.getElementById('floating-actions-left') || document.body
 )}
 </>
 );
}
