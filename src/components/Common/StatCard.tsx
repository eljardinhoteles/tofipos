import { memo } from 'react';
import { Paper, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import type { Icon } from '@phosphor-icons/react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: Icon;
  color: string;
}

export const StatCard = memo(function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={0}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">{label}</Text>
          <Text size="24px" fw={900}>{value}</Text>
        </Stack>
        <ThemeIcon size="xl" radius="md" variant="light" color={color}>
          <Icon size={24} weight="bold" />
        </ThemeIcon>
      </Group>
    </Paper>
  );
});
