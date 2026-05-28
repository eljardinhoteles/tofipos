// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import { Box, Stack, Text, Group, ActionIcon, Button, ScrollArea, Divider, Badge, NumberInput, UnstyledButton, ThemeIcon, Center, Modal, Paper } from '@mantine/core';
import { X, Plus, User, Printer, ArrowCounterClockwise, Trash, Minus, PushPin, Calculator, Check, CheckCircle, ListPlus, Bed, Basket, CaretDoubleUp, ArrowDown, CaretDown } from '@phosphor-icons/react';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { type Mesa } from '../../../db/database';
import { sileo } from 'sileo';
import { ClienteFormModal } from '../../Clientes/ClienteFormModal';
import { ClienteExpandableHeader } from './ClienteExpandableHeader';
import { ComandaItemRow } from './ComandaItemRow';
import { useIvaActivo } from '../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from '../../../lib/taxUtils';
import { SidebarPagosModal } from './SidebarPagosModal';
import { SidebarCloseCuentaModal } from './SidebarCloseCuentaModal';
import { ProductModifiersModal } from '../../Products/ProductModifiersModal';
import { generarComandaCocina, generarPrecuenta } from '../../../services/printTemplateEngine';
import { TicketPreviewModal } from '../../Common/TicketPreviewModal';
import { createRxPago, updateRxComanda, updateRxComandaItem } from '../../../db/rxdb';
import { useRxMenuCatalog } from '../../../hooks/useRxMenuCatalog';
import { useRxClientes } from '../../../hooks/useRxClientes';
import { useUI } from '../../../context/UIContext';
import { initVerticalRxDb } from '../../../db/rxdb';
import { queueKitchenPrint } from '../../../lib/printServerClient';

interface SidebarDetailsProps {
  selectedMesa: Mesa;
  activeComanda: any;
  comandaItems: any[];
  onClose: () => void;
  onAddProduct: () => void;
  onAction: (mesa: Mesa, action: string) => void;
}

