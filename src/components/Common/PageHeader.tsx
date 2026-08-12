import type { ReactNode, CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  children: ReactNode;
  className?: string;
  height?: number;
  px?: string | number;
  style?: CSSProperties;
}

export function PageHeader({
  children,
  className,
  style,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "h-14 px-6 bg-card border-b border-border flex items-center justify-between shadow-xs shrink-0 z-10 w-full",
        className
      )}
      style={style}
    >
      <div className="w-full flex items-center gap-4 min-w-0">
        {children}
      </div>
    </header>
  );
}
