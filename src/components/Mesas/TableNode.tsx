import { Text, Paper, Group, Stack } from '@mantine/core';
import type { Mesa, Comanda } from '../../db/database';
import { UserIcon, ReceiptIcon, ForkKnifeIcon, BedIcon } from '@phosphor-icons/react';
import { memo } from 'react';
import type { CSSProperties } from 'react';

interface TableNodeProps {
  mesa: Mesa;
  isSelected: boolean;
  onSelect: (mesa: Mesa) => void;
  tiempoActivo?: string;
  cliente?: string;
  isHabitacion?: boolean;
  activeComanda?: Pick<Comanda, 'estado' | 'habitacion_cuenta_id'> & { sincronizado?: boolean } | null;
  roomBadge?: string;
}

export const TableNode = memo(function TableNode({ mesa, isSelected, onSelect, tiempoActivo, cliente, isHabitacion, activeComanda, roomBadge }: TableNodeProps) {
  const isFree = mesa.estado === 'libre' && !activeComanda;

  const getStatusMeta = () => {
    const hasOpenComanda = Boolean(activeComanda)
    const effectiveState = hasOpenComanda
      ? (activeComanda?.estado === 'cuenta' ? 'cuenta' : 'ocupada')
      : mesa.estado

    switch (effectiveState) {
      case 'libre':
        return {
          label: isFree ? 'Libre' : 'Libre',
          main: 'var(--status-free)',
          seat: 'var(--ui-table-seat-free)',
          bg: 'var(--ui-surface-muted)',
          text: 'var(--pos-text-muted)'
        };
      case 'ocupada':
        return {
          label: 'Ocupada',
          main: 'var(--status-active)',
          seat: 'var(--status-active)',
          bg: 'var(--pos-surface)',
          text: 'var(--status-active)'
        };
      case 'cuenta':
        return {
          label: 'Cuenta',
          main: 'var(--status-closed)',
          seat: 'var(--status-closed)',
          bg: 'var(--pos-surface)',
          text: 'var(--status-closed)'
        };
      default:
        return {
          label: 'Libre',
          main: 'var(--status-free)',
          seat: 'var(--ui-table-seat-free)',
          bg: 'var(--ui-surface-muted)',
          text: 'var(--pos-text-muted)'
        };
    }
  };

  const status = getStatusMeta();
  const capacidad = mesa.capacidad || 0;

  const nodeVars = {
    '--table-node-status': status.main,
    '--table-node-seat': status.seat,
    '--table-node-bg': status.bg,
  } as CSSProperties;

  const roomNumber = isHabitacion ? (mesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || mesa.nombre) : mesa.nombre;
  const roomType = isHabitacion ? (mesa.nombre.match(/\(([^)]+)\)/)?.[1] || 'Sin nombre') : '';

  if (isHabitacion) {
    const roomBg = isFree
      ? 'var(--ui-surface-muted)'
      : (activeComanda?.estado === 'cuenta'
        ? 'linear-gradient(135deg, rgba(250, 82, 82, 0.08) 0%, rgba(250, 82, 82, 0.02) 100%)'
        : 'linear-gradient(135deg, rgba(46, 204, 113, 0.12) 0%, rgba(46, 204, 113, 0.04) 100%)'
      );

    const roomBorderColor = isFree
      ? 'var(--pos-border-dark)'
      : (activeComanda?.estado === 'cuenta'
        ? 'var(--status-closed)'
        : 'var(--status-active)'
      );

    const roomTitleColor = isFree
      ? 'var(--pos-text-sub)'
      : (activeComanda?.estado === 'cuenta'
        ? 'var(--status-closed)'
        : 'var(--status-active)'
      );

    const bedIconWeight = isFree ? 'light' : 'fill';
    const bedIconColor = isFree
      ? 'var(--pos-text-muted)'
      : (activeComanda?.estado === 'cuenta'
        ? 'var(--status-closed)'
        : 'var(--status-active)'
      );

    return (
      <Paper
        className="tap table-node"
        shadow="none"
        radius="xl"
        p="sm"
        withBorder
        style={{
          ...nodeVars,
          background: roomBg,
          borderColor: isSelected ? 'var(--table-node-status)' : roomBorderColor,
          borderWidth: '2px',
          borderStyle: 'solid',
        }}
        data-selected={isSelected || undefined}
        onClick={(e) => { e.stopPropagation(); onSelect(mesa); }}
      >
        <Group justify="space-between" align="center" className="table-node__header">
          <Text size="10px" fw={900} c={bedIconColor} className="table-node__status-label">
            {status.label}
          </Text>
          <BedIcon size={18} color={bedIconColor} weight={bedIconWeight} className="table-node__muted-icon" style={{ opacity: isFree ? 0.4 : 0.95 }} />
        </Group>

        <Stack align="center" justify="center" gap={2} h="100%" pt={6}>
          <Text fw={900} size="1.25rem" c={roomTitleColor} className="table-node__title table-node__title--room">
            {roomNumber}
          </Text>
          <Text size="10px" fw={800} c={isFree ? 'dimmed' : 'var(--pos-text-sub)'} className="table-node__subtitle">
            {roomType}
          </Text>
          {cliente && (
            <Group gap={2} mt={2} wrap="wrap" justify="center" className="table-node__client-group">
              <UserIcon size={10} weight="bold" color="var(--ui-primary)" className="table-node__shrink-icon" />
              <Text size="10px" fw={800} c="var(--ui-primary)" lineClamp={2} ta="center" className="table-node__client">
                {cliente}
              </Text>
            </Group>
          )}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper
      className="tap table-node"
      shadow="none"
      radius="xl"
      p="sm"
      withBorder
      style={nodeVars}
      data-selected={isSelected || undefined}
      onClick={(e) => { e.stopPropagation(); onSelect(mesa); }}
    >
      {/* Sillas (Reducidas un 10%) */}
      <div className="table-node__seat table-node__seat--top" />
      <div className="table-node__seat table-node__seat--bottom" />
      <div className="table-node__seat table-node__seat--left" />
      <div className="table-node__seat table-node__seat--right" />

      <Group justify="space-between" align="center" className="table-node__header">
        <Text size="10px" fw={900} c={status.main} className="table-node__status-label">
          {status.label}
        </Text>
        {!isFree && (
          <Group gap={4}>
            {mesa.estado === 'cuenta' ? (
              <ReceiptIcon size={13} color={status.main} />
            ) : (
              <ForkKnifeIcon size={13} color={status.main} weight="bold" />
            )}
            {tiempoActivo && <Text size="xs" fw={800} c="var(--pos-text)">{tiempoActivo}</Text>}
          </Group>
        )}
      </Group>

      <Stack align="center" justify="center" gap={4} h="100%" pt={6}>
        <Text fw={900} size="1.15rem" c="var(--pos-text)" className="table-node__title">{mesa.nombre}</Text>
        {roomBadge && (
          <Text size="9px" fw={900} c="white" bg="blue" px={6} py={2} style={{ borderRadius: 4, letterSpacing: '0.5px' }}>
            HAB: {roomBadge.match(/\d+/)?.[0] || roomBadge}
          </Text>
        )}
        <Group gap={6}>
          <UserIcon size={13} weight="bold" color="var(--pos-text-muted)" />
          <Text size="xs" fw={800} c="var(--pos-text-sub)">{capacidad}</Text>
        </Group>
        {cliente && (
          <Text size="10px" fw={700} c="var(--ui-primary)" lineClamp={2} ta="center" className="table-node__client table-node__client--wide">
            {cliente}
          </Text>
        )}
      </Stack>
    </Paper>
  );
});
