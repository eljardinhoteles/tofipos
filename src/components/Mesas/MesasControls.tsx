import { createPortal } from'react-dom';
import { Gear, Plus } from'@phosphor-icons/react';
import { useAuth } from'../../context/AuthContext';
import { FilterChips } from'../Common/FilterChips';
import { cn } from'@/lib/utils';

interface MesasControlsProps {
 availablePisos: string[];
 selectedPiso: string;
 onPisoChange: (piso: string) => void;
 onOpenManage: () => void;
 onOpenAddTable: () => void;
 isEditMode: boolean;
 onToggleEditMode: () => void;
 hideChips?: boolean;
}

export function MesasControls({ 
 availablePisos, 
 selectedPiso, 
 onPisoChange, 
 onOpenManage, 
 onOpenAddTable,
 isEditMode,
 onToggleEditMode,
 hideChips
}: MesasControlsProps) {
 const { currentMesero } = useAuth();
 
 const esAdmin = currentMesero?.rol ==='admin';
 const mostrarEdicion = esAdmin;

 const leftPortal = document.getElementById('floating-actions-left');
 const rightPortal = document.getElementById('floating-actions-right');
 const subheaderPortal = document.getElementById('subheader-portal');
 
 return (
 <>
 {!hideChips && subheaderPortal && createPortal(
 <FilterChips
 value={selectedPiso}
 onChange={onPisoChange}
 options={availablePisos.map((piso) => ({ value: piso, label: piso }))}
 scrollable
 />,
 subheaderPortal
 )}

 {mostrarEdicion && isEditMode && leftPortal && createPortal(
 <div className="flex items-center gap-2">
 <button
 type="button"onClick={onOpenAddTable}
 className="h-9 px-3.5 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer">
 <Plus size={16} weight="bold"/> Mesa
 </button>
 <button
 type="button"onClick={onOpenManage}
 className="h-9 px-3.5 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer">
 <Plus size={16} weight="bold"/> Piso
 </button>
 </div>,
 leftPortal
 )}

 {mostrarEdicion && rightPortal && createPortal(
 <div className="flex items-center gap-2">
 <button
 type="button"onClick={onToggleEditMode}
 className={cn("h-9 px-4 rounded-full font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border shadow-2xs",
 isEditMode
 ?"bg-foreground text-background border-foreground":"bg-card text-foreground border-border")}
 >
 <Gear size={16} weight={isEditMode ?"bold":"regular"} />
 {isEditMode ?"Listo":"Editar Mesas"}
 </button>
 </div>,
 rightPortal
 )}
 </>
 );
}
