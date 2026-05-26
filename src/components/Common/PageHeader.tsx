import type { ReactNode, CSSProperties } from 'react';
import { Box, Group } from '@mantine/core';

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
  height = 56,
  px = 'xl',
  style,
}: PageHeaderProps) {
  return (
    <Box
      h={height}
      px={px}
      className={className}
      style={{
        borderBottom: '1px solid var(--pos-border)',
        backgroundColor: 'var(--pos-surface)',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        zIndex: 10,
        ...style,
      }}
    >
      <Box
        className="header-scroll-x hide-scrollbar"
        style={{
          width: '100%',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <Group wrap="nowrap" gap="md" style={{ minWidth: '100%', flexWrap: 'nowrap', width: '100%' }}>
          {children}
        </Group>
      </Box>
    </Box>
  );
}
