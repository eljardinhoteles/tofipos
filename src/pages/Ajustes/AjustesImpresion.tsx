import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Divider, Group, Paper, Stack, Switch, Text, TextInput, ThemeIcon, Grid, Modal, ActionIcon } from '@mantine/core';
import { Printer, FileText, FloppyDisk, Scroll, Eye } from '@phosphor-icons/react';
import { useDisclosure } from '@mantine/hooks';
import { sileo } from 'sileo';
import { generarComandaCocina, generarPrecuenta, generarTicketPago, generarPrecuentaDividida } from '../../services/printTemplateEngine';

const MOCK_COMANDA = {
  id: 'mock-123',
  folio: 42,
  created_at: new Date().toISOString(),
  mesero: 'Juan Pérez',
  cliente: 'Consumidor Final',
  cliente_id: '9999999999',
  estado: 'abierta'
} as any;

const MOCK_ITEMS = [
  { item_id: '1', nombre: 'Hamburguesa Clasica', precio: 8.50, cantidad: 2, modificadores: ['Sin cebolla'], nota: 'Bien cocida' },
  { item_id: '2', nombre: 'Papas Fritas', precio: 3.00, cantidad: 1, modificadores: [], nota: '' },
  { item_id: '3', nombre: 'Refresco', precio: 1.50, cantidad: 2, modificadores: [], nota: '' },
] as any;

const MOCK_PAGOS = [
  { id: '1', monto: 26.45, metodo_pago: 'efectivo', fecha: new Date().toISOString() }
] as any;

type PrintFormat = {
  key: string;
  label: string;
  description: string;
  active: boolean;
};

type DocumentSequence = {
  key: string;
  label: string;
  prefix: string;
  nextNumber: number;
};

const FORMAT_STORAGE = 'pos_print_formats_v1';
const SEQ_STORAGE = 'pos_document_sequences_v1';

const DEFAULT_FORMATS: PrintFormat[] = [
  { key: 'cocina', label: 'Comanda Cocina', description: 'Ticket de producción para cocina.', active: true },
  { key: 'precuenta', label: 'Precuenta', description: 'Documento para revisión de mesa.', active: true },
  { key: 'pago', label: 'Ticket de Pago', description: 'Comprobante de cobro de una cuenta.', active: true },
  { key: 'precuenta_dividida', label: 'Precuenta Dividida', description: 'Resumen de cuentas fraccionadas.', active: false },
];

const DEFAULT_SEQUENCES: DocumentSequence[] = [
  { key: 'factura', label: 'Factura', prefix: 'F-', nextNumber: 1 },
  { key: 'precuenta', label: 'Precuenta', prefix: 'P-', nextNumber: 1 },
  { key: 'comanda', label: 'Comanda', prefix: 'C-', nextNumber: 1 },
  { key: 'recibo', label: 'Recibo', prefix: 'R-', nextNumber: 1 },
];

