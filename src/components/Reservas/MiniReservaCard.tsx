import { Paper, Group, Stack, Text, ActionIcon, Tooltip } from '@mantine/core';
import { Clock, Users, ArrowUpRight } from '@phosphor-icons/react';
import { type Reserva } from '../../db/database';
import { STATUS_HEX } from './reservaUtils';

interface MiniReservaCardProps {
  reserva: Reserva;
  onClick: () => void;
  onAssign: () => void;
  onCancel: () => void;
  isHighlighted?: boolean;
}

export function MiniReservaCard({
  reserva,
  onClick,
  onAssign,
  isHighlighted = false
}: MiniReservaCardProps) {
  const done = reserva.estado === 'completada';
  const canceled = reserva.estado === 'cancelada';

  const bgColors: Record<Reserva['estado'], string> = {
    pendiente: 'var(--ui-warning-soft)',
    confirmada: 'var(--ui-success-soft)',
    cancelada: 'var(--ui-danger-soft)',
    completada: 'var(--ui-surface-muted)',
  };

  const metaColor =
    reserva.estado === 'cancelada'
      ? 'var(--ui-danger)'
      : reserva.estado === 'completada'
      ? 'var(--ui-text-muted)'
      : reserva.estado === 'confirmada'
      ? 'var(--ui-success)'
      : 'var(--ui-warning)';

  return (
    <Paper
      data-card
      px={7} py={6}
      radius="md"
      style={{
        cursor: 'pointer',
        backgroundColor: bgColors[reserva.estado] || 'white',
        opacity: canceled || done ? 0.8 : 1,
        border: isHighlighted
          ? '2px solid var(--ui-primary)'
          : `1px solid ${STATUS_HEX[reserva.estado]}50`,
        boxShadow: 'none',
        transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
        userSelect: 'none',
        overflow: 'hidden',
      }}
      onClick={onClick}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap={4}>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          {/* Fila 1: hora + personas */}
          <Group gap={6} wrap="nowrap" align="center">
            <Group gap={3} wrap="nowrap">
              <Clock size={10} color={metaColor} weight="bold" />
              <Text size="11px" fw={800} c={metaColor} style={{ lineHeight: 1 }}>{reserva.hora}</Text>
            </Group>
            <Text size="11px" c={metaColor} style={{ lineHeight: 1 }}>·</Text>
            <Group gap={3} wrap="nowrap">
              <Users size={10} color={metaColor} />
              <Text size="11px" fw={700} c={metaColor} style={{ lineHeight: 1 }}>{reserva.personas}</Text>
            </Group>
          </Group>
          {/* Fila 2: nombre */}
          <Text fw={700} size="sm" lineClamp={1} c="var(--pos-text)">{reserva.nombre}</Text>
        </Stack>

        {!canceled && !done && (
          <Tooltip label="Asignar Mesa" position="top" withArrow radius="md" fw={700}>
            <ActionIcon size={22} variant="filled" color="green" radius="sm" style={{ flexShrink: 0 }}
              onClick={e => { e.stopPropagation(); onAssign(); }}>
              <ArrowUpRight size={16} weight="bold" />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Paper>
  );
}