export function SidebarDetails({
  selectedMesa,
  activeComanda: activeComandaProp,
  comandaItems = [],
  onClose,
  onAddProduct,
  onAction,
}: SidebarDetailsProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [previewOpened, setPreviewOpened] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewContent, setPreviewContent] = useState('');

  const viewport = useRef<HTMLDivElement>(null);
  const [showArrow, setShowArrow] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [showPagosModal, setShowPagosModal] = useState(false);
  const [modifyingProduct, setModifyingProduct] = useState<any | null>(null);
  const [editClienteModal, setEditClienteModal] = useState(false);
  const [closeCuentaModalOpen, setCloseCuentaModalOpen] = useState(false);
  const [closePayerName, setClosePayerName] = useState<string>('');
  const [isAddPressed, setIsAddPressed] = useState(false);
  const [showRoomChargeModal, setShowRoomChargeModal] = useState(false);
  const [selectedRoomChargeId, setSelectedRoomChargeId] = useState<string | null>(null);
  const [liveComanda, setLiveComanda] = useState<any | null>(activeComandaProp || null);
  const [pagos, setPagos] = useState<any[]>([]);
  const [linkedHabitacionCuenta, setLinkedHabitacionCuenta] = useState<any | null>(null);
  const [linkedMesa, setLinkedMesa] = useState<any | null>(null);
  const [activeRoomAccounts, setActiveRoomAccounts] = useState<any[]>([]);
  const [allMesas, setAllMesas] = useState<any[]>([]);

  useEffect(() => {
    if (closeCuentaModalOpen && activeComandaProp) {
      setClosePayerName(activeComandaProp.cliente || 'Consumidor Final');
    }
  }, [closeCuentaModalOpen, activeComandaProp]);
  const { clientes } = useRxClientes();
  const { mesaView, setMesaView } = useUI();

  useEffect(() => {
    let alive = true;
    let subs: Array<{ unsubscribe: () => void }> = [];
    (async () => {
      const rxDb = await initVerticalRxDb();
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const refresh = async () => {
        if (!activeComandaProp?.id) return;
        const c = await rxDb.comandas.findOne(activeComandaProp.id).exec();
        if (!alive) return;
        setLiveComanda(c ? c.toJSON() : activeComandaProp);
        const p = await rxDb.pagos.find({ selector: { comanda_id: activeComandaProp.id, _deleted: { $ne: true } } }).exec();
        if (!alive) return;
        setPagos(p.map((d: any) => d.toJSON()));
        const hc = activeComandaProp.habitacion_cuenta_id
          ? await rxDb.habitacion_cuentas.findOne(activeComandaProp.habitacion_cuenta_id).exec()
          : null;
        if (!alive) return;
        setLinkedHabitacionCuenta(hc ? hc.toJSON() : null);
        const lm = hc ? await rxDb.mesas.findOne(hc.toJSON().mesa_id).exec() : null;
        if (!alive) return;
        setLinkedMesa(lm ? lm.toJSON() : null);
        if (!hc) {
          setLinkedHabitacionCuenta(null);
          setLinkedMesa(null);
        }
        const rac = await rxDb.habitacion_cuentas.find({ selector: { organization_id: orgId, estado: 'activa', _deleted: { $ne: true } } }).exec();
        if (!alive) return;
        setActiveRoomAccounts(rac.map((d: any) => d.toJSON()));
        const ms = await rxDb.mesas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).exec();
        if (!alive) return;
        setAllMesas(ms.map((d: any) => d.toJSON()));
      };
      await refresh();
      if (activeComandaProp?.id) {
        subs.push(rxDb.comandas.findOne(activeComandaProp.id).$.subscribe(() => refresh()));
        subs.push(rxDb.pagos.find({ selector: { comanda_id: activeComandaProp.id, _deleted: { $ne: true } } }).$.subscribe(() => refresh()));
      }
    })().catch(() => {});
    return () => {
      alive = false;
      subs.forEach(s => s.unsubscribe());
    };
  }, [activeComandaProp?.id, activeComandaProp?.habitacion_cuenta_id]);

  const activeComanda = liveComanda || activeComandaProp;
  const mesaBaseName = selectedMesa?.nombre || '';
  const mesaDisplayLabel = mesaBaseName.toLowerCase().startsWith('mesa')
    ? mesaBaseName
    : `Mesa ${mesaBaseName}`;
  const headerMesaNumber = mesaBaseName.toLowerCase().startsWith('mesa')
    ? mesaBaseName.split(' ').pop()
    : mesaBaseName;
  const habitacionNombre = linkedMesa?.nombre || null;
  const habitacionNumero = habitacionNombre?.match(/Hab\.\s*(\d+)/)?.[1] || habitacionNombre;

  const editForm = useForm({
    initialValues: {
      cantidad: 1,
      precio: 0,
    }
  });

  useEffect(() => {
    if (editingItem) {
      editForm.setValues({
        cantidad: editingItem.cantidad,
        precio: editingItem.precio,
      });
    }
  }, [editingItem]);

  const handleUpdateItem = async (values: typeof editForm.values) => {
    if (!editingItem) return;
    if (editingItem.pagado_cantidad && editingItem.pagado_cantidad > 0) {
      sileo.error({ title: 'Error', description: 'No se puede modificar un producto que ya tiene unidades pagadas.' });
      setEditingItem(null);
      return;
    }
    await updateRxComandaItem(editingItem.id, {
      cantidad: values.cantidad,
      precio: values.precio
    });

    // Si la comanda estaba confirmada, volver a estado pendiente de confirmación
    if (activeComanda?.confirmada) {
      await updateRxComanda(activeComanda.id, { confirmada: false });
    }

    setEditingItem(null);
  };

  const handleDeleteItem = async () => {
    if (!editingItem) return;
    if (editingItem.pagado_cantidad && editingItem.pagado_cantidad > 0) {
      sileo.error({ title: 'Error', description: 'No se puede eliminar un producto que ya tiene unidades pagadas.' });
      setEditingItem(null);
      return;
    }
    await updateRxComandaItem(editingItem.id, { _deleted: true });

    // Si la comanda estaba confirmada, volver a estado pendiente de confirmación
    if (activeComanda?.confirmada) {
      await updateRxComanda(activeComanda.id, { confirmada: false });
    }

    setEditingItem(null);
  };

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const { menuItems } = useRxMenuCatalog();

  // Cálculos de IVA centralizados por item
  const totales = calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
  const subtotal = totales.subtotalNeto;
  const ivaCalculado = totales.ivaTotal;
  const total = totales.total;
  const totalPagado = pagos.reduce((acc, p) => acc + p.monto, 0);
  const saldoPendiente = Math.max(0, total - totalPagado);

  // Snapshot de cantidades guardado en la última confirmación: { [item_id]: cantidad }
  const cantidadesSnapshot: Record<string, number> = (() => {
    try {
      return activeComanda?.cantidades_snapshot
        ? JSON.parse(activeComanda.cantidades_snapshot)
        : {};
    } catch { return {}; }
  })();

  // 1. Ítems completamente nuevos (created_at posterior a confirmada_at)
  const itemsRealmenteNuevos = activeComanda?.confirmada_at
    ? comandaItems.filter(item =>
        item.created_at && item.created_at > activeComanda.confirmada_at
      )
    : [];

  // 2. Ítems existentes cuya cantidad aumentó respecto al snapshot
  const itemsConCantidadExtra = activeComanda?.confirmada_at
    ? comandaItems
        .filter(item => {
          const cantConfirmada = cantidadesSnapshot[item.id];
          return cantConfirmada !== undefined && item.cantidad > cantConfirmada;
        })
        .map(item => ({
          ...item,
          // Solo la diferencia de cantidad va a cocina
          cantidad: item.cantidad - cantidadesSnapshot[item.id],
        }))
    : [];

  // Unir ambos grupos para la comanda adicional
  const itemsNuevos = [...itemsRealmenteNuevos, ...itemsConCantidadExtra];
  const hayItemsNuevos = itemsNuevos.length > 0;

  const handleCerrarCuentaDirecto = async () => {
    if (!activeComanda) return;
    try {
      // 1. Si hay un saldo pendiente > 0, registrar el pago directo de todo lo pendiente
      if (saldoPendiente > 0.01) {
        await updateRxComanda(activeComanda.id, {
          total: total,
          updated_at: new Date().toISOString(),
        });
        await updateRxComanda(activeComanda.id, {
          confirmada: true,
        });
        await updateRxComanda(activeComanda.id, {
          estado: activeComanda.estado === 'cuenta' ? 'cuenta' : activeComanda.estado,
        });
        await updateRxComanda(activeComanda.id, {
          _modified: new Date().toISOString(),
        });
        await createRxPago({
          id: crypto.randomUUID(),
          comanda_id: activeComanda.id,
          monto: saldoPendiente,
          metodo_pago: 'efectivo',
          fecha: new Date().toISOString(),
          tipo_division: closePayerName?.trim() ? `Directo - ${closePayerName.trim()}` : `Directo - ${activeComanda.cliente || 'Consumidor Final'}`,
          organization_id: activeComanda.organization_id || localStorage.getItem('pos_active_org_id') || ''
        } as any);
      }

      // 2. Imprimir pre-cuenta (toast informativo y log operativo)
      sileo.success({
        title: 'Ticket de Cierre',
        description: `Imprimiendo precuenta de ${selectedMesa.nombre}...`
      });

      // 3. Cerrar comanda y liberar mesa
      await updateRxComanda(activeComanda.id, {
        estado: 'cerrado',
        mesa_nombre: activeComanda.mesa_nombre || selectedMesa.nombre,
      });

      // 4. Mostrar éxito y cerrar
      sileo.success({
        title: 'Cierre completado',
        description: `${selectedMesa.nombre} quedó libre.`
      });
      setCloseCuentaModalOpen(false);
      onClose(); // Cerrar el Sidebar de la mesa
    } catch (err) {
      console.error(err);
      sileo.error({ title: 'Error al cerrar la cuenta' });
    }
  };

  const handleScroll = (position: { x: number; y: number }) => {
    if (!viewport.current) return;
    const { scrollHeight, clientHeight } = viewport.current;
    const isAtBottom = scrollHeight - position.y <= clientHeight + 10;
    setShowArrow(!isAtBottom && scrollHeight > clientHeight);
  };

  const handleChargeToRoom = async () => {
    if (!activeComanda || !selectedRoomChargeId) return;
    try {
      const cuenta = activeRoomAccounts.find(c => c.id === selectedRoomChargeId);
      if (!cuenta) {
        sileo.error({ title: 'Cuenta no encontrada' });
        return;
      }

      await updateRxComanda(activeComanda.id, {
        habitacion_cuenta_id: cuenta.id,
        confirmada: true,
        sincronizado: true,
      });

      const roomMesa = allMesas.find(m => m.id === cuenta.mesa_id);
      const roomName = roomMesa?.nombre || cuenta.mesa_id;
      sileo.success({
        title: 'Cargo enviado a habitación',
        description: `Comanda #${activeComanda.folio} cargada a ${roomName} — ${cuenta.huesped}`
      });

      setShowRoomChargeModal(false);
      setSelectedRoomChargeId(null);
      onClose();
    } catch (error) {
      console.error(error);
      sileo.error({ title: 'Error al enviar cargo a habitación' });
    }
  };

  useEffect(() => {
    if (viewport.current) {
      const { scrollHeight, clientHeight } = viewport.current;
      setShowArrow(scrollHeight > clientHeight);
    }
  }, [comandaItems]);

  return (
    <Box h="100%" className="sidebar-details">
      {/* Header Fijo */}
      <Box 
        style={{ 
          backgroundColor: isMobile ? 'white' : 'transparent',
          paddingLeft: 'var(--mantine-spacing-md)',
          paddingRight: 'var(--mantine-spacing-md)',
          paddingTop: 'var(--mantine-spacing-md)',
          paddingBottom: 0
        }}
      >
        <Group justify="space-between" mb="xs">
          <Group gap="md">
            <ThemeIcon
              size={46}
              radius="md"
              color={activeComanda?.estado === 'cuenta' ? 'orange' : (selectedMesa.estado === 'ocupada' ? 'green' : 'red')}
              className="sidebar-details__mesa-icon"
            >
              <Text fw={900} size="xl" c="white">
                {headerMesaNumber}
              </Text>
            </ThemeIcon>
            <Stack gap={2}>
              {/* Cliente + badge habitación */}
              <Group gap={6} align="center" lh={1.1} wrap="nowrap">
                <User size={16} weight="bold" color="var(--ui-primary)" className="sidebar-details__shrink-icon" style={{ flexShrink: 0 }} />
                <Text fw={850} size="md" c="var(--pos-text)" className="sidebar-details__break-text">
                  {activeComanda?.cliente || 'Público General'}
                </Text>
                {habitacionNombre && (
                  <Badge
                    variant="filled"
                    color="blue"
                    size="sm"
                    radius="sm"
                    leftSection={<Bed size={11} weight="bold" />}
                    style={{ flexShrink: 0 }}
                  >
                    Hab. {habitacionNumero}
                  </Badge>
                )}
              </Group>

              {/* Orden y Mesa */}
              <Group gap={6} align="center" wrap="nowrap" lh={1}>
                <Text size="xs" c="dimmed" fw={750}>
                  ORDEN #{activeComanda?.folio}
                  <Text component="span" mx={6} c="dimmed" fw={500}>·</Text>
                  {mesaDisplayLabel}
                </Text>
              </Group>
            </Stack>
          </Group>
          <Group gap="xs">
            {/* El botón de Cerrar siempre va en el header */}
            <ActionIcon
              variant="light"
              color="gray"
              onClick={onClose}
              size="lg"
              radius="xl"
            >
              <X size={18} weight="bold" />
            </ActionIcon>
          </Group>
        </Group>

        <ClienteExpandableHeader
          clienteNombre={activeComanda?.cliente}
          showEditButton
          onEdit={() => setEditClienteModal(true)}
          onChangeCliente={async (nuevoNombre, nuevoId) => {
            if (activeComanda) {
              await updateRxComanda(activeComanda.id, {
                cliente: nuevoNombre,
                cliente_id: nuevoId || undefined
              });
              sileo.success({
                title: 'Cliente cambiado',
                description: `La comanda ahora está vinculada a ${nuevoNombre}.`
              });
            }
          }}
        />
      </Box>

      {/* Lista de Items Scrollable */}
      <Box 
        className="sidebar-details__items"
        style={{ backgroundColor: isMobile ? 'white' : 'transparent' }}
      >
        {comandaItems.length === 0 ? (
          <Center h="100%">
            <Stack align="center" gap="md">
              <Box style={{ width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1 }}>
                <img src="/comanda.webp" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </Box>
              <Stack align="center" gap={4}>
                <Text fw={700} size="md" c="dimmed">Comanda vacía</Text>
                <Text size="xs" c="dimmed" ta="center" maw={180}>
                  Toque el botón "Añadir" para cargar productos.
                </Text>
                <Box mt="xs" opacity={0.35} className="sidebar-details__empty-arrow">
                  <ArrowDown size={20} weight="bold" color="var(--pos-text)" />
                </Box>
              </Stack>
            </Stack>
          </Center>
        ) : (
          <ScrollArea
            h="100%"
            p="md"
            pt="xs"
            viewportRef={viewport}
            onScrollPositionChange={handleScroll}
            type="never"
          >
            <Stack gap={2}>
              {comandaItems.map((item, index) => {
                const hasPaidQty = item.pagado_cantidad && item.pagado_cantidad > 0;
                return (
                  <ComandaItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    total={comandaItems.length}
                    onClick={
                      hasPaidQty
                        ? () => sileo.warning({
                            title: 'Producto con pagos',
                            description: 'No se puede modificar un producto que ya tiene unidades pagadas.'
                          })
                        : () => setEditingItem(item)
                    }
                  />
                );
              })}
            </Stack>
          </ScrollArea>
        )}

        {/* Indicador de scroll inferior */}
        {showArrow && (
          <Box
            className="sidebar-details__scroll-cue"
          >
            <CaretDown size={20} weight="bold" color="var(--ui-primary)" />
          </Box>
        )}
      </Box>

      {/* Footer Fijo con Totales y Acciones */}
      <Box
        p="lg"
        className="sidebar-details__footer"
      >
        {!editingItem && activeComanda?.estado !== 'cuenta' && (
          <>
            <Button
              variant="subtle"
              color="myColor"
              size="md"
              radius="xl"
              leftSection={mesaView === 'productos' ? <CheckCircle size={18} weight="bold" /> : <Basket size={18} />}
              onClick={mesaView === 'productos' ? () => setMesaView('mapa') : onAddProduct}
              onPointerDown={() => setIsAddPressed(true)}
              onPointerUp={() => setIsAddPressed(false)}
              onPointerCancel={() => setIsAddPressed(false)}
              onPointerLeave={() => setIsAddPressed(false)}
              className={`sidebar-details__add-button${isAddPressed ? ' sidebar-details__add-button--pressed' : ''}${comandaItems.length === 0 ? ' sidebar-details__add-button--pulse' : ''}`}
            >
              {mesaView === 'productos' ? 'Guardar' : 'Añadir'}
            </Button>
          </>
        )}

        <Stack gap="xs">
          {!editingItem && (
            <>
              <Group justify="space-between">
                <Text size="sm" c="dimmed" fw={600}>Subtotal</Text>
                <Text fw={700} size="sm" c="var(--pos-text)">${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed" fw={600}>IVA {ivaPorcentaje}%</Text>
                <Text fw={700} size="sm" c="var(--pos-text)">${ivaCalculado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
              </Group>

              {totalPagado > 0 && (
                <UnstyledButton onClick={() => setShowPagosModal(true)} py={4} className="hover-bg-gray sidebar-details__paid-button">
                  <Group justify="space-between">
                    <Text size="sm" fw={700} td="underline" className="sidebar-details__paid-label">PAGADO</Text>
                    <Text size="sm" fw={700} className="sidebar-details__paid-label">-${totalPagado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                  </Group>
                </UnstyledButton>
              )}

              <Divider my={4} color="var(--pos-border)" />

              {totalPagado > 0 ? (
                <Group justify="space-between" mt={4} p="md" className="sidebar-details__pending-box">
                  <Stack gap={0}>
                    <Text size="xs" fw={700} tt="uppercase" className="sidebar-details__pending-label">Saldo Pendiente</Text>
                    <Text size="sm" c="dimmed" fw={500}>De un total de ${total.toFixed(2)}</Text>
                  </Stack>
                  <Text size="24px" fw={900} className="sidebar-details__pending-label">${saldoPendiente.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                </Group>
              ) : (
                <Group justify="space-between">
                  <Text size="md" fw={800} tt="uppercase" c="var(--pos-text)">Total</Text>
                  <Text size="24px" fw={900} c="var(--ui-primary)">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                </Group>
              )}
            </>
          )}

          <Stack gap="sm" mt="md">
            {editingItem ? (
              <form onSubmit={editForm.onSubmit(handleUpdateItem)} className="sidebar-details__form">
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={800} tt="uppercase" c="var(--ui-primary)">Editando Producto</Text>
                    <ActionIcon variant="subtle" color="gray" onClick={() => setEditingItem(null)}>
                      <X size={18} />
                    </ActionIcon>
                  </Group>

                  <Group gap="md" justify="center">
                    <ActionIcon
                      size="xl"
                      variant="white"
                      radius="xl"
                      className="sidebar-details__quantity-button"
                      onClick={() => editForm.setFieldValue('cantidad', Math.max(1, editForm.values.cantidad - 1))}
                    >
                      <Minus size={22} weight="bold" />
                    </ActionIcon>

                    <Box ta="center" miw={60}>
                      <Text size="32px" fw={900}>{editForm.values.cantidad}</Text>
                    </Box>

                    <ActionIcon
                      size="xl"
                      variant="white"
                      radius="xl"
                      className="sidebar-details__quantity-button"
                      onClick={() => editForm.setFieldValue('cantidad', editForm.values.cantidad + 1)}
                    >
                      <Plus size={22} weight="bold" />
                    </ActionIcon>
                  </Group>

                  <NumberInput
                    label="Precio Unitario"
                    prefix="$"
                    decimalScale={2}
                    fixedDecimalScale
                    {...editForm.getInputProps('precio')}
                    radius="md"
                    size="md"
                  />

                  <Button
                    variant="light"
                    color="myColor"
                    fullWidth
                    size="md"
                    leftSection={<ListPlus size={18} />}
                    onClick={async () => {
                      if (!editingItem) return;
                      const product = menuItems.find((m: any) => m.id === editingItem.item_id);
                      if (product) {
                        setModifyingProduct(product);
                      } else {
                        sileo.error({ title: 'Error', description: 'No se encontró la configuración del producto.' });
                      }
                    }}
                  >
                    Personalizar (Adicionales)
                  </Button>

                  <Group grow gap="sm" mt="xs">
                    <Button
                      variant="subtle"
                      color="red"
                      radius="md"
                      size="lg"
                      leftSection={<Trash size={20} />}
                      onClick={handleDeleteItem}
                    >
                      Eliminar
                    </Button>
                    <Button
                      type="submit"
                      color="myColor"
                      radius="md"
                      size="lg"
                    >
                      Guardar Cambios
                    </Button>
                  </Group>
                </Stack>
              </form>
            ) : (
              <>
                {activeComanda?.estado !== 'cuenta' && (
                  <Stack gap="sm">
                    <Group grow gap="sm">
                      <Button
                        variant={!activeComanda?.confirmada ? 'filled' : hayItemsNuevos ? 'filled' : 'light'}
                        color={!activeComanda?.confirmada ? 'orange' : hayItemsNuevos ? 'green' : 'gray'}
                        size="lg"
                        radius="md"
                        leftSection={
                          !activeComanda?.confirmada
                            ? <Check size={18} weight="bold" />
                            : hayItemsNuevos
                              ? <Printer size={18} weight="bold" />
                              : <Printer size={18} />
                        }
                        disabled={comandaItems.length === 0}
                        onClick={async () => {
                          if (!activeComanda?.confirmada) {
                            // Primera confirmación: guardar snapshot y enviar toda la comanda a cocina
                            const ahora = new Date().toISOString();
                            const snapshot = Object.fromEntries(
                              comandaItems.map(item => [item.id, item.cantidad])
                            );
                            await updateRxComanda(activeComanda.id, {
                              confirmada: true,
                              confirmada_at: ahora,
                              cantidades_snapshot: JSON.stringify(snapshot)
                            });
                            queueKitchenPrint({
                              comanda: activeComanda,
                              items: comandaItems,
                              mesaNombre: selectedMesa.nombre,
                              esAdicional: false,
                              habitacionNombre: linkedMesa?.nombre,
                            }).catch(err => console.warn('print server offline', err));
                            sileo.success({ title: 'Orden Confirmada', description: 'La comanda fue sincronizada con las demás tablets.' });
                          } else if (hayItemsNuevos) {
                            // Hay ítems nuevos o con cantidad extra → imprimir solo el adicional
                            const content = generarComandaCocina(
                              activeComanda,
                              itemsNuevos,
                              selectedMesa.nombre,
                              true,
                              linkedMesa?.nombre
                            );
                            setPreviewContent(content);
                            setPreviewTitle(`Adicional Cocina - ${selectedMesa.nombre}`);
                            setPreviewOpened(true);
                            // Actualizar confirmada_at Y snapshot para el próximo ciclo
                            const nuevoSnapshot = Object.fromEntries(
                              comandaItems.map(item => [item.id, item.cantidad])
                            );
                            await updateRxComanda(activeComanda.id, {
                              confirmada_at: new Date().toISOString(),
                              cantidades_snapshot: JSON.stringify(nuevoSnapshot)
                            });
                            queueKitchenPrint({
                              comanda: activeComanda,
                              items: itemsNuevos,
                              mesaNombre: selectedMesa.nombre,
                              esAdicional: true,
                              habitacionNombre: linkedMesa?.nombre,
                            }).catch(err => console.warn('print server offline', err));
                          } else {
                            // Sin ítems nuevos → reimprimir toda la comanda
                            const content = generarComandaCocina(
                              activeComanda,
                              comandaItems,
                              selectedMesa.nombre,
                              false,
                              linkedMesa?.nombre
                            );
                            setPreviewContent(content);
                            setPreviewTitle(`Orden de Cocina - ${selectedMesa.nombre}`);
                            setPreviewOpened(true);
                          }
                        }}
                        fw={800}
                        className="sidebar-details__confirm-button"
                      >
                        {!activeComanda?.confirmada
                          ? 'Confirmar'
                          : hayItemsNuevos
                            ? `Adicional (${itemsNuevos.length})`
                            : 'Reimprimir'
                        }
                      </Button>
                      <Button
                        variant="light"
                        color="green"
                        size="lg"
                        radius="md"
                        leftSection={<CaretDoubleUp size={18} weight="bold" />}
                        onClick={() => onAction(selectedMesa, 'cuenta')}
                        disabled={total === 0}
                        fw={800}
                      >
                        Pedir Cuenta
                      </Button>
                    </Group>

                    <Group grow gap="sm">
                      <Button
                        variant="light"
                        color="blue"
                        size="lg"
                        radius="md"
                        leftSection={<Bed size={18} />}
                        onClick={async () => {
                          // Si la comanda ya está vinculada a una habitación (fue abierta desde la hab.)
                          // confirmar directamente sin mostrar el modal
                          if (activeComanda?.habitacion_cuenta_id && linkedHabitacionCuenta) {
                            try {
                              await updateRxComanda(activeComanda.id, {
                                habitacion_cuenta_id: linkedHabitacionCuenta.id,
                                confirmada: true,
                                sincronizado: true,
                              });
                              const roomName = linkedMesa?.nombre || linkedHabitacionCuenta.mesa_id;
                              sileo.success({
                                title: 'Cargo confirmado',
                                description: `Comanda #${activeComanda.folio} cargada a ${roomName} — ${linkedHabitacionCuenta.huesped}`
                              });
                              onClose();
                            } catch (error) {
                              console.error(error);
                              sileo.error({ title: 'Error al confirmar cargo a habitación' });
                            }
                            return;
                          }
                          // Sin habitación vinculada: abrir modal de selección
                          if (activeRoomAccounts.length === 0) {
                            sileo.error({
                              title: 'Sin cuentas activas',
                              description: 'Abre una habitación para poder cargar esta comanda.'
                            });
                            return;
                          }
                          setShowRoomChargeModal(true);
                        }}
                        disabled={total === 0}
                        fw={800}
                      >
                        Cargar Hab.
                      </Button>

                      <Button
                        variant="subtle"
                        color="red"
                        size="lg"
                        radius="md"
                        onClick={() => onAction(selectedMesa, 'cancelar')}
                      >
                        Anular
                      </Button>
                    </Group>
                  </Stack>
                )}

                {activeComanda?.estado === 'cuenta' && (
                  <Stack gap="sm">
                    <Group grow gap="sm">
                      <Button
                        variant="filled"
                        color="yellow"
                        size="lg"
                        radius="md"
                        leftSection={<Printer size={20} />}
                        onClick={() => {
                          const content = generarPrecuenta(
                            activeComanda,
                            comandaItems,
                            selectedMesa.nombre,
                            ivaPorcentaje,
                            pagos,
                            linkedMesa?.nombre
                          );
                          setPreviewContent(content);
                          setPreviewTitle(`Precuenta - ${selectedMesa.nombre}`);
                          setPreviewOpened(true);
                        }}
                      >
                        Pre Cuenta
                      </Button>

                      <Button
                        color="green"
                        size="lg"
                        radius="md"
                        leftSection={<CheckCircle size={18} weight="bold" />}
                        onClick={() => setCloseCuentaModalOpen(true)}
                        fw={900}
                      >Cerrar Cuenta
                      </Button>
                    </Group>

                    <Group grow gap="sm">
                      <Button
                        variant="light"
                        color="myColor"
                        size="lg"
                        radius="md"
                        leftSection={<Calculator size={18} weight="bold" />}
                        onClick={() => onAction(selectedMesa, 'dividido')}
                        fw={800}
                      >
                        Dividir
                      </Button>

                      <Button
                        variant="light"
                        color="gray"
                        size="lg"
                        radius="md"
                        leftSection={<ArrowCounterClockwise size={20} />}
                        onClick={() => onAction(selectedMesa, 'reabrir')}
                      >
                        Reabrir
                      </Button>
                    </Group>
                  </Stack>
                )}
              </>
            )}
          </Stack>
        </Stack>
      </Box>

      <SidebarCloseCuentaModal
        opened={closeCuentaModalOpen}
        onClose={() => setCloseCuentaModalOpen(false)}
        saldoPendiente={saldoPendiente}
        closePayerName={closePayerName}
        setClosePayerName={setClosePayerName}
        onConfirm={handleCerrarCuentaDirecto}
      />

      {/* Modal Historial de Pagos */}
      <SidebarPagosModal
        opened={showPagosModal}
        onClose={() => setShowPagosModal(false)}
        pagos={pagos}
        totalPagado={totalPagado}
      />

      {/* Modal Cliente — usa datos completos de la tabla de clientes */}
      <ClienteFormModal
        opened={editClienteModal}
        onClose={() => setEditClienteModal(false)}
        editingCliente={clientes.find(c => c.nombre === activeComanda?.cliente) || null}
        initialNombre={activeComanda?.cliente}
      />

      <ProductModifiersModal
        opened={!!modifyingProduct}
        onClose={() => setModifyingProduct(null)}
        product={modifyingProduct}
        onConfirm={async (selected) => {
          if (editingItem) {
            await updateRxComandaItem(editingItem.id, { modificadores: selected });
            setEditingItem((prev: any | null) => prev ? { ...prev, modificadores: selected } : null);
            sileo.success({ title: 'Adicionales Actualizados', description: 'Los modificadores se guardaron correctamente.' });
          }
        }}
      />

      <Modal
        opened={showRoomChargeModal}
        onClose={() => setShowRoomChargeModal(false)}
        title="Cargar a habitación abierta"
        centered
        size={isMobile ? '100%' : 'sm'}
        zIndex={2000}
        styles={{
          content: {
            backgroundColor: 'var(--pos-bg)',
            border: '1px solid var(--pos-border)',
            ...(isMobile ? {
              height: 'calc(100dvh - 32px)',
              width: 'calc(100vw - 32px)',
              margin: '16px',
              display: 'flex',
              flexDirection: 'column',
            } : {}),
          },
          body: {
            ...(isMobile ? {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden',
              padding: 'var(--mantine-spacing-md)',
            } : {}),
          },
          header: {
            borderBottom: '1px solid var(--pos-border)',
            paddingBottom: '12px',
          }
        }}
      >
        <Stack gap="md" style={isMobile ? { flex: 1, minHeight: 0 } : undefined}>
          <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
            Selecciona una habitación activa para transferir la comanda #{activeComanda?.folio}.
          </Text>

          <ScrollArea
            offsetScrollbars
            style={isMobile ? { flex: 1, minHeight: 0 } : { maxHeight: 320 }}
          >
            <Stack gap="sm" pb="xs">
              {activeRoomAccounts.map((cuenta) => {
                const roomMesa = allMesas.find((m) => m.id === cuenta.mesa_id);
                const roomName = roomMesa?.nombre || cuenta.mesa_id;
                const isSelected = selectedRoomChargeId === cuenta.id;
                return (
                  <Paper
                    key={cuenta.id}
                    p="md"
                    radius="md"
                    withBorder
                    onClick={() => setSelectedRoomChargeId(cuenta.id)}
                    className={isSelected ? 'room-charge-card room-charge-card--selected' : 'room-charge-card'}
                    style={{ cursor: 'pointer' }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon size={40} radius="xl" variant={isSelected ? 'filled' : 'light'} color={isSelected ? 'blue' : 'gray'}>
                          <Bed size={18} />
                        </ThemeIcon>
                        <Stack gap={2}>
                          <Text fw={800} size="sm">{roomName}</Text>
                          <Text size="xs" c="dimmed">{cuenta.huesped}</Text>
                        </Stack>
                      </Group>
                      <Badge size="xs" color="green" variant="light">Activa</Badge>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>

          {activeRoomAccounts.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" style={{ flexShrink: 0 }}>
              No hay cuentas abiertas.
            </Text>
          )}
          <Group grow style={{ flexShrink: 0 }}>
            <Button variant="default" onClick={() => setShowRoomChargeModal(false)}>
              Cancelar
            </Button>
            <Button
              color="blue"
              onClick={handleChargeToRoom}
              disabled={!selectedRoomChargeId}
            >
              Confirmar cargo
            </Button>
          </Group>
        </Stack>
      </Modal>

      <TicketPreviewModal
        opened={previewOpened}
        onClose={() => setPreviewOpened(false)}
        title={previewTitle}
        content={previewContent}
      />
    </Box>
  );
}
