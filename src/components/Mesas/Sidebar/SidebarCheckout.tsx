// @ts-nocheck
import { useEffect, useState, useMemo } from 'react';
import {
  Box, Stack, Group, Text, Title, Button, ActionIcon,
  ScrollArea, Divider, Paper, TextInput,
  ThemeIcon, UnstyledButton
} from '@mantine/core';
import {
  X,
  Printer, ArrowLeft, Door
} from '@phosphor-icons/react';
import type { Mesa } from '../../../db/database';
import { sileo } from 'sileo';
import { SidebarEnviarHabitacion } from './SidebarEnviarHabitacion';
import { PaymentMethodAndCharge } from '../../Common/PaymentMethodAndCharge';
import { getPaymentSettings, type PaymentMethod } from '../../../lib/paymentSettings';

import { useIvaActivo } from '../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from '../../../lib/taxUtils';
import { generarPrecuenta, generarTicketPago } from '../../../services/printTemplateEngine';
import { TicketPreviewModal } from '../../Common/TicketPreviewModal';
import { initVerticalRxDb, createRxPago, updateRxComanda, updateRxMesa } from '../../../db/rxdb';
import { useRxMenuCatalog } from '../../../hooks/useRxMenuCatalog';

interface SidebarCheckoutProps {
  selectedMesa: Mesa;
  activeComanda: any;
  comandaItems: any[];
  onBack: () => void;
  onSuccess: () => void;
  initialType?: 'directo' | 'dividido';
  startInEnviarHabitacion?: boolean;
}

