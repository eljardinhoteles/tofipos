import { Box, Group, Text } from '@mantine/core';
import { CalendarCheck, Users } from '@phosphor-icons/react';
import { type Reserva, type Piso, type Mesa } from '../../db/database';
import { isToday, isWeekend, toISO } from './reservaUtils';
import { CalendarCell } from './CalendarCell';

interface CalendarGridProps {
  visibleDates: Date[];
  reservas: Reserva[] | undefined;
  zonasRows: Piso[] | undefined;
  mesas: Mesa[] | undefined;
  search: string;
  highlightedId: string | null;
  onCellClick: (date: Date, zonaId: string | undefined) => void;
  onCardClick: (id: string) => void;
  onAssign: (r: Reserva) => void;
  onCancel: (id: string) => void;
}

export function CalendarGrid({
  visibleDates,
  reservas,
  zonasRows,
  mesas,
  search,
  highlightedId,
  onCellClick,
  onCardClick,
  onAssign,
  onCancel
}: CalendarGridProps) {
  const DATE_COL_MIN = 200;
  const gridColumns = `140px repeat(${visibleDates.length}, minmax(${DATE_COL_MIN}px, 1fr))`;
  const gridMinWidth = 140 + (visibleDates.length * DATE_COL_MIN);

  const codigoMap = (() => {
    const map: Record<string, string> = {};
    if (!reservas) return map;
    const sorted = [...reservas].sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return a.created_at.localeCompare(b.created_at);
      }
      return a.id.localeCompare(b.id);
    });
    sorted.forEach((r, idx) => {
      map[r.id] = `R${idx + 1}`;
    });
    return map;
  })();

  return (
    <Box
      flex={1}
      className="calendar-grid"
      style={{ ['--cg-columns' as string]: gridColumns, ['--cg-min-width' as string]: `${gridMinWidth}px` }}
    >
      {/* Un solo scroll container para evitar desalineación entre header y celdas */}
      <Box className="calendar-grid__scroll">
        <Box className="calendar-grid__inner">
      {/* Header fijo de fechas */}
      <Box className="calendar-grid__header">
        {/* Esquina superior izquierda vacía */}
        <Box className="calendar-grid__zones-btn" />

        {/* Días */}
        {visibleDates.map(date => {
          const ds = toISO(date);
          const dayReservasAll = (reservas || []).filter(r => r.fecha === ds);
          const dayCount = dayReservasAll.length;
          const peopleCount = dayReservasAll.reduce((sum, r) => sum + (r.personas || 0), 0);

          return (
            <Box
              key={date.toISOString()}
              className={`calendar-grid__day-header${isToday(date) ? ' calendar-grid__day-header--today' : ''}${isWeekend(date) ? ' calendar-grid__day-header--weekend' : ''}`}
            >
              <Group justify="space-between" align="center" w="100%" px="sm" wrap="nowrap">
                {/* Lado izquierdo: Fecha */}
                <Group gap={6} wrap="nowrap" align="baseline">
                  <Text size="10px" fw={800} tt="uppercase" c={isToday(date) ? 'var(--ui-primary)' : 'dimmed'} className="calendar-grid__caps">
                    {date.toLocaleDateString('es-ES', { weekday: 'short' })}
                  </Text>
                  <Text fw={900} size="md" c={isToday(date) ? 'var(--ui-primary)' : 'var(--pos-text)'} lh={1}>
                    {date.getDate()}
                  </Text>
                  <Text size="10px" fw={600} tt="uppercase" c="dimmed" className="calendar-grid__caps">
                    {date.toLocaleDateString('es-ES', { month: 'short' })}
                  </Text>
                </Group>

                {/* Lado derecho: Indicadores */}
                {dayCount > 0 ? (
                  <Group gap={10} wrap="nowrap" align="center">
                    <Group gap={4} wrap="nowrap" align="center">
                      <CalendarCheck size={14} color={isToday(date) ? 'var(--ui-primary)' : 'var(--pos-text-muted)'} weight="bold" />
                      <Text size="12px" fw={600} c={isToday(date) ? 'var(--ui-primary)' : 'var(--pos-text)'} lh={1}>{dayCount}</Text>
                    </Group>
                    <Group gap={4} wrap="nowrap" align="center">
                      <Users size={14} color={isToday(date) ? 'var(--ui-primary)' : 'var(--pos-text-muted)'} weight="bold" />
                      <Text size="12px" fw={600} c={isToday(date) ? 'var(--ui-primary)' : 'var(--pos-text)'} lh={1}>{peopleCount}</Text>
                    </Group>
                  </Group>
                ) : (
                  <Text size="9px" fw={700} c="dimmed" className="calendar-grid__free">LIBRE</Text>
                )}
              </Group>
            </Box>
          );
        })}
      </Box>

      {/* Cuerpo de zonas */}
      <Box>
        <Box className="calendar-grid__body">
          {/* Si no hay zonas (cargando), mostramos 6 filas de esqueleto */}
          {(!zonasRows ? Array.from({ length: 6 }, (_, i) => ({ id: `skel-${i}`, nombre: '', orden: i })) : zonasRows).map((zona, _zIndex) => {
            const isSkeleton = !zonasRows;
            return [
              /* Celda zona */
              <Box key={`zona-${zona.id}`} className={`calendar-grid__zone-cell${isSkeleton ? ' calendar-grid__zone-cell--skeleton' : ''}`}>
                {isSkeleton ? (
                  <Box className="calendar-grid__skeleton-bar" />
                ) : (
                  <>
                    <Text fw={900} size="xs" c="var(--pos-text)" className="calendar-grid__zone-name">
                      {zona.nombre}
                    </Text>
                    {zona.id !== 'sin_zona' && mesas && (() => {
                      const count = mesas.filter(m => m.piso === zona.nombre).length;
                      return (
                        <Text size="9px" fw={700} c="dimmed" mt={2} className="calendar-grid__caps">
                          {count} {count === 1 ? 'MESA' : 'MESAS'}
                        </Text>
                      );
                    })()}
                  </>
                )}
              </Box>,

              /* Celdas de días */
              ...visibleDates.map(date => {
                const ds = toISO(date);
                const q = search.trim().toLowerCase();
                const dayReservas = (reservas || [])
                  .filter(r => r.fecha === ds && (zona.id === 'sin_zona' ? !r.zona_id : r.zona_id === zona.id))
                  .filter(r => !q || r.nombre.toLowerCase().includes(q))
                  .sort((a, b) => a.hora.localeCompare(b.hora));

                return (
                  <CalendarCell
                    key={`${zona.id}-${ds}`}
                    isToday={isToday(date)}
                    isWeekend={isWeekend(date)}
                    dayReservas={isSkeleton ? [] : dayReservas}
                    highlightedId={highlightedId}
                    onCellClick={() => !isSkeleton && onCellClick(date, zona.id === 'sin_zona' ? undefined : zona.id)}
                    onCardClick={onCardClick}
                    onAssign={onAssign}
                    onCancel={onCancel}
                    codigoMap={codigoMap}
                  />
                );
              }),
            ];
          })}
        </Box>
      </Box>
      </Box>
      </Box>
    </Box>
  );
}
