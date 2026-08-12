import { memo } from 'react';
import type { Icon } from '@phosphor-icons/react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: Icon;
  color?: string;
}

export const StatCard = memo(function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-2xl font-black text-foreground">{value}</span>
      </div>
      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon size={24} weight="bold" />
      </div>
    </div>
  );
});
