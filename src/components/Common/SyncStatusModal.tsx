import {
  Modal,
  Text,
  Group,
  Badge,
  Divider,
  Button,
  ScrollArea,
  Box,
  Stack,
} from '@mantine/core';
import {
  ArrowsClockwise,
  WifiHigh,
  WifiSlash,
  CheckCircle,
  WarningCircle,
  XCircle,
  Database,
} from '@phosphor-icons/react';
import type { SyncStatus } from '../../db/rxdb';

const COLLECTION_LABELS: Record<string, string> = {
  mesas: 'Mesas',
  comandas: 'Comandas',
  items: 'Items',
  pisos: 'Pisos',
  clientes: 'Clientes',
  categorias: 'Categorías',
  habitacionCuentas: 'Habitaciones',
  reservas: 'Reservas',
  pagos: 'Pagos',
  ajustesIva: 'Ajustes IVA',
  usuarios: 'Usuarios',
  menuItems: 'Productos',
};

export function SyncStatusModal({ opened, onClose, status, onForceSync, syncing }: {
  opened: boolean;
  onClose: () => void;
  status: SyncStatus;
  onForceSync: () => void;
  syncing: boolean;
}) {
  const overallOk = status.online && status.supabaseOk && !status.hasError;
  const overallColor = !status.online ? 'orange' : status.hasError ? 'red' : status.supabaseOk ? 'green' : 'gray';
  const overallIcon = !status.online
    ? <WifiSlash size={20} weight="bold" />
    : status.hasError
      ? <XCircle size={20} weight="bold" />
      : status.supabaseOk
        ? <CheckCircle size={20} weight="bold" />
        : <WarningCircle size={20} weight="bold" />;
  const overallLabel = !status.online
    ? 'Sin conexión'
    : status.hasError
      ? `Error en ${status.errorCollections.length} colección(es)`
      : status.supabaseOk === null
        ? 'Verificando...'
        : 'Sincronización activa';

  const collectionEntries = Object.entries(status.collections);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Estado de Sincronización"
      size="sm"
      radius="lg"
    >
      {/* Estado general */}
      <Group gap="sm" mb="md" p="sm" style={{
        background: overallOk ? 'rgba(21,128,61,0.08)' : !status.online ? 'rgba(202,138,4,0.08)' : 'rgba(185,28,28,0.08)',
        borderRadius: 10,
        border: `1px solid ${overallOk ? 'rgba(21,128,61,0.2)' : !status.online ? 'rgba(202,138,4,0.2)' : 'rgba(185,28,28,0.2)'}`,
      }}>
        <Box style={{ color: `var(--mantine-color-${overallColor}-6)` }}>{overallIcon}</Box>
        <Box style={{ flex: 1 }}>
          <Text fw={700} size="sm">{overallLabel}</Text>
          <Text size="xs" c="dimmed">
            {!status.online
              ? 'El dispositivo no tiene internet'
              : status.supabaseOk === null
                ? 'Verificando conexión...'
                : status.supabaseOk
                  ? 'Supabase conectado y accesible'
                  : 'No se puede alcanzar Supabase'}
          </Text>
        </Box>
      </Group>

      {/* Red y Supabase */}
      <Group justify="space-between" mb="xs">
        <Group gap={6}>
          {status.online ? <WifiHigh size={14} /> : <WifiSlash size={14} />}
          <Text size="xs" fw={600}>Red</Text>
        </Group>
        <Badge size="sm" color={status.online ? 'green' : 'orange'} variant="light">
          {status.online ? 'Online' : 'Offline'}
        </Badge>
      </Group>

      <Group justify="space-between" mb="md">
        <Group gap={6}>
          <Database size={14} />
          <Text size="xs" fw={600}>Supabase</Text>
        </Group>
        <Badge size="sm"
          color={status.supabaseOk === null ? 'gray' : status.supabaseOk ? 'green' : 'red'}
          variant="light"
        >
          {status.supabaseOk === null ? 'Verificando' : status.supabaseOk ? 'OK' : 'Error'}
        </Badge>
      </Group>

      {/* Colecciones */}
      {collectionEntries.length > 0 && (
        <>
          <Divider mb="sm" label="Colecciones" labelPosition="left" />
          <ScrollArea.Autosize mah={220}>
            <Stack gap={4}>
              {collectionEntries.map(([key, col]) => (
                <Group key={key} justify="space-between" py={4} px={6} style={{
                  borderRadius: 6,
                  background: col.error ? 'rgba(185,28,28,0.05)' : 'transparent',
                }}>
                  <Group gap={6}>
                    {col.error
                      ? <XCircle size={12} color="var(--mantine-color-red-6)" />
                      : col.stopped
                        ? <WarningCircle size={12} color="var(--mantine-color-orange-6)" />
                        : <CheckCircle size={12} color="var(--mantine-color-green-6)" />}
                    <Text size="xs">{COLLECTION_LABELS[key] || key}</Text>
                  </Group>
                  <Badge size="xs" variant="light"
                    color={col.error ? 'red' : col.stopped ? 'orange' : col.active ? 'green' : 'gray'}
                  >
                    {col.error ? 'Error' : col.stopped ? 'Detenido' : col.active ? 'Activo' : 'En espera'}
                  </Badge>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </>
      )}

      <Divider mt="md" mb="md" />

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" size="sm" onClick={onClose}>Cerrar</Button>
        <Button
          size="sm"
          leftSection={<ArrowsClockwise size={14} weight="bold" className={syncing ? 'spin-fast' : undefined} />}
          onClick={onForceSync}
          loading={syncing}
          disabled={!status.online}
        >
          Forzar Resync
        </Button>
      </Group>
    </Modal>
  );
}
