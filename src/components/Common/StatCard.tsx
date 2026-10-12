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
        <span className="t-etiqueta text-muted-foreground">{label}</span>
        <span className="t-cifra text-foreground">{value}</span>
      </div>
      <div className="w-12 h-12 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <Icon size={24} weight="bold" />
      </div>
    </div>
  );
});
