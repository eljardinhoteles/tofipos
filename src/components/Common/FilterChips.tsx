import type { ReactNode } from'react';
import { cn } from'@/lib/utils';

type FilterChipOption = {
 value: string;
 label: ReactNode;
};

interface FilterChipsProps {
 value: string;
 onChange: (value: string) => void;
 options: FilterChipOption[];
 scrollable?: boolean;
}

export function FilterChips({
 value,
 onChange,
 options,
 scrollable = false,
}: FilterChipsProps) {
 return (
 <div className={cn("flex items-center gap-2",
 scrollable &&"overflow-x-auto hide-scrollbar w-full pb-1")}>
 {options.map((option) => {
 const active = value === option.value;
 return (
 <button
 key={option.value}
 type="button"onClick={() => onChange(option.value)}
 className={cn("px-3.5 py-1.5 rounded-full font-bold text-xs whitespace-nowrap transition-all cursor-pointer border select-none",
 active
 ?"bg-foreground text-background border-foreground shadow-xs":"bg-card text-muted-foreground border-border")}
 >
 {option.label}
 </button>
 );
 })}
 </div>
 );
}
