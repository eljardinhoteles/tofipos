import { useEffect, useState, useRef } from 'react';
import {
  Box, Stack, Group, Text, Button, ActionIcon,
  Badge, ScrollArea, Divider, ThemeIcon, NumberInput, Paper,
  SimpleGrid, UnstyledButton
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  CalendarBlank, Clock, Users, MapPin, ArrowLeft,
  Receipt, Money, Note, HandCoins, PencilSimple,
  CreditCard, Bank, Calculator, X, ArrowUpRight, CheckCircle,
  Basket, Minus, Plus, Trash, ListPlus, Printer, WhatsappLogo
} from '@phosphor-icons/react';
import { type Reserva } from '../../../db/database';
import { sileo } from 'sileo';
import { useUI } from '../../../context/UIContext';
import { PaymentMethodButton } from './SidebarCheckout';
import { ClienteExpandableHeader } from './ClienteExpandableHeader';
import { ComandaItemRow } from './ComandaItemRow';
import { ClienteFormModal } from '../../Clientes/ClienteFormModal';
import { ProductModifiersModal } from '../../Products/ProductModifiersModal';
import { useIvaActivo } from '../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from '../../../lib/taxUtils';
import { useRxClientes } from '../../../hooks/useRxClientes';
import { initVerticalRxDb, updateRxReserva, updateRxComanda, createRxPago, updateRxComandaItem } from '../../../db/rxdb';
import { useRxMenuCatalog } from '../../../hooks/useRxMenuCatalog';
import html2canvas from 'html2canvas';
import { ReservaWhatsAppCard } from './ReservaWhatsAppCard';
import { generarTicketReserva } from '../../../services/printTemplateEngine';
import { TicketPreviewModal } from '../../Common/TicketPreviewModal';

interface SidebarReservaDetailProps {
  reservaId: string;
  onBack: () => void;
  onClose: () => void;
}

const STATUS_COLOR: Record<Reserva['estado'], string> = {
  pendiente: 'yellow',
  confirmada: 'green',
  cancelada: 'red',
  completada: 'gray',
};
  const STATUS_LABEL: Record<Reserva['estado'], string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
};
const STATUS_ICON_BG: Record<Reserva['estado'], string> = {
  pendiente: 'var(--ui-primary)',
  confirmada: 'var(--status-active)',
  cancelada: 'var(--status-closed)',
  completada: 'var(--mantine-color-gray-6)',
};

