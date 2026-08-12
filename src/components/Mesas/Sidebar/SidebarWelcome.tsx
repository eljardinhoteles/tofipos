import { ForkKnife } from'@phosphor-icons/react';

interface SidebarWelcomeProps {
 onOpenConfig: () => void;
}

export function SidebarWelcome({ onOpenConfig }: SidebarWelcomeProps) {
 return (
 <div className="h-full w-full bg-muted flex items-center justify-center p-6 text-center">
 <div className="flex flex-col items-center gap-4 max-w-xs">
 <div className="w-16 h-16 rounded-2xl bg-card border border-border shadow-xs flex items-center justify-center text-muted-foreground">
 <ForkKnife size={32} weight="fill"/>
 </div>

 <div className="flex flex-col gap-1">
 <h3 className="font-extrabold text-base text-foreground">Sistema POS</h3>
 <p className="text-xs text-muted-foreground leading-relaxed">
 Selecciona una mesa para gestionar la comanda o configurar el plano del local.
 </p>
 </div>

 <button
 type="button"onClick={onOpenConfig}
 className="mt-2 px-5 py-2.5 rounded-xl bg-card border border-border text-foreground/80 font-extrabold text-xs transition-colors cursor-pointer shadow-2xs">
 Editar Mesas y Pisos
 </button>
 </div>
 </div>
 );
}
