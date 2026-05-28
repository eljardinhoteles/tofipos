import { Chip, Group, ScrollArea } from '@mantine/core';
import type { ReactNode } from 'react';

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
  const content = (
    <Chip.Group value={value} onChange={(next) => onChange(next as string)}>
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 'max-content' }}>
        {options.map((option) => (
          <Chip key={option.value} value={option.value} variant="filled" radius="xl" size="md">
            {option.label}
          </Chip>
        ))}
      </Group>
    </Chip.Group>
  );

  if (!scrollable) {
    return content;
  }

  return (
    <ScrollArea type="never">
      {content}
    </ScrollArea>
  );
}
