export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'otros';

export interface PaymentSettings {
  efectivoEnabled: boolean;
  tarjetaEnabled: boolean;
  transferenciaEnabled: boolean;
  otrosEnabled: boolean;
  cardNetworks: string[];
  transferBanks: string[];
  requireTransferReference: boolean;
}

export const defaultPaymentSettings: PaymentSettings = {
  efectivoEnabled: true,
  tarjetaEnabled: true,
  transferenciaEnabled: true,
  otrosEnabled: true,
  cardNetworks: ['Visa', 'Mastercard'],
  transferBanks: [],
  requireTransferReference: true,
};

const PAYMENT_SETTINGS_KEY = 'pos.payment.settings.v1';

export function getPaymentSettings(): PaymentSettings {
  try {
    const raw = localStorage.getItem(PAYMENT_SETTINGS_KEY);
    if (!raw) return defaultPaymentSettings;
    const parsed = JSON.parse(raw) as Partial<PaymentSettings>;
    return { ...defaultPaymentSettings, ...parsed };
  } catch {
    return defaultPaymentSettings;
  }
}

export function savePaymentSettings(settings: PaymentSettings) {
  localStorage.setItem(PAYMENT_SETTINGS_KEY, JSON.stringify(settings));
}
