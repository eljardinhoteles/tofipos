import { createPortal } from'react-dom';
import { Plus } from'@phosphor-icons/react';
import { FilterChips } from'../Common/FilterChips';

interface MenuControlsProps {
 status: string;
 onStatusChange: (status: string) => void;
 onAddProduct: () => void;
 onManageCategories: () => void;
}

export function MenuControls({ status, onStatusChange, onAddProduct, onManageCategories }: MenuControlsProps) {
 return (
 <>
 {createPortal(
 <FilterChips
 value={status}
 onChange={onStatusChange}
 options={[
 { value:'activos', label:'Activos'},
 { value:'desactivados', label:'Desactivados'},
 ]}
 />,
 document.getElementById('subheader-portal') || document.body
 )}

 {createPortal(
 <div className="flex items-center gap-2">
 <button
 type="button"onClick={onManageCategories}
 className="px-4 py-2 rounded-full bg-card border border-border text-foreground font-bold text-xs shadow-xs cursor-pointer">
 Categorías
 </button>
 <button
 type="button"onClick={onAddProduct}
 className="px-4 py-2 rounded-full bg-foreground text-background font-extrabold text-xs shadow-md flex items-center gap-1.5 cursor-pointer">
 <Plus size={16} weight="bold"/> Producto
 </button>
 </div>,
 document.getElementById('floating-actions-left') || document.body
 )}
 </>
 );
}
