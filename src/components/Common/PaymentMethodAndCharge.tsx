import { Box, Select, SimpleGrid, Text, TextInput } from '@mantine/core';
import { Bank, Calculator, CreditCard, Money } from '@phosphor-icons/react';
import { PaymentMethodButton } from '../Mesas/Sidebar/SidebarCheckout';
import type { PaymentMethod, PaymentSettings } from '../../lib/paymentSettings';

interface PaymentMethodAndChargeProps {
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  onMethodDoubleClick?: (method: PaymentMethod) => void;
  settings: PaymentSettings;
  selectedCardNetwork?: string | null;
  onCardNetworkChange?: (value: string | null) => void;
  selectedTransferBank?: string | null;
  onTransferBankChange?: (value: string | null) => void;
  transferReference?: string;
  onTransferReferenceChange?: (value: string) => void;
}

export function PaymentMethodAndCharge({
  method,
  onMethodChange,
  onMethodDoubleClick,
  settings,
  selectedCardNetwork = null,
  onCardNetworkChange,
  selectedTransferBank = null,
  onTransferBankChange,
  transferReference = '',
  onTransferReferenceChange,
}: PaymentMethodAndChargeProps) {
  const methods: Array<{ key: PaymentMethod; label: string; color: string; enabled: boolean; icon: any }> = [
    { key: 'efectivo', label: 'Efectivo', color: 'green', enabled: settings.efectivoEnabled, icon: Money },
    { key: 'tarjeta', label: 'Tarjeta', color: 'blue', enabled: settings.tarjetaEnabled, icon: CreditCard },
    { key: 'transferencia', label: 'Transfer', color: 'violet', enabled: settings.transferenciaEnabled, icon: Bank },
    { key: 'otros', label: 'Otros', color: 'gray', enabled: settings.otrosEnabled, icon: Calculator },
  ];

  const enabled = methods.filter(m => m.enabled);

  return (
    <Box>
      <Text fw={700} size="sm" mb="md" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Metodo de Pago</Text>
      <SimpleGrid cols={Math.max(1, enabled.length)} spacing="sm">
        {enabled.map(m => (
          <PaymentMethodButton
            key={m.key}
            active={method === m.key}
            onClick={() => onMethodChange(m.key)}
            onDoubleClick={() => onMethodDoubleClick?.(m.key)}
            icon={m.icon}
            label={m.label}
            color={m.color}
          />
        ))}
      </SimpleGrid>

      {method === 'tarjeta' && settings.cardNetworks.length > 0 && (
        <Select
          mt="sm"
          label="Red de cobro"
          placeholder="Selecciona red"
          data={settings.cardNetworks}
          value={selectedCardNetwork}
          onChange={onCardNetworkChange}
          searchable
        />
      )}

      {method === 'transferencia' && (
        <Box mt="sm">
          {settings.transferBanks.length > 0 ? (
            <Select
              mb={6}
              label="Cuenta / Banco"
              placeholder="Selecciona banco"
              data={settings.transferBanks}
              value={selectedTransferBank}
              onChange={onTransferBankChange}
              searchable
            />
          ) : null}
          {settings.requireTransferReference && (
            <TextInput
              label="Numero de transferencia"
              placeholder="Ingresa referencia"
              value={transferReference}
              onChange={(e) => onTransferReferenceChange?.(e.currentTarget.value)}
            />
          )}
        </Box>
      )}

    </Box>
  );
}
