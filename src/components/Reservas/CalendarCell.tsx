import { useState } from 'react';
import { Box, Text } from '@mantine/core';
import { Plus } from '@phosphor-icons/react';
import { type Reserva } from '../../db/database';
import { MiniReservaCard } from './MiniReservaCard';

interface CalendarCellProps {
  isToday: boolean;
  isWeekend: boolean;
  dayReservas: Reserva[];
  highlightedId: string | null;
  onCellClick: () => void;
  onCardClick: (id: string) => void;
  onAssign: (r: Reserva) => void;
  onCancel: (id: string) => void;
  codigoMap?: Record<string, string>;
}

export function CalendarCell({
  isToday,
  isWeekend,
  dayReservas,
  highlightedId,
  onCellClick,
  onCardClick,
  onAssign,
  onCancel,
  codigoMap = {}
}: CalendarCellProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Box
      className={`calendar-cell${isToday ? ' calendar-cell--today' : ''}${isWeekend ? ' calendar-cell--weekend' : ''}${hovered ? ' calendar-cell--hover' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-card]')) return;
        onCellClick();
      }}
    >
      {dayReservas.map(r => (
        <MiniReservaCard
          key={r.id}
          reserva={r}
          isHighlighted={r.id === highlightedId}
          onClick={() => onCardClick(r.id)}
          onAssign={() => onAssign(r)}
          onCancel={() => onCancel(r.id)}
          codigo={codigoMap[r.id]}
        />
      ))}

      {/* Botón añadir — siempre visible para usabilidad táctil */}
      <Box
        data-card
        onClick={(e) => { e.stopPropagation(); onCellClick(); }}
        className={`calendar-cell__add${hovered ? ' calendar-cell__add--hover' : ''}${dayReservas.length === 0 ? ' calendar-cell__add--empty' : ''}`}
      >
        <Plus size={dayReservas.length === 0 && !hovered ? 16 : 12} weight="bold" color={hovered ? 'var(--ui-primary)' : 'var(--pos-text-muted)'} />
        {hovered && (
          <Text size="10px" fw={800} c="var(--ui-primary)" className="calendar-cell__add-label">
            Nueva Reserva
          </Text>
        )}
      </Box>
    </Box>
  );
}
