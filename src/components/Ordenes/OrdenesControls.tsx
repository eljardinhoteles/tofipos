import { createPortal } from 'react-dom';
import { Group, Chip } from '@mantine/core';

interface OrdenesControlsProps {
  status: string;
  onStatusChange: (status: string) => void;
}

export function OrdenesControls({ status, onStatusChange }: OrdenesControlsProps) {
  return (
    <>
      {/* ── HEADER: Filtros de Estado como Chips ────────────────── */}
      {createPortal(
        <Chip.Group value={status} onChange={(val) => onStatusChange(val as string)}>
          <Group gap="xs">
            <Chip value="activas" variant="filled" radius="xl" size="md">todas</Chip>
            <Chip value="en_cocina" variant="filled" radius="xl" size="md">en cocina</Chip>
            <Chip value="listo" variant="filled" radius="xl" size="md">listas</Chip>
            <Chip value="facturadas" variant="filled" radius="xl" size="md">facturadas</Chip>
          </Group>
        </Chip.Group>,
        document.getElementById('subheader-portal') || document.body
      )}
    </>
  );
}