export default function AjustesImpresion() {
  const [formats, setFormats] = useState<PrintFormat[]>(DEFAULT_FORMATS);
  const [sequences, setSequences] = useState<DocumentSequence[]>(DEFAULT_SEQUENCES);
  const [loaded, setLoaded] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<PrintFormat | null>(null);
  const [opened, { open, close }] = useDisclosure(false);

  const openPreview = (format: PrintFormat) => {
    setPreviewFormat(format);
    open();
  };

  const previewContent = useMemo(() => {
    if (!previewFormat) return '';
    switch (previewFormat.key) {
      case 'cocina':
        return generarComandaCocina(MOCK_COMANDA, MOCK_ITEMS, 'MESA #5', false);
      case 'precuenta':
        return generarPrecuenta(MOCK_COMANDA, MOCK_ITEMS, 'MESA #5', 15, []);
      case 'pago':
        return generarTicketPago(MOCK_COMANDA, MOCK_ITEMS, MOCK_PAGOS, 'MESA #5', 15);
      case 'precuenta_dividida':
        return generarPrecuentaDividida(MOCK_COMANDA, MOCK_ITEMS, 'MESA #5', 'Cliente A', 0, 15);
      default:
        return 'Formato no soportado en la vista previa.';
    }
  }, [previewFormat]);

  useEffect(() => {
    try {
      const savedFormats = localStorage.getItem(FORMAT_STORAGE);
      const savedSeq = localStorage.getItem(SEQ_STORAGE);
      if (savedFormats) setFormats(JSON.parse(savedFormats));
      if (savedSeq) setSequences(JSON.parse(savedSeq));
    } catch (error) {
      console.error('Error cargando configuración de impresión:', error);
    } finally {
      setLoaded(true);
    }
  }, []);

  const persist = (nextFormats: PrintFormat[], nextSequences: DocumentSequence[]) => {
    localStorage.setItem(FORMAT_STORAGE, JSON.stringify(nextFormats));
    localStorage.setItem(SEQ_STORAGE, JSON.stringify(nextSequences));
  };

  const saveAll = (nextFormats = formats, nextSequences = sequences) => {
    persist(nextFormats, nextSequences);
    sileo.success({ title: 'Impresión actualizada' });
  };

  const updateFormat = (key: string, active: boolean) => {
    const next = formats.map((item) => item.key === key ? { ...item, active } : item);
    setFormats(next);
    persist(next, sequences);
  };

  const updateSequence = (key: string, patch: Partial<DocumentSequence>) => {
    const next = sequences.map((item) => item.key === key ? { ...item, ...patch } : item);
    setSequences(next);
    persist(formats, next);
  };

  return (
    <Stack gap="lg" py="xl">
      <Group justify="space-between" align="center">
          <Group gap="md">
            <Box p={10} style={{ borderRadius: 12, backgroundColor: 'var(--ui-primary-soft)' }}>
              <Printer size={22} color="var(--ui-primary)" weight="fill" />
            </Box>
            <Box>
              <Text fw={900} size="lg">Gestión de Impresión</Text>
              <Text size="sm" c="dimmed">Activa formatos y administra secuencias de documentos.</Text>
            </Box>
          </Group>
          <Button leftSection={<FloppyDisk size={18} weight="bold" />} color="myColor" radius="md" onClick={() => saveAll()} disabled={!loaded}>
            Guardar
          </Button>
        </Group>

        <Divider />

        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Box>
              <Group mb="md" gap="sm">
                <ThemeIcon variant="light" color="myColor" radius="md">
                  <FileText size={18} weight="bold" />
                </ThemeIcon>
                <Text fw={800}>Formatos Activos</Text>
              </Group>
              <Stack gap="sm">
                {formats.map((format) => (
                  <Paper key={format.key} withBorder p="md" radius="md" bg="white">
                    <Group justify="space-between" align="center">
                      <Box>
                        <Text fw={700}>{format.label}</Text>
                        <Text size="xs" c="dimmed">{format.description}</Text>
                      </Box>
                      <Group gap="xs">
                        <Switch
                          checked={format.active}
                          onChange={(e) => updateFormat(format.key, e.currentTarget.checked)}
                          color="green"
                          size="sm"
                        />
                        <ActionIcon variant="light" color="blue" onClick={() => openPreview(format)} radius="md">
                          <Eye size={18} weight="bold" />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
              <Text size="xs" c="dimmed" mt="sm">
                Formatos disponibles: {formats.length}
              </Text>
            </Box>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <Box>
              <Group mb="md" gap="sm">
                <ThemeIcon variant="light" color="myColor" radius="md">
                  <Scroll size={18} weight="bold" />
                </ThemeIcon>
                <Text fw={800}>Secuencias de Documentos</Text>
              </Group>
              <Stack gap="sm">
                {sequences.map((seq) => (
                  <Paper key={seq.key} withBorder p="md" radius="md" bg="white">
                    <Stack gap="xs">
                      <Text fw={700}>{seq.label}</Text>
                      <Group grow align="end">
                        <TextInput
                          label="Prefijo"
                          value={seq.prefix}
                          onChange={(e) => updateSequence(seq.key, { prefix: e.target.value })}
                          radius="md"
                          size="sm"
                        />
                        <TextInput
                          label="Siguiente número"
                          type="number"
                          value={String(seq.nextNumber)}
                          onChange={(e) => updateSequence(seq.key, { nextNumber: Number(e.target.value || 1) })}
                          radius="md"
                          size="sm"
                        />
                      </Group>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          </Grid.Col>
        </Grid>

      <Modal opened={opened} onClose={close} title="Ejemplo de Formato" centered size="lg">
        {previewFormat && (
          <Box p="md" bg="gray.1" style={{ borderRadius: 8, border: '1px dashed #ccc', maxHeight: '70vh', overflowY: 'auto' }}>
            <Text fw={700} ta="center" mb="sm">{previewFormat.label}</Text>
            <Box mt="md" style={{ display: 'flex', justifyContent: 'center' }}>
              <pre style={{ 
                fontFamily: 'monospace', 
                fontSize: '12px', 
                lineHeight: 1.4, 
                whiteSpace: 'pre-wrap', 
                backgroundColor: 'white', 
                padding: '16px', 
                border: '1px solid #ddd', 
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                maxWidth: '100%',
                overflowX: 'auto'
              }}>
                {previewContent}
              </pre>
            </Box>
          </Box>
        )}
      </Modal>
    </Stack>
  );
}