export function SidebarCheckout({ selectedMesa, activeComanda, comandaItems, onBack, onSuccess, startInEnviarHabitacion = false }: SidebarCheckoutProps) {
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [lineAmount, setLineAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showEnviarHabitacion, setShowEnviarHabitacion] = useState(startInEnviarHabitacion);
  const [cardNetwork, setCardNetwork] = useState<string | null>(null);
  const [transferBank, setTransferBank] = useState<string | null>(null);
  const [transferReference, setTransferReference] = useState('');
  const [paymentLines, setPaymentLines] = useState<Array<{
    id: string;
    method: PaymentMethod;
    amount: number;
    cardNetwork?: string | null;
    transferBank?: string | null;
    transferReference?: string;
  }>>([]);
  const [previewOpened, setPreviewOpened] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [onCloseCallback, setOnCloseCallback] = useState<(() => void) | null>(null);
  const paymentSettings = getPaymentSettings();

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const { menuItems } = useRxMenuCatalog();
  const [cuentasActivas, setCuentasActivas] = useState(0);
  const [pagos, setPagos] = useState<any[]>([]);
  const [habitacionNombre, setHabitacionNombre] = useState<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const activeCount = await rxDb.habitacion_cuentas.find({
        selector: { estado: 'activa', _deleted: false }
      }).exec();
      if (alive) setCuentasActivas(activeCount.length);

      if (activeComanda?.habitacion_cuenta_id) {
        const hc = await rxDb.habitacion_cuentas.findOne(activeComanda.habitacion_cuenta_id).exec();
        if (!alive || !hc) return;
        const mesa = await rxDb.mesas.findOne(hc.toJSON().mesa_id).exec();
        if (alive) setHabitacionNombre(mesa ? mesa.toJSON().nombre : undefined);
      }
    };
    run().catch(console.error);
    return () => { alive = false; };
  }, [activeComanda?.habitacion_cuenta_id]);

  useEffect(() => {
    if (!activeComanda?.id) {
      setPagos([]);
      return;
    }
    let alive = true;
    let unsub: (() => void) | null = null;
    const run = async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const query = rxDb.pagos.find({ selector: { comanda_id: activeComanda.id, _deleted: false } });
      const docs = await query.exec();
      if (!alive) return;
      setPagos(docs.map((doc: any) => doc.toJSON()));
      unsub = query.$.subscribe((docs: any[]) => {
        setPagos(docs.map((doc: any) => doc.toJSON()));
      }) as any;
    };
    run().catch(console.error);
    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, [activeComanda?.id]);

  const totales = useMemo(() => {
    return calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);
  }, [comandaItems, menuItems, ivaPorcentaje, preciosConIva]);


  const total = totales.total;
  const totalPagado = useMemo(() => pagos.reduce((acc, p) => acc + p.monto, 0), [pagos]);
  const saldoPendiente = Math.max(0, total - totalPagado);

  const totalLineas = useMemo(() => round2(paymentLines.reduce((acc, l) => acc + l.amount, 0)), [paymentLines]);
  const restante = round2(Math.max(0, saldoPendiente - totalLineas));

  const canAddLine = useMemo(() => {
    const amount = parseFloat(lineAmount) || 0;
    if (amount <= 0) return false;
    if (amount > restante + 0.001) return false;
    if (paymentMethod === 'tarjeta' && paymentSettings.cardNetworks.length > 0 && !cardNetwork) return false;
    if (paymentMethod === 'transferencia') {
      if (paymentSettings.transferBanks.length > 0 && !transferBank) return false;
      if (paymentSettings.requireTransferReference && !transferReference.trim()) return false;
    }
    return true;
  }, [lineAmount, restante, paymentMethod, paymentSettings, cardNetwork, transferBank, transferReference]);

  const canFinalize = restante <= 0.001 && paymentLines.length > 0;

  const addPaymentLine = () => {
    if (!canAddLine) return;
    const amount = round2(parseFloat(lineAmount) || 0);
    setPaymentLines(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        method: paymentMethod,
        amount,
        cardNetwork,
        transferBank,
        transferReference: transferReference.trim(),
      }
    ]);
    setLineAmount('');
    setCardNetwork(null);
    setTransferBank(null);
    setTransferReference('');
    setPaymentMethod('efectivo');
  };

  const handleFinalize = async () => {
    if (!activeComanda) return;
    setIsProcessing(true);
    try {
      const newPagos: any[] = [];
      for (const line of paymentLines) {
        const pObj = {
          id: crypto.randomUUID(),
          comanda_id: activeComanda.id,
          monto: line.amount,
          metodo_pago: line.method,
          fecha: new Date().toISOString(),
          organization_id: localStorage.getItem('pos_active_org_id') || ''
        };
        await createRxPago(pObj as any);
        newPagos.push(pObj);
      }

      // Cerrar comanda y mesa
      await updateRxComanda(activeComanda.id, { 
        estado: 'cerrado',
        mesa_nombre: activeComanda.mesa_nombre || selectedMesa.nombre,
      });
      await updateRxMesa(selectedMesa.id, { estado: 'libre' });

      sileo.success({ 
        title: 'Venta Finalizada',
        description: `La mesa ${selectedMesa.nombre} ha sido cobrada exitosamente.`
      });

      const content = generarTicketPago(
        activeComanda,
        comandaItems,
        [...pagos, ...newPagos],
        selectedMesa.nombre,
        ivaPorcentaje,
        undefined,
        habitacionNombre
      );
      setPreviewContent(content);
      setPreviewTitle(`Recibo de Pago - ${selectedMesa.nombre}`);
      setOnCloseCallback(() => () => onSuccess());
      setPreviewOpened(true);

    } catch (error) {
      sileo.error({ title: 'Error al procesar el cobro' });
      setIsProcessing(false);
    }
  };

  const handleShowPrecuentaPreview = () => {
    if (!activeComanda) return;
    const content = generarPrecuenta(
      activeComanda,
      comandaItems,
      selectedMesa.nombre,
      ivaPorcentaje,
      pagos,
      habitacionNombre
    );
    setPreviewContent(content);
    setPreviewTitle(`Precuenta - ${selectedMesa.nombre}`);
    setOnCloseCallback(null);
    setPreviewOpened(true);
  };

  if (showEnviarHabitacion && activeComanda) {
    return (
      <SidebarEnviarHabitacion
        activeComanda={activeComanda}
        onBack={() => {
          if (startInEnviarHabitacion) {
            onBack();
            return;
          }
          setShowEnviarHabitacion(false);
        }}
        onSuccess={onSuccess}
      />
    );
  }



  return (
    <Box h="100%" className="checkout-sidebar">
      {/* Header */}
      <Box p="lg" className="checkout-sidebar__header">
        <Group justify="space-between">
          <Group gap="sm">
            <ActionIcon variant="subtle" color="gray" onClick={onBack}>
              <ArrowLeft size={20} />
            </ActionIcon>
            <Stack gap={0}>
              <Title order={4} fw={900}>
                Pago Total
              </Title>
              <Text size="xs" c="dimmed">
                {selectedMesa.nombre.replace('Mesa ', 'Mesa #')} - Cuenta #{activeComanda?.folio} {activeComanda?.cliente ? `- ${activeComanda.cliente}` : ''}
              </Text>
            </Stack>
          </Group>
          <ActionIcon
            variant="light"
            color="blue"
            size="lg"
            radius="md"
            onClick={handleShowPrecuentaPreview}
            title="Previsualizar Precuenta"
          >
            <Printer size={18} />
          </ActionIcon>
        </Group>
      </Box>

      <ScrollArea flex={1} p="lg">
        <Stack gap="xl">
          {/* Métodos de Pago */}
          <PaymentMethodAndCharge
            method={paymentMethod}
            onMethodChange={setPaymentMethod}
            onMethodDoubleClick={(method) => {
              setPaymentMethod(method);
              if (method === 'tarjeta' && !cardNetwork && paymentSettings.cardNetworks.length > 0) {
                setCardNetwork(paymentSettings.cardNetworks[0]);
              }
              if (method === 'transferencia') {
                if (!transferBank && paymentSettings.transferBanks.length > 0) {
                  setTransferBank(paymentSettings.transferBanks[0]);
                }
                if (paymentSettings.requireTransferReference && !transferReference.trim()) {
                  setTransferReference('AUTO');
                }
              }
              if (restante > 0) {
                setLineAmount(restante.toFixed(2));
              }
            }}
            settings={paymentSettings}
            selectedCardNetwork={cardNetwork}
            onCardNetworkChange={setCardNetwork}
            selectedTransferBank={transferBank}
            onTransferBankChange={setTransferBank}
            transferReference={transferReference}
            onTransferReferenceChange={setTransferReference}
          />

          <Divider variant="dashed" />

          <Stack gap="sm">
            <TextInput
              label="Monto de esta linea"
              placeholder="0.00"
              type="number"
              value={lineAmount}
              onChange={(e) => setLineAmount(e.target.value)}
            />
            <Button variant="light" onClick={addPaymentLine} disabled={!canAddLine}>
              Agregar Pago
            </Button>
          </Stack>

          {paymentLines.length > 0 && (
            <Paper p="sm" withBorder radius="md" shadow="none">
              <Stack gap={6}>
                {paymentLines.map((line) => (
                  <Group key={line.id} justify="space-between">
                    <Text size="sm" tt="capitalize">
                      {line.method}
                      {line.cardNetwork ? ` - ${line.cardNetwork}` : ''}
                      {line.transferBank ? ` - ${line.transferBank}` : ''}
                    </Text>
                    <Group gap="xs">
                      <Text size="sm" fw={800}>${line.amount.toFixed(2)}</Text>
                      <ActionIcon color="red" variant="subtle" onClick={() => setPaymentLines(prev => prev.filter(p => p.id !== line.id))}>
                        <X size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Resumen Simple */}
          <Box p="md" className="checkout-sidebar__summary">
            <Stack gap={4}>
              <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" fw={700} tt="uppercase">Total de la cuenta</Text>
                <Text fw={900} c="myColor.9" className="checkout-sidebar__summary-total">
                  ${total.toFixed(2)}
                </Text>
              </Group>
              {totalPagado > 0 && (
                <Group justify="space-between"><Text size="xs" c="green.8" fw={600}>Pagado</Text><Text size="xs" fw={700} c="green.8">-${totalPagado.toFixed(2)}</Text></Group>
              )}
              <Divider my={4} />
              <Group justify="space-between"><Text fw={800} size="sm">APLICADO</Text><Text fw={900} size="sm" c="green">${totalLineas.toFixed(2)}</Text></Group>
              <Group justify="space-between"><Text fw={800} size="sm">RESTANTE</Text><Text fw={900} size="lg" c="myColor">${restante.toFixed(2)}</Text></Group>
            </Stack>
          </Box>
        </Stack>
      </ScrollArea>

      {/* Acciones Footer */}
      <Box p="lg" className="checkout-sidebar__footer">
        <Stack gap="sm">
          <Button
            size="xl"
            radius="md"
            fullWidth
            color="green"
            leftSection={<Printer size={24} />}
            disabled={!canFinalize}
            loading={isProcessing}
            onClick={handleFinalize}
            h={70}
            className="checkout-sidebar__finalize-btn"
          >
            Finalizar y Cobrar
          </Button>
          {cuentasActivas > 0 && (
            <Button
              size="lg"
              radius="md"
              fullWidth
              variant="light"
              color="myColor"
              leftSection={<Door size={20} />}
              onClick={() => setShowEnviarHabitacion(true)}
              fw={800}
            >
              Enviar a Habitación
            </Button>
          )}
        </Stack>
      </Box>

      <TicketPreviewModal
        opened={previewOpened}
        onClose={() => {
          setPreviewOpened(false);
          if (onCloseCallback) {
            onCloseCallback();
          }
        }}
        title={previewTitle}
        content={previewContent}
      />
    </Box>
  );
}

export function PaymentMethodButton({ active, onClick, onDoubleClick, icon: Icon, label, color }: any) {
  return (
    <UnstyledButton 
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      p="md"
      className={`payment-method-btn payment-method-btn--${color}${active ? ' payment-method-btn--active' : ''}`}
    >
      <ThemeIcon size={40} radius="xl" color={color} variant={active ? "filled" : "light"}>
        <Icon size={20} weight={active ? "bold" : "regular"} />
      </ThemeIcon>
      <Text fw={800} size="xs" c={active ? `var(--mantine-color-${color}-9)` : 'var(--pos-text)'}>{label}</Text>
    </UnstyledButton>
  );
}
