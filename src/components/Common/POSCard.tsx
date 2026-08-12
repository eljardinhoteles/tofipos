import { memo } from'react';
import type { ReactNode } from'react';
import { cn } from'@/lib/utils';

interface POSCardProps {
 title: string;
 subtitle?: string;
 amount?: string | number;
 ivaLabel?: string;
 active?: boolean;
 children?: ReactNode;
 isSelected?: boolean;
 onClick?: () => void;
}

export const POSCard = memo(function POSCard({
 title,
 subtitle,
 amount,
 ivaLabel,
 active = true,
 children,
 isSelected = false,
 onClick
}: POSCardProps) {
 return (
 <div 
 onClick={onClick}
 className={cn("bg-card p-5 rounded-2xl border-2 transition-all flex flex-col justify-between shadow-xs",
 active ?"opacity-100":"opacity-70",
 isSelected ?"border-primary ring-2 ring-primary/20":"border-border",
 onClick &&"cursor-pointer active:scale-98")}
 >
 <div className="flex flex-col gap-3 flex-1">
 <div className="flex flex-col gap-0.5">
 <h4 className="font-black text-base text-foreground truncate">{title}</h4>
 {subtitle && <span className="text-xs font-semibold text-muted-foreground">{subtitle}</span>}
 </div>

 {children && <div className="flex-1">{children}</div>}

 {amount !== undefined && (
 <div className={cn("flex items-center mt-auto pt-2", ivaLabel ?"justify-between":"justify-end")}>
 {ivaLabel && (
 <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{ivaLabel}</span>
 )}
 <span className="font-black text-lg text-primary">{amount}</span>
 </div>
 )}
 </div>
 </div>
 );
});
