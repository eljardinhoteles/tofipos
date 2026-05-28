import { useEffect, useState } from 'react';
import { Box, Button, Divider, Group, Paper, Stack, Switch, Text, TextInput, ThemeIcon, Grid, Modal, ActionIcon, Select, Card } from '@mantine/core';
import { Printer, Plus, Trash, WifiHigh, Usb, Bluetooth } from '@phosphor-icons/react';
import { useDisclosure } from '@mantine/hooks';
import { sileo } from 'sileo';
import { savePrintServerPrinter } from '../../lib/printServerClient';

type PrinterConfig = {
  id: string;
  nombre: string;
  tipo: 'red' | 'usb' | 'bluetooth';
  conexion: string; // IP o Puerto
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
      name: editingId ? nombre : nombre,
      target: conexion,
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
            label={tipo === 'red' ? 'Dirección IP' : tipo === 'usb' ? 'Nombre del Puerto USB' : 'Nombre/Dirección MAC Bluetooth'}
            placeholder={tipo === 'red' ? 'Ej: 192.168.1.100' : tipo === 'usb' ? 'Ej: USB001' : 'Ej: 00:11:22:33:FF:EE'}
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
        </Stack>
      </Modal>
    </Stack>
  );
}
