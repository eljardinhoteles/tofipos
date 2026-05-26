import { useState } from 'react';
import {
  Drawer,
  Stack,
  Text,
  Group,
  Button,
  ScrollArea,
  ThemeIcon,
  Divider,
  Badge,
  ActionIcon,
  Paper,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Drawer as VaulDrawer } from 'vaul';
import { ClipboardText, Printer, FileText, X, Check } from '@phosphor-icons/react';
import { sileo } from 'sileo';
import { initVerticalRxDb } from '../../../db/rxdb';
import { isOperativeComanda } from '../../../db/comandaState';
import { generarReporteCocinaConsolidado } from '../../../services/printTemplateEngine';
import { TicketPreviewModal } from '../../Common/TicketPreviewModal';
import { A4ReportPreviewModal } from '../../Common/A4ReportPreviewModal';
import type { Comanda, HabitacionCuenta } from '../../../db/database';

interface SidebarKitchenReportProps {
  opened: boolean;
  onClose: () => void;
  allMesas: any[];
  allComandas: Comanda[];
  allCuentas: HabitacionCuenta[];
}

export function SidebarKitchenReport({
  opened,
  onClose,
  allMesas,
  allComandas,
  allCuentas,
}: SidebarKitchenReportProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [selectedReportMesas, setSelectedReportMesas] = useState<Set<string>>(new Set());
  const [reportData, setReportData] = useState<Array<{ mesaNombre: string; habitacionNombre?: string; items: any[] }>>([]);
  const [previewOpened, setPreviewOpened] = useState(false);
  const [a4PreviewOpened, setA4PreviewOpened] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [loading, setLoading] = useState(false);

  const activeMesas = (allMesas ?? [])
    .filter(m => m.piso.toLowerCase() !== 'habitaciones' && allComandas.some(c => c.mesa_id === m.id && isOperativeComanda(c)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: 'base' }));

  const toggleMesa = (id: string, checked: boolean) => {
    const newSet = new Set(selectedReportMesas);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedReportMesas(newSet);
  };

  const handleSelectAll = () => setSelectedReportMesas(new Set(activeMesas.map(m => m.id)));
  const handleDeselectAll = () => setSelectedReportMesas(new Set());

  const handleGenerarReporte = async (tipo: '80mm' | 'a4') => {
    if (selectedReportMesas.size === 0) {
      sileo.error({ title: 'Ninguna mesa seleccionada' });
      return;
    }
    setLoading(true);
    try {
      const rxDb = await initVerticalRxDb();
      const mesasData: Array<{ mesaNombre: string; habitacionNombre?: string; items: any[] }> = [];

      const sorted = Array.from(selectedReportMesas).sort((aId, bId) => {
        const a = allMesas.find(m => m.id === aId);
        const b = allMesas.find(m => m.id === bId);
        if (!a || !b) return 0;
        return a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: 'base' });
      });

      for (const mesaId of sorted) {
        const mesa = allMesas.find(m => m.id === mesaId);
        const comanda = allComandas.find(c => c.mesa_id === mesaId && isOperativeComanda(c));
        if (!mesa || !comanda) continue;

        const docs = await rxDb.comanda_items.find({
          selector: { comanda_id: comanda.id, _deleted: { $ne: true } }
        }).exec();
        const items = docs.map((d: any) => d.toJSON());
        if (items.length === 0) continue;

        let habitacionNombre = '';
        if (comanda.habitacion_cuenta_id) {
          const cuenta = allCuentas.find(c => c.id === comanda.habitacion_cuenta_id);
          if (cuenta) {
            const roomMesa = allMesas.find(m => m.id === cuenta.mesa_id);
            if (roomMesa) habitacionNombre = roomMesa.nombre;
          }
        }
        mesasData.push({ mesaNombre: mesa.nombre, habitacionNombre: habitacionNombre || undefined, items });
      }

      if (mesasData.length === 0) {
        sileo.error({ title: 'Las mesas seleccionadas no tienen productos' });
        return;
      }

      setReportData(mesasData);
      if (tipo === '80mm') {
        setPreviewTitle('Reporte Consolidado de Cocina');
        setPreviewContent(generarReporteCocinaConsolidado(mesasData));
        setPreviewOpened(true);
      } else {
        setA4PreviewOpened(true);
      }
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error generando reporte' });
    } finally {
      setLoading(false);
    }
  };

  // ── Contenido compartido ─────────────────────────────────────────────
  const content = (
    <Stack gap="lg" style={{ height: '100%' }}>
      {/* Descripción */}
      <Text size="sm" c="dimmed" lh={1.6}>
        Selecciona las mesas para generar un reporte consolidado de cocina.
      </Text>

      {/* Acciones rápidas */}
      <Group justify="space-between" align="center">
        <Badge variant="light" color="myColor" radius="sm" size="lg">
          {activeMesas.length} mesa{activeMesas.length !== 1 ? 's' : ''} activa{activeMesas.length !== 1 ? 's' : ''}
        </Badge>
        <Group gap="xs">
          <Button variant="subtle" size="xs" color="myColor" onClick={handleSelectAll} disabled={activeMesas.length === 0}>
            Todas
          </Button>
          <Button variant="subtle" size="xs" color="gray" onClick={handleDeselectAll} disabled={selectedReportMesas.size === 0}>
            Ninguna
          </Button>
        </Group>
      </Group>

      <Divider />

      {/* Lista de mesas */}
      <ScrollArea flex={1} type="auto">
        <Stack gap="xs">
          {activeMesas.length === 0 ? (
            <Stack align="center" py="xl" gap="xs">
              <ClipboardText size={40} weight="thin" color="var(--mantine-color-dimmed)" />
              <Text ta="center" c="dimmed" size="sm">No hay mesas activas para reportar.</Text>
            </Stack>
          ) : (
            activeMesas.map(mesa => {
              const comanda = allComandas.find(c => c.mesa_id === mesa.id && isOperativeComanda(c));
              const clientName = comanda?.cliente;
              
              let habitacionNombre = '';
              if (comanda?.habitacion_cuenta_id) {
                const cuenta = allCuentas.find(c => c.id === comanda.habitacion_cuenta_id);
                if (cuenta) {
                  const roomMesa = allMesas.find(m => m.id === cuenta.mesa_id);
                  if (roomMesa) {
                    habitacionNombre = roomMesa.nombre.replace(/^(HAB(ITACI[OÓ]N)?\s*:?\s*)/i, '').trim();
                  }
                }
              }

              const isChecked = selectedReportMesas.has(mesa.id);

              return (
                <Paper
                  key={mesa.id}
                  p="sm"
                  radius="md"
                  withBorder
                  onClick={() => toggleMesa(mesa.id, !isChecked)}
                  style={{
                    cursor: 'pointer',
                    border: `1px solid ${isChecked ? 'var(--ui-primary)' : 'var(--pos-border)'}`,
                    backgroundColor: isChecked ? 'var(--ui-primary-soft)' : 'var(--pos-bg)',
                    transition: 'all 120ms ease',
                    userSelect: 'none',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" align="center" style={{ width: '100%' }}>
                    <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                      {isChecked ? (
                        <ThemeIcon variant="filled" color="myColor" radius="xl" size={24} style={{ flexShrink: 0 }}>
                          <Check size={14} weight="bold" />
                        </ThemeIcon>
                      ) : (
                        <ThemeIcon variant="outline" color="gray" radius="xl" size={24} style={{ flexShrink: 0, opacity: 0.5, borderStyle: 'dashed' }}>
                          <div style={{ width: 14, height: 14 }} />
                        </ThemeIcon>
                      )}
                      <Stack gap={2} style={{ flex: 1 }}>
                        <Text fw={800} size="sm" c={isChecked ? 'var(--ui-primary)' : 'var(--pos-text)'}>
                          {mesa.nombre}
                        </Text>
                        {clientName && clientName !== 'Consumidor Final' && (
                          <Text size="xs" c="dimmed" fw={600} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {clientName}
                          </Text>
                        )}
                      </Stack>
                    </Group>

                    {habitacionNombre && (
                      <Badge size="xs" color="blue" variant="light" style={{ flexShrink: 0 }}>
                        HAB: {habitacionNombre}
                      </Badge>
                    )}
                  </Group>
                </Paper>
              );
            })
          )}
        </Stack>
      </ScrollArea>

      {/* Footer con botones */}
      <Stack gap="xs">
        <Divider />
        <Group grow>
          <Button
            variant="light"
            color="myColor"
            leftSection={<Printer size={16} weight="bold" />}
            onClick={() => handleGenerarReporte('80mm')}
            disabled={selectedReportMesas.size === 0}
            loading={loading}
          >
            Ticket 80mm
          </Button>
          <Button
            color="myColor"
            leftSection={<FileText size={16} weight="bold" />}
            onClick={() => handleGenerarReporte('a4')}
            disabled={selectedReportMesas.size === 0}
            loading={loading}
          >
            Hoja A4
          </Button>
        </Group>
        <Button variant="subtle" color="gray" onClick={onClose} size="sm">
          Cancelar
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <>
      {/* ── Desktop: Mantine Drawer ────────────────────────────────────── */}
      {!isMobile && (
        <Drawer
          position="right"
          opened={opened}
          onClose={onClose}
          size={400}
          title={
            <Group gap="xs">
              <ThemeIcon variant="light" color="myColor" radius="md" size="lg">
                <ClipboardText size={18} weight="bold" />
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={900} size="md" c="var(--pos-text)" lh={1.2}>Reporte de Cocina</Text>
                <Text size="xs" c="dimmed">Consolidado de mesas activas</Text>
              </Stack>
            </Group>
          }
          styles={{
            content: { backgroundColor: 'var(--pos-bg)', display: 'flex', flexDirection: 'column' },
            header: { backgroundColor: 'var(--pos-bg)', borderBottom: '1px solid var(--pos-border)', paddingBottom: 12 },
            body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
          }}
        >
          {content}
        </Drawer>
      )}

      {/* ── Mobile: Vaul Sheet desde abajo ────────────────────────────── */}
      {isMobile && (
        <VaulDrawer.Root open={opened} onOpenChange={v => !v && onClose()}>
          <VaulDrawer.Portal>
            <VaulDrawer.Content className="vaul-content">
              <VaulDrawer.Title className="sr-only">Reporte de Cocina</VaulDrawer.Title>
              <VaulDrawer.Description className="sr-only">
                Selecciona mesas para generar reporte consolidado de cocina
              </VaulDrawer.Description>

              <div className="vaul-handle" />

              {/* Header */}
              <Group px="lg" py="md" justify="space-between" align="center" style={{ borderBottom: '1px solid var(--pos-border)' }}>
                <Group gap="xs">
                  <ThemeIcon variant="light" color="myColor" radius="md" size="lg">
                    <ClipboardText size={18} weight="bold" />
                  </ThemeIcon>
                  <Stack gap={0}>
                    <Text fw={900} size="md" c="var(--pos-text)" lh={1.2}>Reporte de Cocina</Text>
                    <Text size="xs" c="dimmed">Consolidado de mesas activas</Text>
                  </Stack>
                </Group>
                <ActionIcon variant="subtle" color="gray" radius="xl" size="lg" onClick={onClose}>
                  <X size={18} weight="bold" />
                </ActionIcon>
              </Group>

              {/* Body */}
              <div className="vaul-body" style={{ overflowY: 'hidden', flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }} data-vaul-no-drag>
                {opened && content}
              </div>
            </VaulDrawer.Content>
          </VaulDrawer.Portal>
        </VaulDrawer.Root>
      )}

      {/* ── Modales de preview (compartidos) ─────────────────────────── */}
      <TicketPreviewModal
        opened={previewOpened}
        onClose={() => setPreviewOpened(false)}
        title={previewTitle}
        content={previewContent}
      />

      <A4ReportPreviewModal
        opened={a4PreviewOpened}
        onClose={() => setA4PreviewOpened(false)}
        mesasData={reportData}
      />
    </>
  );
}
