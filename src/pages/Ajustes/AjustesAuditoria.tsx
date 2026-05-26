import { useMemo, useState } from 'react';
import { ActionIcon, Badge, Box, Divider, Group, Paper, ScrollArea, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { ClockCounterClockwise, MagnifyingGlass, ShieldCheck, CalendarBlank } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { supabase } from '../../lib/supabase';

type AuditLog = {
  id: string;
  entity: string;
  entity_id?: string;
  action: string;
  summary: string;
  actor_id?: string;
  actor_name?: string;
  actor_role?: string;
  actor_email?: string;
  created_at: string;
  before_state?: string | null;
  after_state?: string | null;
};

export default function AjustesAuditoria() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedToday, setHasLoadedToday] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[string | null, string | null]>([null, null]);

  const loadToday = async () => {
    const orgId = localStorage.getItem('pos_active_org_id') || '';
    if (!orgId) return;
    setLoading(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const from = `${today}T00:00:00.000Z`;
      const to = `${today}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, entity, entity_id, action, summary, actor_id, actor_name, actor_role, actor_email, created_at, before_state, after_state')
        .eq('organization_id', orgId)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLogs((data || []) as AuditLog[]);
      setHasLoadedToday(true);
    } catch (error) {
      console.error('Error cargando auditoría de hoy:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (userQuery.trim()) {
        const q = userQuery.toLowerCase();
        const hayMatch = [
          log.actor_name,
          log.actor_email,
          log.actor_role,
          log.summary,
          log.entity,
        ].some((value) => String(value || '').toLowerCase().includes(q));
        if (!hayMatch) return false;
      }

      if (entityFilter && log.entity !== entityFilter) return false;
      if (actionFilter && log.action !== actionFilter) return false;

      const [dateFrom, dateTo] = dateRange;

      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (new Date(log.created_at) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(log.created_at) > to) return false;
      }

      return true;
    });
  }, [logs, userQuery, entityFilter, actionFilter, dateRange]);

  return (
    <Stack gap="lg" py="xl">
      <Paper withBorder p="xl" radius="lg" style={{ backgroundColor: 'var(--pos-surface)' }}>
        <Group justify="space-between" align="center" gap="md">
          <Group gap="md">
            <Box p={10} style={{ borderRadius: 12, backgroundColor: 'var(--ui-primary-soft)' }}>
              <ShieldCheck size={22} color="var(--ui-primary)" weight="fill" />
            </Box>
            <Box>
              <Text fw={900} size="lg">Auditoría</Text>
              <Text size="sm" c="dimmed">Revisa cambios sensibles por usuario, fecha, entidad y tipo de acción.</Text>
            </Box>
          </Group>
          <Group gap="sm" align="center" wrap="nowrap">
            <Badge variant="light" color="myColor" size="lg">
              {filteredLogs.length} eventos
            </Badge>
            {!hasLoadedToday && (
              <Tooltip label="Cargar eventos de hoy" withArrow>
                <ActionIcon variant="light" color="myColor" onClick={loadToday} aria-label="Cargar hoy">
                  <CalendarBlank size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="Limpiar filtros" withArrow>
              <ActionIcon
                variant="light"
                color="myColor"
                onClick={() => { setUserQuery(''); setEntityFilter(null); setActionFilter(null); setDateRange([null, null]); }}
                aria-label="Limpiar filtros"
              >
                <ClockCounterClockwise size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Divider my="md" />

        <Stack gap="md">
          <Group grow align="end">
            <TextInput label="Buscar" placeholder="Usuario, resumen o entidad" leftSection={<MagnifyingGlass size={16} />} value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
            <Select
              label="Entidad"
              placeholder="Todas"
              value={entityFilter}
              onChange={setEntityFilter}
              data={[
                { value: 'comanda', label: 'Comandas' },
                { value: 'comanda_item', label: 'Ítems de comanda' },
                { value: 'pago', label: 'Pagos' },
                { value: 'usuario', label: 'Usuarios' },
                { value: 'mesa', label: 'Mesas' },
                { value: 'reserva', label: 'Reservas' },
                { value: 'habitacion_cuenta', label: 'Habitaciones' },
                { value: 'menu_item', label: 'Productos' },
                { value: 'categoria', label: 'Categorías' },
                { value: 'ajuste_iva', label: 'IVA' },
                { value: 'piso', label: 'Pisos' },
              ]}
              clearable
            />
            <Select
              label="Acción"
              placeholder="Todas"
              value={actionFilter}
              onChange={setActionFilter}
              data={[
                { value: 'create', label: 'Creación' },
                { value: 'update', label: 'Edición' },
                { value: 'delete', label: 'Eliminación' },
                { value: 'status_change', label: 'Cambio de estado' },
              ]}
              clearable
            />
          </Group>

          <Group grow>
            <DatePickerInput
              type="range"
              label="Rango de fechas"
              placeholder="Selecciona un rango"
              locale="es"
              value={dateRange}
              onChange={setDateRange}
              leftSection={<CalendarBlank size={18} />}
              clearable
            />
          </Group>

          <ScrollArea h={520} offsetScrollbars>
            <Stack gap="sm">
              {!hasLoadedToday && !loading && (
                <Paper withBorder p="xl" radius="md" bg="gray.0" ta="center">
                  <Stack align="center" gap="sm">
                    <Box style={{ width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1 }}>
                      <img src="/hotel.webp" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </Box>
                    <Text fw={700}>Auditoría vacía</Text>
                    <Text size="sm" c="dimmed">Usa el botón de calendario para cargar los eventos de hoy desde el servidor.</Text>
                  </Stack>
                </Paper>
              )}
              {loading && (
                <Paper withBorder p="md" radius="md" bg="gray.0">
                  <Text size="sm" c="dimmed">Cargando auditoría desde la nube...</Text>
                </Paper>
              )}
              {!loading && hasLoadedToday && filteredLogs.length === 0 && (
                <Paper withBorder p="xl" radius="md" bg="gray.0" ta="center">
                  <Stack align="center" gap="sm">
                    <Box style={{ width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1 }}>
                      <img src="/no_resultado.webp" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </Box>
                    <Text fw={700}>Sin resultados</Text>
                    <Text size="sm" c="dimmed">No hay eventos que coincidan con los filtros actuales.</Text>
                  </Stack>
                </Paper>
              )}

              {filteredLogs.map((log) => (
                <Paper key={log.id} withBorder p="md" radius="md" bg="white">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4} style={{ flex: 1 }}>
                      <Group gap="xs">
                        <Badge color={log.action === 'delete' ? 'red' : log.action === 'status_change' ? 'orange' : 'myColor'} variant="light">
                          {log.action}
                        </Badge>
                        <Badge variant="outline">{log.entity}</Badge>
                      </Group>
                      <Text fw={800}>{log.summary}</Text>
                      <Group gap="sm">
                        <Text size="xs" c="dimmed">{dayjs(log.created_at).format('DD/MM/YYYY HH:mm:ss')}</Text>
                        <Text size="xs" c="dimmed">·</Text>
                        <Text size="xs" c="dimmed">{log.actor_name || log.actor_email || 'Sistema'}</Text>
                        {log.actor_role && <Badge size="xs" variant="light">{log.actor_role}</Badge>}
                      </Group>
                    </Stack>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </ScrollArea>
        </Stack>
      </Paper>
    </Stack>
  );
}
