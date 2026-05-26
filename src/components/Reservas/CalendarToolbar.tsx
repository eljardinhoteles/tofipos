import { Box, Group, ActionIcon, Popover, UnstyledButton, Button, TextInput, Stack, Text, Badge } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { CaretLeft, CaretRight, Plus, MagnifyingGlass, XCircle } from '@phosphor-icons/react';
import { type Reserva } from '../../db/database';
import { STATUS_HEX, STATUS_COLOR, STATUS_LABEL } from './reservaUtils';
import { PageHeader } from '../Common/PageHeader';

interface CalendarToolbarProps {
  startDate: Date;
  setStartDate: (d: Date) => void;
  shiftDays: (n: number) => void;
  goToday: () => void;
  visibleDates: Date[];
  search: string;
  setSearch: (s: string) => void;
  searchOpen: boolean;
  setSearchOpen: (o: boolean) => void;
  reservas: Reserva[];
  onResultClick: (r: Reserva) => void;
  onNewReserva: () => void;
}

export function CalendarToolbar({
  startDate,
  setStartDate,
  shiftDays,
  goToday,
  visibleDates,
  search,
  setSearch,
  searchOpen,
  setSearchOpen,
  reservas,
  onResultClick,
  onNewReserva
}: CalendarToolbarProps) {
  return (
    <PageHeader className="calendar-toolbar" px="xl">
      <Group justify="space-between" align="center" wrap="nowrap" w="100%" style={{ minWidth: 'max-content' }}>

        {/* Izquierda: Navegación + Buscador */}
        <Group gap={8} wrap="nowrap" align="center" className="calendar-toolbar__left">

          {/* Nueva Reserva al inicio */}
          <ActionIcon
            size={36}
            radius="md"
            onClick={onNewReserva}
            className="calendar-toolbar__new-btn"
          >
            <Plus size={18} weight="bold" />
          </ActionIcon>

          {/* Separador */}
          <Box className="calendar-toolbar__separator" />

          {/* Flechas circulares */}
          <ActionIcon
            variant="default"
            size={36}
            radius="xl"
            onClick={() => shiftDays(-1)}
            className="calendar-toolbar__circle-btn"
          >
            <CaretLeft size={14} weight="bold" />
          </ActionIcon>

          {/* Selector de mes */}
          <Popover position="bottom-start" shadow="md" radius="md">
            <Popover.Target>
              <UnstyledButton className="calendar-toolbar__month-btn">
                {visibleDates[0].toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase())}
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown p={0}>
              <DatePicker locale="es" value={startDate}
                onChange={d => { if (d) { const nd = new Date(d); nd.setHours(0, 0, 0, 0); setStartDate(nd); } }}
              />
            </Popover.Dropdown>
          </Popover>

          {/* Botón Hoy */}
          <Button
            variant="default"
            size="sm"
            h={36}
            radius="md"
            fw={600}
            onClick={goToday}
            className="calendar-toolbar__today-btn"
          >
            Hoy
          </Button>

          {/* Flecha derecha circular */}
          <ActionIcon
            variant="default"
            size={36}
            radius="xl"
            onClick={() => shiftDays(1)}
            className="calendar-toolbar__circle-btn"
          >
            <CaretRight size={14} weight="bold" />
          </ActionIcon>

          {/* Separador */}
          <Box className="calendar-toolbar__separator" />

          {/* Buscador con dropdown */}
          <Box className="calendar-toolbar__search-wrap">
            <TextInput
              placeholder="Buscar reserva..."
              size="sm"
              radius="md"
              leftSection={<MagnifyingGlass size={15} color="var(--pos-text-muted)" />}
              value={search}
              onChange={e => {
                setSearch(e.currentTarget.value);
                setSearchOpen(e.currentTarget.value.trim().length > 1);
              }}
              onFocus={() => { if (search.trim().length > 1) setSearchOpen(true); }}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              rightSection={search ? (
                <ActionIcon variant="transparent" size="sm" onClick={() => { setSearch(''); setSearchOpen(false); }}>
                  <XCircle size={14} />
                </ActionIcon>
              ) : null}
              className="calendar-toolbar__search-input"
              styles={{ input: { height: 36, minHeight: 36, backgroundColor: 'var(--pos-bg)', border: '1px solid var(--pos-border)' } }}
            />

            {/* Dropdown resultados */}
            {searchOpen && (() => {
              const q = search.trim().toLowerCase();
              const results = reservas
                .filter(r => r.nombre.toLowerCase().includes(q))
                .slice(0, 8);
              return results.length > 0 ? (
                <Box className="calendar-toolbar__results">
                  {results.map(r => (
                    <Box
                      key={r.id}
                      px={12} py={8}
                      className="calendar-toolbar__result-row"
                      onClick={() => onResultClick(r)}
                    >
                      <Group gap={8} wrap="nowrap">
                        <Box className="calendar-toolbar__status-bar" style={{ backgroundColor: STATUS_HEX[r.estado] }} />
                        <Stack gap={1} className="calendar-toolbar__result-content">
                          <Text size="sm" fw={700} lineClamp={1}>{r.nombre}</Text>
                          <Group gap={6}>
                            <Text size="xs" c="dimmed">{new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {r.hora}</Text>
                            <Badge size="xs" color={STATUS_COLOR[r.estado]} variant="light">{STATUS_LABEL[r.estado]}</Badge>
                          </Group>
                        </Stack>
                      </Group>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box className="calendar-toolbar__results calendar-toolbar__results--empty">
                  <Stack align="center" gap="xs">
                    <Box style={{ width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1 }}>
                      <img src="/no_resultado.webp" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </Box>
                    <Text size="sm" c="dimmed" ta="center">Sin resultados</Text>
                  </Stack>
                </Box>
              );
            })()}
          </Box>
        </Group>
      </Group>
    </PageHeader>
  );
}
