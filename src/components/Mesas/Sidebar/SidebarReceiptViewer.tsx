import { useEffect, useState } from 'react';
import { Box, Stack, Text, Group, ActionIcon, Button, ScrollArea, Badge, Paper } from '@mantine/core';
import { X, Printer, User, PushPin, BedIcon, ForkKnifeIcon, ListChecks } from '@phosphor-icons/react';
import { type Mesa } from '../../../db/database';
import { useIvaActivo } from '../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from '../../../lib/taxUtils';
import { SidebarConciliarModal } from './SidebarConciliarModal';
import { SidebarPagosModal } from './SidebarPagosModal';
import { generarTicketPago, generarPrecuenta } from '../../../services/printTemplateEngine';
import { TicketPreviewModal } from '../../Common/TicketPreviewModal';
import { initVerticalRxDb } from '../../../db/rxdb';
import { useRxMenuCatalog } from '../../../hooks/useRxMenuCatalog';

interface SidebarReceiptViewerProps {
  selectedMesa: Mesa;
  activeComanda: any;
  comandaItems: any[];
  onClose: () => void;
  onAction: (mesa: Mesa, action: string) => void;
}

export function SidebarReceiptViewer({
  selectedMesa,
  activeComanda,
  comandaItems = [],
  onClose,
  onAction: _onAction,
}: SidebarReceiptViewerProps) {
  const [showPagosModal, setShowPagosModal] = useState(false);
  const [sidebarConciliarOpen, setSidebarConciliarOpen] = useState(false);
  const [previewOpened, setPreviewOpened] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [pagos, setPagos] = useState<any[]>([]);
  const [habitacionCuenta, setHabitacionCuenta] = useState<any | null>(null);
  const [habitacionMesa, setHabitacionMesa] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    if (activeComanda?.habitacion_cuenta_id) {
      initVerticalRxDb().then(async rxDb => {
        const doc = await rxDb.habitacion_cuentas.findOne(activeComanda.habitacion_cuenta_id).exec();
        if (alive && doc) {
          const cuentaData = doc.toJSON();
          setHabitacionCuenta(cuentaData);
          if (cuentaData.mesa_id) {
            const mDoc = await rxDb.mesas.findOne(cuentaData.mesa_id).exec();
            if (alive && mDoc) {
              setHabitacionMesa(mDoc.toJSON());
            }
          }
        }
      });
    } else {
      setHabitacionCuenta(null);
      setHabitacionMesa(null);
    }
    return () => {
      alive = false;
    };
  }, [activeComanda?.habitacion_cuenta_id]);

  useEffect(() => {
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;

    (async () => {
      if (!activeComanda?.id) {
        if (alive) setPagos([]);
        return;
      }
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const query = rxDb.pagos.find({
        selector: { comanda_id: activeComanda.id }
      });
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setPagos(docs.map((doc: any) => doc.toJSON()));
      });
    })().catch(() => {});

    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, [activeComanda?.id]);

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const { menuItems } = useRxMenuCatalog();

  // Cálculos financieros centralizados por item
  const totales = calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
  const subtotal = totales.subtotalNeto;
  const ivaCalculado = totales.ivaTotal;

  const totalPagado = pagos.reduce((acc, p) => acc + p.monto, 0);

  const isFacturado = activeComanda?.estado === 'facturado';
  const isAnulada = activeComanda?.estado === 'anulada';
  const esComandaEnHabitacionActiva = !!activeComanda?.habitacion_cuenta_id &&
                                       activeComanda.estado !== 'cerrado' &&
                                       activeComanda.estado !== 'facturado' &&
                                       activeComanda.estado !== 'anulada';

  return (
    <Box
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'white',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'rgba(0, 0, 0, 0.05) -4px 0px 16px',
        position: 'relative'
      }}
    >
      {/* Botones Flotantes (Visibles solo en desktop/tablet fuera del sidebar) */}
      <Stack
        gap="xs"
        visibleFrom="sm"
        className="sidebar-details__floating-actions"
      >
        {/* Botón de Pin */}
        <ActionIcon
          variant="default"
          onClick={() => setIsPinned(!isPinned)}
          size={40}
          radius="xl"
          className="tap"
          style={{
            backgroundColor: 'white',
            border: '1px solid var(--pos-border)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
            color: isPinned ? 'var(--ui-primary)' : 'var(--pos-text-sub)',
            cursor: 'pointer',
          }}
        >
          <PushPin size={18} weight={isPinned ? 'fill' : 'regular'} />
        </ActionIcon>
      </Stack>

      {/* 1. Encabezado Premium */}
      <Box p="md" style={{ borderBottom: '1px solid var(--pos-border)', flexShrink: 0 }}>
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={onClose}
              radius="md"
              size="md"
              style={{ alignSelf: isFacturado ? 'flex-start' : 'center', marginTop: isFacturado ? 2 : 0 }}
            >
              <X size={20} />
            </ActionIcon>
            <Stack gap={0}>
              <Text fw={800} size="md">
                Detalle Comanda #{activeComanda?.folio}
              </Text>
              {isFacturado && (
                <Text size="xs" fw={700} c="myColor">
                  Factura: {activeComanda.factura_nro || 'Sin número'}
                </Text>
              )}
            </Stack>
          </Group>

          <Group gap="xs">
            <Badge
              color={esComandaEnHabitacionActiva ? 'teal' : isFacturado ? 'blue' : isAnulada ? 'red' : 'green'}
              variant="light"
              size="md"
              radius="md"
              fw={800}
            >
              {esComandaEnHabitacionActiva ? 'En Habitación' : isFacturado ? 'Conciliada' : isAnulada ? 'Anulada' : 'Cobrada'}
            </Badge>
          </Group>
        </Group>
      </Box>

      {/* 2. Información Consolidada de la Orden (Cliente y Mesa/Habitación) */}
      <Box p="md" style={{ backgroundColor: 'var(--pos-bg-light)', borderBottom: '1px solid var(--pos-border)', flexShrink: 0 }}>
        <Stack gap={6}>
          {/* Nivel 1: Cliente */}
          <Group gap={4} wrap="nowrap">
            <User size={16} color="var(--ui-primary)" style={{ flexShrink: 0 }} />
            <Text size="sm" fw={800} c="var(--ui-primary)" truncate style={{ maxWidth: '100%' }}>
              Cliente: {activeComanda?.cliente || habitacionCuenta?.huesped || 'Consumidor Final'}
            </Text>
          </Group>

          {/* Nivel 2: Mesa/Habitación */}
          <Group gap={4} wrap="nowrap">
            {activeComanda?.habitacion_cuenta_id
              ? <BedIcon size={16} color="var(--pos-text-muted)" style={{ flexShrink: 0 }} />
              : <ForkKnifeIcon size={16} color="var(--pos-text-muted)" style={{ flexShrink: 0 }} />
            }
            <Text size="sm" fw={800} c="var(--pos-text-sub)">
              {(() => {
                if (activeComanda?.habitacion_cuenta_id) {
                  const roomName = habitacionMesa?.nombre || activeComanda?.mesa_nombre || 'Habitación';
                  const prefix = roomName.toLowerCase().startsWith('hab') || roomName.toLowerCase().startsWith('cuart') || roomName.toLowerCase().startsWith('room') ? '' : 'Habitación ';
                  return `${prefix}${roomName}`;
                }
                const name = selectedMesa?.nombre || activeComanda?.mesa_nombre || 'Desconocida';
                const prefix = name.toLowerCase().startsWith('mesa') || name.toLowerCase().startsWith('hab') ? '' : 'Mesa ';
                return `${prefix}${name}`;
              })()}
            </Text>
          </Group>
        </Stack>
      </Box>

      {/* 3. Lista de Ítems (Visualización tipo Recibo) */}
      <ScrollArea style={{ flexGrow: 1, padding: '16px' }} type="hover">
        <Stack gap="xs">
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={1} mb={4}>
            Detalle del Consumo
          </Text>

          {comandaItems.map((item, index) => (
            <Box key={item.id}>
              {index > 0 && <Box style={{ borderTop: '1px dashed var(--pos-border)', marginTop: 8, marginBottom: 8 }} />}
              <Group justify="space-between" wrap="nowrap" align="center" py={2}>
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text size="sm" fw={750} truncate>
                    {item.nombre}
                  </Text>
                  <Group gap={6} wrap="wrap" align="center">
                    <Text size="xs" c="dimmed" fw={700}>
                      Cant: {item.cantidad}
                    </Text>
                    {item.modificadores && item.modificadores.length > 0 &&
                      item.modificadores.map((mod: string) => (
                        <Badge key={`${item.id}-${mod}`} size="xs" variant="light" color="gray" radius="sm" style={{ textTransform: 'none' }}>
                          {mod}
                        </Badge>
                      ))
                    }
                  </Group>
                </Stack>
                <Text fw={800} size="sm" style={{ flexShrink: 0 }}>
                  ${(item.precio * item.cantidad).toFixed(2)}
                </Text>
              </Group>
            </Box>
          ))}

          {comandaItems.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              Esta comanda no contiene productos registrados.
            </Text>
          )}
        </Stack>
      </ScrollArea>

      {/* 4. Totales y Acciones (Fijados al pie) */}
      <Box p="md" style={{ borderTop: '1px solid var(--pos-border)', flexShrink: 0, backgroundColor: 'white' }}>
        <Stack gap="xs" mb="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed" fw={700}>Subtotal</Text>
            <Text size="sm" fw={700}>${subtotal.toFixed(2)}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed" fw={700}>IVA ({ivaPorcentaje}%)</Text>
            <Text size="sm" fw={700}>${ivaCalculado.toFixed(2)}</Text>
          </Group>
          <Group justify="space-between" align="baseline">
            <Text size="md" fw={900}>Total Pagado</Text>
            <Text size="xl" fw={900} c="green">${totalPagado.toFixed(2)}</Text>
          </Group>
        </Stack>

        {/* Panel de Estado / Conciliación o Controles */}
        <Stack gap="sm">
          {isFacturado && activeComanda.factura_nota && (
            <Paper
              withBorder
              p="sm"
              radius="md"
              style={{
                borderColor: 'var(--pos-border)',
                backgroundColor: 'var(--pos-bg-light)'
              }}
            >
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={1} mb={2}>Nota de Factura</Text>
              <Text size="xs" c="var(--pos-text-sub)">{activeComanda.factura_nota}</Text>
            </Paper>
          )}

          {!isFacturado && !isAnulada && !esComandaEnHabitacionActiva && (
            <Button
              color="green"
              size="lg"
              radius="md"
              leftSection={<ListChecks size={20} weight="bold" />}
              onClick={() => {
                setShowPagosModal(false);
                setSidebarConciliarOpen(true);
              }}
              fw={900}
              fullWidth
            >
              Conciliar
            </Button>
          )}

          <Group grow gap="sm">
            <Button
              variant="light"
              color="myColor"
              size="lg"
              radius="md"
              leftSection={<Printer size={20} />}
              onClick={() => {
                const content = esComandaEnHabitacionActiva
                  ? generarPrecuenta(activeComanda, comandaItems, selectedMesa.nombre, ivaPorcentaje, [], habitacionMesa?.nombre)
                  : generarTicketPago(
                      activeComanda,
                      comandaItems,
                      pagos,
                      selectedMesa.nombre,
                      ivaPorcentaje,
                      undefined,
                      habitacionMesa?.nombre
                    );
                setPreviewContent(content);
                setPreviewTitle(esComandaEnHabitacionActiva ? `Imprimir Precuenta - ${selectedMesa.nombre}` : `Reimprimir Recibo - ${selectedMesa.nombre}`);
                setPreviewOpened(true);
              }}
              fw={800}
            >
              {esComandaEnHabitacionActiva ? 'Imprimir Precuenta' : 'Reimprimir'}
            </Button>

            {!esComandaEnHabitacionActiva && (
              <Button
                variant="light"
                color="gray"
                size="lg"
                radius="md"
                onClick={() => setShowPagosModal(true)}
                fw={800}
              >
                Ver Pagos
              </Button>
            )}
          </Group>
        </Stack>
      </Box>

      {/* 5. Modales Reutilizados */}
      <SidebarPagosModal
        opened={showPagosModal}
        onClose={() => setShowPagosModal(false)}
        pagos={pagos}
        totalPagado={totalPagado}
      />

      <SidebarConciliarModal
        opened={sidebarConciliarOpen}
        onClose={() => setSidebarConciliarOpen(false)}
        activeComanda={activeComanda}
        onSuccess={() => {
          onClose(); // Cerrar sidebar tras éxito
        }}
      />

      <TicketPreviewModal
        opened={previewOpened}
        onClose={() => setPreviewOpened(false)}
        title={previewTitle}
        content={previewContent}
      />
    </Box>
  );
}
