import { useEffect, useState } from 'react';
import { Box, Button, Divider, Group, Paper, Stack, Switch, Text, TextInput, ThemeIcon, Grid, Modal, ActionIcon, Select, Card } from '@mantine/core';
import { Printer, Plus, Trash, WifiHigh, Usb, Bluetooth } from '@phosphor-icons/react';
import { useDisclosure } from '@mantine/hooks';
import { sileo } from 'sileo';
import { getPrintServerStatus, savePrintServerPrinter, testPrintServerPrinter } from '../../lib/printServerClient';

type PrinterConfig = {
  id: string;
  nombre: string;
  tipo: 'red' | 'usb' | 'bluetooth';
  conexion: string; // target del print server
  papel: '80mm' | '58mm';
  activa: boolean;
};

const PRINTERS_STORAGE = 'pos_printers_v1';

const DEFAULT_PRINTERS: PrinterConfig[] = [
  { id: '1', nombre: 'Impresora Cocina', tipo: 'red', conexion: '192.168.1.200', papel: '80mm', activa: true },
  { id: '2', nombre: 'Impresora Caja', tipo: 'usb', conexion: 'USB001', papel: '80mm', activa: true },
];

export default function AjustesImpresion() {
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [serverQueue, setServerQueue] = useState<number | null>(null);
  const [printerConfigured, setPrinterConfigured] = useState<boolean | null>(null);
  const [serverActive, setServerActive] = useState<boolean | null>(null);
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:18181');
  const [lastAction, setLastAction] = useState('Sin verificar');
  const [logLines, setLogLines] = useState<string[]>([]);

  // Form State para nueva impresora
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'red' | 'usb' | 'bluetooth'>('red');
  const [conexion, setConexion] = useState('');
  const [papel, setPapel] = useState<'80mm' | '58mm'>('80mm');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedPrinters = localStorage.getItem(PRINTERS_STORAGE);
      if (savedPrinters) {
        setPrinters(JSON.parse(savedPrinters));
      } else {
        setPrinters(DEFAULT_PRINTERS);
        localStorage.setItem(PRINTERS_STORAGE, JSON.stringify(DEFAULT_PRINTERS));
      }
    } catch (error) {
      console.error('Error cargando impresoras:', error);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    setServerUrl(localStorage.getItem('pos_print_server_url') || 'http://127.0.0.1:18181');
  }, []);

  useEffect(() => {
    let mounted = true;
    const syncStatus = async () => {
      try {
        const status = await getPrintServerStatus();
        if (!mounted) return;
        setServerOk(status.ok);
        setServerQueue(status.queue ?? null);
        setPrinterConfigured(status.printerConfigured ?? null);
        setServerActive(status.active ?? null);
        setLastAction(`Servidor OK. Cola: ${status.queue ?? 0}`);
        setLogLines((prev) => [`[${new Date().toLocaleTimeString()}] health ok`, ...prev].slice(0, 6));
      } catch (error) {
        if (!mounted) return;
        setServerOk(false);
        setServerQueue(null);
        setPrinterConfigured(null);
        setServerActive(null);
        const message = error instanceof Error ? error.message : 'error desconocido';
        setLastAction(`Health falló: ${message}`);
        setLogLines((prev) => [`[${new Date().toLocaleTimeString()}] health error: ${message}`, ...prev].slice(0, 6));
      }
    };

    syncStatus();
    return () => {
      mounted = false;
    };
  }, []);

  const savePrinters = (updatedPrinters: PrinterConfig[]) => {
    setPrinters(updatedPrinters);
    localStorage.setItem(PRINTERS_STORAGE, JSON.stringify(updatedPrinters));
  };

  const handleSavePrinter = () => {
    if (!nombre.trim() || !conexion.trim()) {
      sileo.error({ title: 'Error', message: 'Completa todos los campos' });
      return;
    }

    let updated: PrinterConfig[];
    if (editingId) {
      updated = printers.map(p => p.id === editingId ? { ...p, nombre, tipo, conexion, papel } : p);
      sileo.success({ title: 'Impresora actualizada' });
    } else {
      const newPrinter: PrinterConfig = {
        id: Date.now().toString(),
        nombre,
        tipo,
        conexion,
        papel,
        activa: true
      };
      updated = [...printers, newPrinter];
      sileo.success({ title: 'Impresora agregada' });
    }

    savePrinters(updated);

    savePrintServerPrinter({
      name: nombre,
      target: conexion.trim(),
      paper_width: papel === '80mm' ? 48 : 32,
      active: true,
    }).catch(err => {
      console.warn('No se pudo sincronizar la impresora con el print server', err);
    });
    handleCloseModal();
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setNombre('');
    setTipo('red');
    setConexion('');
    setPapel('80mm');
    open();
  };

  const handleOpenEdit = (printer: PrinterConfig) => {
    setEditingId(printer.id);
    setNombre(printer.nombre);
    setTipo(printer.tipo);
    setConexion(printer.conexion);
    setPapel(printer.papel);
    open();
  };

  const handleCloseModal = () => {
    close();
    setEditingId(null);
  };

  const handleDeletePrinter = (id: string) => {
    const updated = printers.filter(p => p.id !== id);
    savePrinters(updated);
    sileo.success({ title: 'Impresora eliminada' });
  };

  const handleTestPrinter = async () => {
    try {
      setLogLines((prev) => [`[${new Date().toLocaleTimeString()}] enviando prueba`, ...prev].slice(0, 6));
      const status = await getPrintServerStatus();
      if (!status.ok) {
        throw new Error('print server no responde correctamente');
      }
      await testPrintServerPrinter('=== PRUEBA DE IMPRESORA ===\nSi lees esto, el servidor esta funcionando.\n');
      setServerOk(true);
      setServerQueue(status.queue ?? null);
      setPrinterConfigured(status.printerConfigured ?? null);
      setServerActive(status.active ?? null);
      setLastAction('Prueba enviada correctamente');
      setLogLines((prev) => [`[${new Date().toLocaleTimeString()}] test ok`, ...prev].slice(0, 6));
      sileo.success({ title: 'Prueba enviada', message: 'La impresora recibió la orden de prueba.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo enviar la prueba de impresión';
      console.warn('No se pudo enviar la prueba de impresión', err);
      setServerOk(false);
      setLastAction(`Prueba falló: ${message}`);
      setLogLines((prev) => [`[${new Date().toLocaleTimeString()}] test error: ${message}`, ...prev].slice(0, 6));
      sileo.error({ title: 'Error', message });
    }
  };

  const handleToggleActive = (id: string, activa: boolean) => {
    const updated = printers.map(p => p.id === id ? { ...p, activa } : p);
    savePrinters(updated);
  };

  const getTipoIcon = (tipo: 'red' | 'usb' | 'bluetooth') => {
    switch (tipo) {
      case 'red': return <WifiHigh size={18} weight="bold" />;
      case 'usb': return <Usb size={18} weight="bold" />;
      case 'bluetooth': return <Bluetooth size={18} weight="bold" />;
    }
  };

  return (
    <Stack gap="lg" py="xl">
      <Group justify="space-between" align="center">
        <Group gap="md">
          <Box p={10} style={{ borderRadius: 12, backgroundColor: 'var(--ui-primary-soft)' }}>
            <Printer size={22} color="var(--ui-primary)" weight="fill" />
          </Box>
          <Box>
            <Text fw={900} size="lg">Gestión de Impresoras</Text>
            <Text size="sm" c="dimmed">Configura y administra las impresoras de tickets del sistema.</Text>
          </Box>
        </Group>
        <Button leftSection={<Plus size={18} weight="bold" />} color="myColor" radius="md" onClick={handleOpenAdd} disabled={!loaded}>
          Agregar Impresora
        </Button>
      </Group>

      <Divider />

      <Card withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" mb="sm">
          <Box>
            <Text fw={800} size="md">Estado del print server</Text>
            <Text size="sm" c="dimmed">Panel rápido para ver si el servidor responde y qué configuración está activa.</Text>
          </Box>
          <Button size="xs" variant="light" onClick={handleTestPrinter}>
            Probar impresión
          </Button>
        </Group>

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Text size="xs" c="dimmed">Servidor</Text>
            <Text fw={700}>{serverOk === null ? 'Sin verificar' : serverOk ? 'Online' : 'Offline'}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Text size="xs" c="dimmed">Cola</Text>
            <Text fw={700}>{serverQueue === null ? '-' : serverQueue}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Text size="xs" c="dimmed">Impresora</Text>
            <Text fw={700}>{printerConfigured === null ? '-' : printerConfigured ? 'Configurada' : 'No configurada'}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Text size="xs" c="dimmed">Activo</Text>
            <Text fw={700}>{serverActive === null ? '-' : serverActive ? 'Sí' : 'No'}</Text>
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

        <Box mt="sm" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
          <Text size="xs" c="dimmed" mb={6}>Log reciente</Text>
          <Stack gap={4}>
            {logLines.length === 0 ? (
              <Text size="sm" c="dimmed">Sin eventos todavía.</Text>
            ) : (
              logLines.map((line, index) => (
                <Text key={`${line}-${index}`} size="xs" style={{ fontFamily: 'monospace' }}>{line}</Text>
              ))
            )}
          </Stack>
        </Box>
      </Card>

      {printers.length === 0 ? (
        <Card withBorder radius="md" p="xl" style={{ textAlign: 'center', minHeight: 200, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Stack align="center" gap="sm">
            <Printer size={48} weight="thin" color="gray" />
            <Text fw={700} size="lg">No hay impresoras configuradas</Text>
            <Text size="sm" c="dimmed" maw={400}>Agrega tu primera impresora térmica (red, USB o Bluetooth) para comenzar a imprimir comandas y facturas.</Text>
            <Button leftSection={<Plus size={16} />} variant="light" color="myColor" mt="xs" onClick={handleOpenAdd}>
              Configurar Impresora
            </Button>
          </Stack>
        </Card>
      ) : (
        <Grid>
          {printers.map((printer) => (
            <Grid.Col key={printer.id} span={{ base: 12, sm: 6, md: 4 }}>
              <Paper withBorder p="md" radius="md" style={{ position: 'relative' }}>
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <ThemeIcon variant="light" color="myColor" radius="md">
                      {getTipoIcon(printer.tipo)}
                    </ThemeIcon>
                    <Box>
                      <Text fw={800} size="sm">{printer.nombre}</Text>
                      <Text size="xs" c="dimmed">{printer.papel} • {printer.tipo.toUpperCase()}</Text>
                    </Box>
                  </Group>
                  <Switch
                    checked={printer.activa}
                    onChange={(e) => handleToggleActive(printer.id, e.currentTarget.checked)}
                    color="green"
                    size="xs"
                  />
                </Group>

                <Box mt="md" p="xs" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
                  <Text size="xs" fw={500} c="dimmed">Conexión / Dirección:</Text>
                  <Text size="sm" fw={700} style={{ fontFamily: 'monospace' }}>{printer.conexion}</Text>
                </Box>

                <Group justify="flex-end" gap="xs" mt="md">
                  <Button variant="subtle" size="xs" color="gray" onClick={() => handleOpenEdit(printer)}>
                    Editar
                  </Button>
                  <ActionIcon variant="light" color="red" size="sm" onClick={() => handleDeletePrinter(printer.id)}>
                    <Trash size={16} />
                  </ActionIcon>
                </Group>
              </Paper>
            </Grid.Col>
          ))}
        </Grid>
      )}

      <Modal opened={opened} onClose={handleCloseModal} title={editingId ? "Editar Impresora" : "Agregar Impresora"} centered radius="md">
        <Stack gap="md">
          <TextInput
            label="Nombre de la impresora"
            placeholder="Ej: Cocina, Barra, Caja"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />

          <Select
            label="Tipo de Conexión"
            value={tipo}
            onChange={(val) => setTipo(val as any)}
            data={[
              { value: 'red', label: 'Red (Ethernet/Wifi)' },
              { value: 'usb', label: 'USB Local' },
              { value: 'bluetooth', label: 'Bluetooth' }
            ]}
          />

          <TextInput
            label="Target del print server"
            placeholder={tipo === 'red' ? 'Ej: cmd:powershell -Command "Get-Content - | Out-Printer -Name \'EPSON TM-T20III Receipt\'"' : tipo === 'usb' ? 'Ej: \\\\?\\USB#VID_... o cmd:...' : 'Ej: 00:11:22:33:FF:EE'}
            description="Se guarda tal cual lo usa el print server: ruta de dispositivo o comando cmd:"
            value={conexion}
            onChange={(e) => setConexion(e.target.value)}
            required
          />

          <Select
            label="Ancho de Papel"
            value={papel}
            onChange={(val) => setPapel(val as any)}
            data={[
              { value: '80mm', label: '80 mm (Estándar)' },
              { value: '58mm', label: '58 mm' }
            ]}
          />

          <Button fullWidth color="myColor" mt="md" onClick={handleSavePrinter}>
            {editingId ? "Guardar Cambios" : "Agregar"}
          </Button>
          <Button fullWidth variant="light" color="gray" onClick={handleTestPrinter}>
            Probar impresión
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
