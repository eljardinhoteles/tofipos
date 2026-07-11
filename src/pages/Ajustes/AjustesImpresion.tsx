import { useEffect, useState } from 'react';
import { Box, Button, Divider, Group, Paper, Stack, Switch, Text, TextInput, ThemeIcon, Grid, ActionIcon, Card, Badge, Loader, Chip } from '@mantine/core';
import { Printer, Key, ArrowsClockwise, ForkKnife, Receipt, Trash } from '@phosphor-icons/react';
import { sileo } from 'sileo';
import {
  getPrintServerStatus,
  testPrintServerPrinter,
  savePrintToken,
  listSystemPrinters,
  listConfiguredPrinters,
  addConfiguredPrinter,
  updateConfiguredPrinter,
  deleteConfiguredPrinter,
  type ConfiguredPrinter,
  type PrinterRole,
} from '../../lib/printServerClient';

const ROLE_LABELS: Record<PrinterRole, { label: string; icon: React.ElementType }> = {
  kitchen: { label: 'Cocina', icon: ForkKnife },
  receipt: { label: 'Caja / Recibos', icon: Receipt },
};

export default function AjustesImpresion() {
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [serverQueue, setServerQueue] = useState<number | null>(null);
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:18181');
  const [lastAction, setLastAction] = useState('Sin verificar');
  const [tokenInput, setTokenInput] = useState('');

  // Catálogo de impresoras que Windows ya conoce, y las que el usuario
  // ya configuró en el print server (subset con roles asignados).
  const [systemPrinters, setSystemPrinters] = useState<string[]>([]);
  const [configuredPrinters, setConfiguredPrinters] = useState<ConfiguredPrinter[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [connectingName, setConnectingName] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    setServerUrl(localStorage.getItem('pos_print_server_url') || 'http://127.0.0.1:18181');
    setTokenInput(localStorage.getItem('pos_print_server_token') || '');
  }, []);

  const refreshStatus = async () => {
    try {
      const status = await getPrintServerStatus();
      setServerOk(status.ok);
      setServerQueue(status.queue ?? null);
      setLastAction(`Servidor OK. Cola: ${status.queue ?? 0}`);
    } catch (error) {
      setServerOk(false);
      setServerQueue(null);
      const message = error instanceof Error ? error.message : 'error desconocido';
      setLastAction(`Servidor sin respuesta: ${message}`);
    }
  };

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const [system, configured] = await Promise.all([
        listSystemPrinters(),
        listConfiguredPrinters(),
      ]);
      setSystemPrinters(system);
      setConfiguredPrinters(configured);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el catálogo de impresoras';
      sileo.error({ title: 'Error', description: message });
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    refreshStatus();
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveToken = async () => {
    savePrintToken(tokenInput);
    sileo.success({ title: 'Token guardado', description: 'Este dispositivo ya puede autenticarse con el print server.' });
    await loadCatalog();
    await refreshStatus();
  };

  const configuredNames = new Set(configuredPrinters.map(p => p.name));

  const handleConnect = async (name: string) => {
    setConnectingName(name);
    try {
      const { printer } = await addConfiguredPrinter({ name, target: name, roles: [], active: true });
      setConfiguredPrinters(prev => [...prev, printer]);
      sileo.success({ title: 'Impresora conectada', description: `${name} ya está disponible. Asígnale un rol (cocina/caja) para que reciba tickets.` });
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo conectar la impresora';
      sileo.error({ title: 'Error', description: message });
    } finally {
      setConnectingName(null);
    }
  };

  const handleDisconnect = async (printer: ConfiguredPrinter) => {
    try {
      await deleteConfiguredPrinter(printer.id);
      setConfiguredPrinters(prev => prev.filter(p => p.id !== printer.id));
      sileo.success({ title: 'Impresora desconectada' });
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo desconectar la impresora';
      sileo.error({ title: 'Error', description: message });
    }
  };

  const handleToggleRole = async (printer: ConfiguredPrinter, role: PrinterRole) => {
    const hasRole = printer.roles.includes(role);
    const roles = hasRole ? printer.roles.filter(r => r !== role) : [...printer.roles, role];
    try {
      const { printer: updated } = await updateConfiguredPrinter(printer.id, { roles });
      setConfiguredPrinters(prev => prev.map(p => p.id === printer.id ? updated : p));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el rol';
      sileo.error({ title: 'Error', description: message });
    }
  };

  const handleToggleActive = async (printer: ConfiguredPrinter, active: boolean) => {
    try {
      const { printer: updated } = await updateConfiguredPrinter(printer.id, { active });
      setConfiguredPrinters(prev => prev.map(p => p.id === printer.id ? updated : p));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado';
      sileo.error({ title: 'Error', description: message });
    }
  };

  const handleTestPrinter = async (printer: ConfiguredPrinter) => {
    setTestingId(printer.id);
    try {
      await testPrintServerPrinter(printer.id, `=== PRUEBA: ${printer.name} ===\nSi lees esto, la impresora está bien conectada.\n`);
      sileo.success({ title: 'Prueba enviada', description: `${printer.name} recibió la orden de prueba.` });
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo enviar la prueba de impresión';
      sileo.error({ title: 'Error', description: message });
    } finally {
      setTestingId(null);
    }
  };

  const unconfiguredSystemPrinters = systemPrinters.filter(name => !configuredNames.has(name));

  return (
    <Stack gap="lg" py="xl">
      <Group justify="space-between" align="center">
        <Group gap="md">
          <Box p={10} style={{ borderRadius: 12, backgroundColor: 'var(--ui-primary-soft)' }}>
            <Printer size={22} color="var(--ui-primary)" weight="fill" />
          </Box>
          <Box>
            <Text fw={900} size="lg">Gestión de Impresoras</Text>
            <Text size="sm" c="dimmed">Conecta las impresoras que ya tienes instaladas en esta PC y asígnales un rol.</Text>
          </Box>
        </Group>
        <Button leftSection={<ArrowsClockwise size={18} weight="bold" />} variant="light" radius="md" onClick={loadCatalog} loading={loadingCatalog}>
          Actualizar
        </Button>
      </Group>

      <Divider />

      <Card withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" mb="sm">
          <Box>
            <Text fw={800} size="md">Estado del print server</Text>
            <Text size="sm" c="dimmed">Este panel corre en la PC de la barra; las tablets se conectan a él por red.</Text>
          </Box>
        </Group>

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Text size="xs" c="dimmed">Servidor</Text>
            <Text fw={700}>{serverOk === null ? 'Sin verificar' : serverOk ? 'Online' : 'Offline'}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Text size="xs" c="dimmed">Cola pendiente</Text>
            <Text fw={700}>{serverQueue === null ? '-' : serverQueue}</Text>
          </Grid.Col>
        </Grid>

        <Box mt="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
          <Text size="xs" c="dimmed">URL activa</Text>
          <Text size="sm" fw={700} style={{ fontFamily: 'monospace' }}>{serverUrl}</Text>
        </Box>

        <Box mt="sm" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
          <Text size="xs" c="dimmed">Última acción</Text>
          <Text size="sm" fw={700}>{lastAction}</Text>
        </Box>
      </Card>

      <Card withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" mb="sm">
          <Box>
            <Text fw={800} size="md">Token de impresión</Text>
            <Text size="sm" c="dimmed">
              Cada dispositivo (tablet/celular) debe tener este mismo token para poder imprimir.
              Se muestra en la consola del print server al iniciarlo en la PC de la barra.
            </Text>
          </Box>
        </Group>
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Token compartido"
            placeholder="Ej: AB3K-9XQZ"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            style={{ flex: 1 }}
            styles={{ input: { fontFamily: 'monospace' } }}
          />
          <Button leftSection={<Key size={16} />} color="myColor" onClick={handleSaveToken}>
            Guardar Token
          </Button>
        </Group>
      </Card>

      {/* ── Impresoras conectadas ─────────────────────────────────────── */}
      <Box>
        <Text fw={800} size="md" mb="sm">Impresoras conectadas</Text>
        {loadingCatalog && configuredPrinters.length === 0 ? (
          <Card withBorder radius="md" p="xl" style={{ textAlign: 'center' }}>
            <Loader size="sm" mx="auto" />
          </Card>
        ) : configuredPrinters.length === 0 ? (
          <Card withBorder radius="md" p="xl" style={{ textAlign: 'center' }}>
            <Stack align="center" gap="sm">
              <Printer size={40} weight="thin" color="gray" />
              <Text fw={700}>No hay impresoras conectadas todavía</Text>
              <Text size="sm" c="dimmed" maw={380}>
                Elige una impresora del catálogo de abajo (las que Windows ya tiene instaladas) para conectarla.
              </Text>
            </Stack>
          </Card>
        ) : (
          <Grid>
            {configuredPrinters.map((printer) => (
              <Grid.Col key={printer.id} span={{ base: 12, sm: 6, md: 4 }}>
                <Paper withBorder p="md" radius="md">
                  <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                      <ThemeIcon variant="light" color="myColor" radius="md">
                        <Printer size={18} weight="bold" />
                      </ThemeIcon>
                      <Text fw={800} size="sm">{printer.name}</Text>
                    </Group>
                    <Switch
                      checked={printer.active}
                      onChange={(e) => handleToggleActive(printer, e.currentTarget.checked)}
                      color="green"
                      size="xs"
                    />
                  </Group>

                  <Text size="xs" c="dimmed" mb={6}>Recibe tickets de:</Text>
                  <Group gap="xs" mb="sm">
                    {(Object.keys(ROLE_LABELS) as PrinterRole[]).map((role) => {
                      const { label, icon: Icon } = ROLE_LABELS[role];
                      const active = printer.roles.includes(role);
                      return (
                        <Chip
                          key={role}
                          checked={active}
                          onChange={() => handleToggleRole(printer, role)}
                          size="xs"
                          variant="filled"
                          color="myColor"
                          icon={<Icon size={12} weight="bold" />}
                        >
                          {label}
                        </Chip>
                      );
                    })}
                  </Group>
                  {printer.roles.length === 0 && (
                    <Text size="xs" c="orange" mb="sm">Sin rol asignado: no recibirá tickets todavía.</Text>
                  )}

                  <Group justify="flex-end" gap="xs">
                    <Button
                      variant="subtle"
                      size="xs"
                      color="gray"
                      onClick={() => handleTestPrinter(printer)}
                      loading={testingId === printer.id}
                    >
                      Probar
                    </Button>
                    <ActionIcon variant="light" color="red" size="sm" onClick={() => handleDisconnect(printer)}>
                      <Trash size={16} />
                    </ActionIcon>
                  </Group>
                </Paper>
              </Grid.Col>
            ))}
          </Grid>
        )}
      </Box>

      {/* ── Catálogo de Windows: impresoras disponibles para conectar ──── */}
      <Box>
        <Group justify="space-between" align="center" mb="sm">
          <Text fw={800} size="md">Impresoras disponibles en esta PC</Text>
          <Badge variant="light" color="gray">{unconfiguredSystemPrinters.length}</Badge>
        </Group>
        {unconfiguredSystemPrinters.length === 0 ? (
          <Card withBorder radius="md" p="lg" style={{ textAlign: 'center' }}>
            <Text size="sm" c="dimmed">
              {systemPrinters.length === 0
                ? 'No se detectaron impresoras instaladas en Windows. Instálalas desde "Dispositivos e impresoras" y pulsa Actualizar.'
                : 'Todas las impresoras detectadas ya están conectadas.'}
            </Text>
          </Card>
        ) : (
          <Stack gap="xs">
            {unconfiguredSystemPrinters.map((name) => (
              <Paper key={name} withBorder p="sm" radius="md">
                <Group justify="space-between">
                  <Group gap="xs">
                    <ThemeIcon variant="light" color="gray" radius="md">
                      <Printer size={16} weight="bold" />
                    </ThemeIcon>
                    <Text fw={600} size="sm">{name}</Text>
                  </Group>
                  <Button
                    size="xs"
                    color="myColor"
                    onClick={() => handleConnect(name)}
                    loading={connectingName === name}
                  >
                    Conectar
                  </Button>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