export function SidebarReservaDetail({ reservaId, onBack, onClose }: SidebarReservaDetailProps) {
  const whatsappCardRef = useRef<HTMLDivElement>(null);
  const [previewOpened, setPreviewOpened] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [abonoInput, setAbonoInput] = useState<number | ''>('');
  const [abonoMetodo, setAbonoMetodo] = useState<'efectivo' | 'tarjeta' | 'transferencia' | 'otros'>('efectivo');
  const [view, setView] = useState<'detalles' | 'pagos'>('detalles');
  const [editClienteModal, setEditClienteModal] = useState(false);
  const [isAddPressed, setIsAddPressed] = useState(false);
  
  const { setReservaView, openConfirm, openPrompt, openAssignModal, reservaProductosComandaId, setReservaProductosComandaId } = useUI();

  const [reserva, setReserva] = useState<any | null>(null);
  const [comandaItems, setComandaItems] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [zonas, setZonas] = useState<any[]>([]);
  const { clientes } = useRxClientes();
  const [mesas, setMesas] = useState<any[]>([]);

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const { menuItems } = useRxMenuCatalog();

  const handlePrint = () => {
    if (!reserva) return;
    const clientZone = zonas.find(z => z.id === reserva.zona_id)?.nombre || '';
    const content = generarTicketReserva(reserva, comandaItems as any, clientZone, ivaPorcentaje, pagos);
    setPreviewContent(content);
    setPreviewTitle('Ticket de Reserva');
    setPreviewOpened(true);
    sileo.success({ title: 'Ticket generado', description: 'Vista previa abierta.' });
  };

  const handleShareWhatsApp = async () => {
    if (!reserva || !whatsappCardRef.current) return;
    try {
      const canvas = await html2canvas(whatsappCardRef.current, {
        backgroundColor: '#f8f9fa',
        scale: 2,
        logging: false,
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          sileo.error({ title: 'Error', description: 'No se pudo generar la imagen' });
          return;
        }
        const file = new File([blob], `reserva-${reserva.folio || reserva.id.substring(0,6)}.png`, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Reserva ${reserva.nombre}`,
            text: `Aquí tienes los detalles de tu reserva confirmada.`,
          });
          sileo.success({ title: 'Compartido', description: 'Se abrió el menú de compartir' });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          sileo.success({ title: 'Imagen descargada', description: 'Se descargó la imagen de la reserva' });
        }
      }, 'image/png');
    } catch (err) {
      console.error(err);
      sileo.error({ title: 'Error', description: 'No se pudo generar la imagen' });
    }
  };

  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [modifyingProduct, setModifyingProduct] = useState<any | null>(null);

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

    if (reserva?.comanda_id) {
      await updateRxComanda(reserva.comanda_id, { confirmada: false });
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

    if (reserva?.comanda_id) {
      await updateRxComanda(reserva.comanda_id, { confirmada: false });
    }

    setEditingItem(null);
  };

  useEffect(() => {
    let alive = true;
    let subs: Array<{ unsubscribe: () => void }> = [];
    let comandaSubs: Array<{ unsubscribe: () => void }> = [];

    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';

      subs.push(
        rxDb.pisos.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
          if (alive) setZonas(docs.map((d: any) => d.toJSON()));
        }),
        rxDb.mesas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
          if (alive) setMesas(docs.map((d: any) => d.toJSON()));
        }),
        rxDb.reservas.findOne(reservaId).$.subscribe((reservaDoc: any) => {
          if (!alive) return;
          const r = reservaDoc ? reservaDoc.toJSON() : null;
          setReserva(r);

          // Clear previous comanda subscriptions if comanda_id changed or was removed
          comandaSubs.forEach(s => s.unsubscribe());
          comandaSubs = [];

          if (r?.comanda_id) {
            comandaSubs.push(
              rxDb.comanda_items.find({ selector: { comanda_id: r.comanda_id, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
                if (alive) setComandaItems(docs.map((d: any) => d.toJSON()));
              }),
              rxDb.pagos.find({ selector: { comanda_id: r.comanda_id, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
                if (alive) setPagos(docs.map((d: any) => d.toJSON()));
              })
            );
          } else {
            setComandaItems([]);
            setPagos([]);
          }
        })
      );
    })().catch(() => {});

    return () => {
      alive = false;
      subs.forEach(s => s.unsubscribe());
      comandaSubs.forEach(s => s.unsubscribe());
    };
  }, [reservaId]);

  if (!reserva) return null;

  const isReadOnly = reserva.estado === 'completada' || reserva.estado === 'cancelada';
  
  // Cálculos financieros centralizados por item
  const totales = calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
  const subtotal = totales.subtotalNeto;
  const iva = totales.ivaTotal;
  const total = totales.total;
  const totalAbonado = pagos.reduce((acc, p) => acc + p.monto, 0);

  const fechaDisplay = new Date(reserva.fecha + 'T12:00').toLocaleDateString('es-ES', {
    dateStyle: 'full'
  });

  const handleRegistrarAbono = async () => {
    if (!reserva.comanda_id || !abonoInput || abonoInput <= 0) return;
    sileo.info({ title: 'Guardando pago', description: 'Publicando abono en la nube...' });
    await createRxPago({
      id: crypto.randomUUID(),
      comanda_id: reserva.comanda_id,
      monto: abonoInput as number,
      metodo_pago: abonoMetodo,
      fecha: new Date().toISOString(),
      tipo_division: 'monto_fijo',
      organization_id: localStorage.getItem('pos_active_org_id') || ''
    });
    setAbonoInput('');
    sileo.success({ title: 'Abono registrado', description: 'Guardado en la nube.' });
  };

  if (view === 'pagos') {
    return (
      <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Header Pagos */}
        <Box p="md" pb="xs" style={{ borderBottom: '1px solid var(--pos-border)' }}>
          <Group justify="space-between" align="center">
            <Group gap="md">
              <ActionIcon variant="light" size="xl" radius="xl" onClick={() => setView('detalles')}>
                <ArrowLeft size={22} weight="bold" />
              </ActionIcon>
              <Stack gap={0}>
                <Text fw={800} size="md" c="var(--pos-text)" style={{ lineHeight: 1 }}>Historial de Pagos</Text>
                <Text size="11px" c="dimmed" fw={700} mt={2} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Reserva de {reserva.nombre}
                </Text>
              </Stack>
            </Group>
          </Group>
        </Box>

        <ScrollArea flex={1} p="lg">
          <Stack gap="lg">
            {/* Total del pedido y restante */}
            {comandaItems.length > 0 && (() => {
              const restante = Math.max(0, total - totalAbonado);
              return (
                <UnstyledButton 
                  px="lg" py="md" w="100%"
                  onClick={() => setAbonoInput(parseFloat(restante.toFixed(2)))}
                    style={{
                      borderRadius: 12,
                      backgroundColor: 'var(--ui-primary-soft)',
                      border: '1px solid var(--ui-primary)',
                      transition: 'transform 0.1s ease',
                    }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <Group justify="space-between" align="center">
                    <Stack gap={2}>
                      <Text size="xs" fw={700} c="var(--ui-primary)" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {totalAbonado > 0 ? 'Restante por pagar' : 'Total del pedido'}
                      </Text>
                      <Text size="10px" c="dimmed" fw={500}>Subtotal ${subtotal.toFixed(2)} + IVA {ivaPorcentaje}%</Text>
                    </Stack>
                    <Text size="xl" fw={900} c="var(--ui-primary)">${restante.toFixed(2)}</Text>
                  </Group>
                </UnstyledButton>
              );
            })()}

            {/* Pagos anteriores */}
            {pagos.length > 0 && (
              <Box p="md" style={{ borderRadius: 12, border: '1px solid var(--pos-border)', backgroundColor: 'var(--pos-surface)' }}>
                <Text size="xs" fw={700} c="dimmed" mb="xs" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pagos Anteriores</Text>
                <Stack gap={8}>
                  {pagos.map(pago => (
                    <Group key={pago.id} justify="space-between">
                      <Stack gap={0}>
                        <Text size="sm" fw={700} style={{ textTransform: 'capitalize' }}>{pago.metodo_pago}</Text>
                        <Text size="xs" c="dimmed">{new Date(pago.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                      </Stack>
                      <Text size="sm" fw={800} c="green.7">+${pago.monto.toFixed(2)}</Text>
                    </Group>
                  ))}
                  <Divider my={4} />
                  <Group justify="space-between">
                    <Text size="md" fw={700}>Total Abonado</Text>
                    <Text size="lg" fw={900} c="green.7">${totalAbonado.toFixed(2)}</Text>
                  </Group>
                </Stack>
              </Box>
            )}

            {/* Registrar nuevo abono */}
            {!isReadOnly && (
              <Box>
                <Group gap="xs" mb={16}>
                  <HandCoins size={16} weight="bold" color="var(--ui-primary)" />
                  <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Registrar Nuevo Anticipo</Text>
                </Group>
                
                <NumberInput
                  size="xl"
                  radius="md"
                  mb="lg"
                  placeholder="0.00"
                  prefix="$ "
                  decimalScale={2}
                  fixedDecimalScale
                  value={abonoInput}
                  onChange={(val) => setAbonoInput(val === '' ? '' : Number(val))}
                  styles={{ input: { fontSize: 24, fontWeight: 900, textAlign: 'center', height: 70, backgroundColor: 'var(--pos-bg)' } }}
                />

                <Box style={{ opacity: (typeof abonoInput === 'number' && abonoInput > 0) ? 1 : 0.4, pointerEvents: (typeof abonoInput === 'number' && abonoInput > 0) ? 'auto' : 'none', transition: 'all 0.2s ease' }}>
                  <Text size="xs" fw={700} c="dimmed" mb="sm" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Método de pago
                  </Text>
                  <SimpleGrid cols={4} spacing="xs" mb="lg">
                    <PaymentMethodButton active={abonoMetodo === 'efectivo'} onClick={() => setAbonoMetodo('efectivo')} icon={Money} label="Efectivo" color="green" />
                    <PaymentMethodButton active={abonoMetodo === 'tarjeta'} onClick={() => setAbonoMetodo('tarjeta')} icon={CreditCard} label="Tarjeta" color="myColor" />
                    <PaymentMethodButton active={abonoMetodo === 'transferencia'} onClick={() => setAbonoMetodo('transferencia')} icon={Bank} label="Transfer" color="violet" />
                    <PaymentMethodButton active={abonoMetodo === 'otros'} onClick={() => setAbonoMetodo('otros')} icon={Calculator} label="Otros" color="gray" />
                  </SimpleGrid>

                  <Button radius="md" size="lg" h={54} color="var(--ui-primary)" fullWidth onClick={handleRegistrarAbono}
                    disabled={!abonoInput || (abonoInput as number) <= 0} style={{ fontWeight: 900 }}>
                    Añadir Pago
                  </Button>
                </Box>
              </Box>
            )}
          </Stack>
        </ScrollArea>
      </Box>
    );
  }

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header Detalles */}
      <Box p="md" pb={0}>
        <Group justify="space-between" align="center">
          <Group gap="md">
            <Box style={{
              width: 46, height: 46, borderRadius: 12,
              backgroundColor: STATUS_ICON_BG[reserva.estado as Reserva['estado']],
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <CalendarBlank size={22} weight="bold" color="white" />
            </Box>
            <Stack gap={0}>
              <Text fw={800} size="md" c="var(--pos-text)" style={{ lineHeight: 1.1 }}>
                {reserva.nombre}
              </Text>
              <Text size="11px" fw={700} c={STATUS_COLOR[reserva.estado as Reserva['estado']]} mt={4} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Reserva {STATUS_LABEL[reserva.estado as Reserva['estado']]}
              </Text>
            </Stack>
          </Group>
          <ActionIcon 
            variant="light" 
            color="gray" 
            onClick={onBack} 
            size="lg" 
            radius="xl"
            style={{ 
              backgroundColor: 'rgba(255,255,255,0.05)', 
              color: 'var(--pos-text-sub)' 
            }}
          >
            <X size={18} weight="bold" />
          </ActionIcon>
        </Group>

        <ClienteExpandableHeader
          clienteNombre={reserva.nombre}
          showEditButton
          onEdit={() => setEditClienteModal(true)}
          onChangeCliente={async (nuevoNombre) => {
            if (reserva) {
              await updateRxReserva(reserva.id, { nombre: nuevoNombre });
              sileo.success({
                title: 'Huésped cambiado',
                description: `La reserva ahora está a nombre de ${nuevoNombre}.`
              });
            }
          }}
        />
      </Box>

      <ScrollArea flex={1} p="lg">
        <Stack gap="lg">
          {reserva.estado === 'completada' && (
            <Paper
              withBorder
              p="sm"
              radius="md"
              style={{
                backgroundColor: 'var(--mantine-color-green-0)',
                borderColor: 'var(--mantine-color-green-2)',
              }}
            >
              <Group gap="xs" align="center" wrap="nowrap">
                <ThemeIcon color="green" radius="xl" size="md">
                  <CheckCircle size={14} weight="bold" />
                </ThemeIcon>
                <Stack gap={1}>
                  <Text size="xs" fw={800} c="var(--mantine-color-green-9)" style={{ lineHeight: 1.2 }}>
                    Asignada a Mesa {mesas.find(m => m.id === reserva.mesa_id)?.nombre || reserva.mesa_id || 'N/A'}
                  </Text>
                  <Text size="10px" c="var(--mantine-color-green-7)" fw={600} style={{ textTransform: 'capitalize' }}>
                    El {fechaDisplay} a las {reserva.hora} hs
                  </Text>
                </Stack>
              </Group>
            </Paper>
          )}

          {/* Info principal */}
          <Box>
            <Paper withBorder shadow="none" radius="md" py="xs" px="sm" style={{ backgroundColor: 'var(--pos-bg-light)', borderColor: 'var(--pos-border)' }}>
              <Stack gap="6px">
                {/* Fecha */}
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <CalendarBlank size={14} weight="bold" color="var(--ui-primary)" />
                    <Text size="xs" fw={600} c="dimmed">Fecha</Text>
                  </Group>
                  <Text size="xs" fw={700} style={{ textTransform: 'capitalize' }}>
                    {fechaDisplay}
                  </Text>
                </Group>

                <Divider color="var(--pos-border)" style={{ opacity: 0.4 }} />

                {/* Hora */}
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <Clock size={14} weight="bold" color="var(--ui-primary)" />
                    <Text size="xs" fw={600} c="dimmed">Hora</Text>
                  </Group>
                  <Badge color="myColor" variant="light" size="sm" radius="sm" style={{ fontSize: '11px', fontWeight: 800, height: 20 }}>
                    {reserva.hora}
                  </Badge>
                </Group>

                <Divider color="var(--pos-border)" style={{ opacity: 0.4 }} />

                {/* Personas */}
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <Users size={14} weight="bold" color="var(--ui-primary)" />
                    <Text size="xs" fw={600} c="dimmed">Personas</Text>
                  </Group>
                  <Text size="xs" fw={700}>
                    {reserva.personas} comensales
                  </Text>
                </Group>

                <Divider color="var(--pos-border)" style={{ opacity: 0.4 }} />

                {/* Zona */}
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <MapPin size={14} weight="bold" color="var(--ui-primary)" />
                    <Text size="xs" fw={600} c="dimmed">Zona</Text>
                  </Group>
                  <Text size="xs" fw={700} style={{ textTransform: 'capitalize' }}>
                    {zonas.find(z => z.id === reserva.zona_id)?.nombre || 'General'}
                  </Text>
                </Group>
              </Stack>
            </Paper>
          </Box>

          {/* Notas */}
          {reserva.nota && (
            <Box>
              <Group gap="xs" mb={8}>
                <Note size={16} weight="bold" color="var(--ui-primary)" />
                <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nota del cliente</Text>
              </Group>
              <Box p="md" style={{ borderRadius: 12, backgroundColor: 'var(--pos-bg)', border: '1px solid var(--pos-border)' }}>
                <Text size="sm" fw={500} c="var(--pos-text)" style={{ fontStyle: 'italic' }}>
                  "{reserva.nota}"
                </Text>
              </Box>
            </Box>
          )}

          {/* Pedido anticipado */}
          {comandaItems.length > 0 && (
            <Box>
              <Group gap="xs" mb={12}>
                <Receipt size={16} weight="bold" color="var(--ui-primary)" />
                <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pedido Anticipado</Text>
              </Group>
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
                        isReadOnly
                          ? undefined
                          : hasPaidQty
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
            </Box>
          )}
        </Stack>
      </ScrollArea>

      {/* Action Footer */}
      <Box
        p="lg"
        className="sidebar-details__footer"
        style={{ flexShrink: 0 }}
      >
        {!editingItem && !isReadOnly && reserva.comanda_id && (() => {
          const isSelectingProducts = reservaProductosComandaId === reserva.comanda_id;
          return (
            <Button
              variant="subtle"
              color="myColor"
              size="md"
              radius="xl"
              leftSection={isSelectingProducts ? <CheckCircle size={18} weight="bold" /> : <Basket size={18} />}
              onClick={isSelectingProducts ? () => setReservaProductosComandaId(null) : () => setReservaProductosComandaId(reserva.comanda_id)}
              onPointerDown={() => setIsAddPressed(true)}
              onPointerUp={() => setIsAddPressed(false)}
              onPointerCancel={() => setIsAddPressed(false)}
              onPointerLeave={() => setIsAddPressed(false)}
              className={`sidebar-details__add-button${isAddPressed ? ' sidebar-details__add-button--pressed' : ''}${comandaItems.length === 0 ? ' sidebar-details__add-button--pulse' : ''}`}
            >
              {isSelectingProducts ? 'Guardar' : 'Añadir'}
            </Button>
          );
        })()}

        <Stack gap="xs">
          {/* Totales del pedido */}
          {!editingItem && (comandaItems.length > 0 || totalAbonado > 0) && (
            <Stack gap="xs" mb="sm">
              <Group justify="space-between">
                <Text size="sm" c="dimmed" fw={600}>Subtotal</Text>
                <Text fw={700} size="sm" c="var(--pos-text)">${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed" fw={600}>IVA {ivaPorcentaje}%</Text>
                <Text fw={700} size="sm" c="var(--pos-text)">${iva.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
              </Group>

              {totalAbonado > 0 && (
                <UnstyledButton onClick={() => setView('pagos')} py={4} style={{ borderRadius: '4px', transition: 'background-color 0.2s' }} className="hover-bg-gray">
                  <Group justify="space-between">
                    <Text size="sm" c="green.8" fw={700} style={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}>PAGADO (ANTICIPOS)</Text>
                    <Text size="sm" fw={700} c="green.8">-${totalAbonado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                  </Group>
                </UnstyledButton>
              )}

              <Divider my={4} color="var(--pos-border)" />

              {totalAbonado > 0 ? (
                <Group justify="space-between" mt={4} p="md" style={{ backgroundColor: 'var(--mantine-color-orange-0)', borderRadius: '12px', border: '1px solid var(--mantine-color-orange-3)' }}>
                  <Stack gap={0}>
                    <Text size="xs" c="orange.9" fw={700} tt="uppercase">{totalAbonado > total ? 'SALDO A FAVOR' : 'PENDIENTE'}</Text>
                    <Text size="sm" c="dimmed" fw={500}>De un total de ${total.toFixed(2)}</Text>
                  </Stack>
                  <Text size="24px" fw={900} c={totalAbonado > total ? 'green.8' : 'orange.9'}>
                    ${Math.abs(total - totalAbonado).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </Group>
              ) : (
                <Group justify="space-between">
                  <Text size="md" fw={800} tt="uppercase" c="var(--pos-text)">Total</Text>
                  <Text size="24px" fw={900} c="var(--ui-primary)">${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                </Group>
              )}
            </Stack>
          )}

          <Stack gap="sm" mt="xs">
            {editingItem ? (
              <form onSubmit={editForm.onSubmit(handleUpdateItem)} style={{ width: '100%' }}>
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
                      onClick={() => editForm.setFieldValue('cantidad', Math.max(1, editForm.values.cantidad - 1))}
                      style={{ border: '1px solid var(--pos-border)' }}
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
                      onClick={() => editForm.setFieldValue('cantidad', editForm.values.cantidad + 1)}
                      style={{ border: '1px solid var(--pos-border)' }}
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
                <Group gap="sm" grow wrap="nowrap" mb="sm">
                  <Button 
                    variant="light" 
                    color="gray" 
                    size="lg" 
                    radius="md" 
                    onClick={handlePrint}
                    leftSection={<Printer size={18} />}
                    fw={800}
                  >
                    Ticket
                  </Button>
                  <Button 
                    variant="light" 
                    color="green" 
                    size="lg" 
                    radius="md" 
                    onClick={handleShareWhatsApp}
                    leftSection={<WhatsappLogo size={18} />}
                    fw={800}
                  >
                    WhatsApp
                  </Button>
                </Group>
                
                <Group grow gap="sm">
                  <Button 
                    variant="light" 
                    color="myColor" 
                    size="lg" 
                    radius="md" 
                    onClick={() => setView('pagos')} 
                    leftSection={<Money size={18} />}
                    fw={800}
                  >
                    Pagos
                  </Button>
                  {!isReadOnly && (
                    <Button 
                      variant="light" 
                      color="gray" 
                      size="lg" 
                      radius="md" 
                      onClick={() => setReservaView('nueva')} 
                      leftSection={<PencilSimple size={18} />}
                      fw={800}
                    >
                      Editar
                    </Button>
                  )}
                </Group>
            
                {!isReadOnly && (
                  <Group gap="sm" grow wrap="nowrap">
                    <Button
                      color="green"
                      size="lg"
                      radius="md"
                      onClick={() => openAssignModal(reserva.id)}
                      leftSection={<ArrowUpRight size={18} weight="bold" />}
                      fw={900}
                    >
                      Asignar Mesa
                    </Button>
                    <Button 
                      variant="subtle" 
                      color="red" 
                      size="lg" 
                      radius="md"
                      onClick={() => {
                        openConfirm(
                          'CANCELAR RESERVA',
                          '¿Estás seguro de que deseas cancelar esta reserva? Podrás verla más tarde en el historial de canceladas.',
                          async () => {
                            openPrompt({
                              title: 'Motivo de cancelación',
                              label: 'Escriba el motivo',
                              placeholder: 'Ej: cliente canceló, no llegó, etc.',
                              defaultValue: 'Reserva cancelada',
                              onConfirm: async (motivo) => {
                                await updateRxReserva(reserva.id, { estado: 'cancelada', nota: motivo });
                                sileo.success({ title: 'Reserva cancelada' });
                              }
                            });
                          }
                        );
                      }}
                      style={{ fontWeight: 800 }}
                    >
                      Anular
                    </Button>
                  </Group>
                )}

                {reserva.estado === 'cancelada' && (
                  <Button 
                    variant="light" 
                    color="red" 
                    size="lg" 
                    radius="md" 
                    fullWidth 
                    onClick={() => {
                      openConfirm(
                        'ELIMINAR RESERVA',
                        '¿Estás seguro de eliminar esta reserva permanentemente? Se borrarán sus datos y esta acción no se puede deshacer.',
                        async () => {
                          if (reserva.comanda_id) {
                            const rxDb = await initVerticalRxDb();
                            const pagosDocs = await rxDb.pagos.find({ selector: { comanda_id: reserva.comanda_id, _deleted: { $ne: true } } }).exec();
                            await Promise.all(pagosDocs.map(doc => doc.remove()));
                            const itemsDocs = await rxDb.comanda_items.find({ selector: { comanda_id: reserva.comanda_id, _deleted: { $ne: true } } }).exec();
                            await Promise.all(itemsDocs.map(doc => doc.remove()));
                            const comanda = await rxDb.comandas.findOne(reserva.comanda_id).exec();
                            if (comanda) {
                              await updateRxComanda(reserva.comanda_id, {
                                estado: 'anulada',
                                confirmada: true,
                              });
                            }
                          }
                          await updateRxReserva(reserva.id, { _deleted: true, nota: reserva.nota || 'Reserva eliminada' } as any);
                          onClose();
                        }
                      );
                    }}
                    fw={800}
                  >
                    Eliminar Reserva
                  </Button>
                )}
              </>
            )}
          </Stack>
        </Stack>
      </Box>

      <ClienteFormModal
        opened={editClienteModal}
        onClose={() => setEditClienteModal(false)}
        editingCliente={clientes.find(c => c.nombre === reserva.nombre) || null}
        initialNombre={reserva.nombre}
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

      {reserva && (
        <ReservaWhatsAppCard
          ref={whatsappCardRef}
          reserva={reserva}
          zonaNombre={zonas.find(z => z.id === reserva.zona_id)?.nombre || ''}
          comandaItems={comandaItems}
          totalMonto={calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva).total}
        />
      )}

      <TicketPreviewModal
        opened={previewOpened}
        onClose={() => setPreviewOpened(false)}
        title={previewTitle}
        content={previewContent}
      />
    </Box>
  );
}
