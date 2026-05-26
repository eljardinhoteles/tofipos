import { memo } from 'react';
import { Paper, Stack, Group, Text, Box } from '@mantine/core';
import type { ReactNode } from 'react';

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
    <Paper 
      shadow="none" 
      radius="xl" 
      p="lg" 
      withBorder 
      onClick={onClick}
      style={{ 
        backgroundColor: 'white', 
        opacity: active ? 1 : 0.7,
        transition: 'all 0.2s ease',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderColor: isSelected ? 'var(--ui-primary)' : 'var(--ui-border)',
        borderWidth: '2px',
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <Stack gap="xs" style={{ flex: 1 }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2} style={{ flex: 1 }}>
            <Text fw={900} size="lg" lineClamp={1} c="var(--pos-text)">{title}</Text>
            {subtitle && <Text size="xs" c="dimmed" fw={600}>{subtitle}</Text>}
          </Stack>
        </Group>

        {children && (
          <Box style={{ flex: 1 }}>
            {children}
          </Box>
        )}

        {amount !== undefined && (
          <Group justify={ivaLabel ? "space-between" : "flex-end"} align="center" mt="auto">
            {ivaLabel && (
              <Text size="xs" c="dimmed" fw={750} tt="uppercase">
                {ivaLabel}
              </Text>
            )}
            <Text fw={900} size="xl" c="var(--ui-primary)" style={{ whiteSpace: 'nowrap', letterSpacing: '-0.5px' }}>
              {amount}
            </Text>
          </Group>
        )}
      </Stack>
    </Paper>
  );
});
