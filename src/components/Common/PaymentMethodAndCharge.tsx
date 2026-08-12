import { Bank, Calculator, CreditCard, Money } from'@phosphor-icons/react';
import type { PaymentMethod, PaymentSettings } from'../../lib/paymentSettings';
import { Input } from'@/components/ui/input';
import { Label } from'@/components/ui/label';

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
 /**
  * false = solo el selector de método (efectivo/tarjeta/transferencia/otros),
  * sin pedir red/banco/referencia. Usado en el checkout de Mesas: ese
  * detalle se completa después, al anclar el cobro en Centro de Ventas, para
  * no interrumpir el flujo de "cobrar y cerrar" con campos extra.
  */
 showDetails?: boolean;
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
 transferReference ='',
 onTransferReferenceChange,
 showDetails = true,
}: PaymentMethodAndChargeProps) {
 const methods: Array<{ key: PaymentMethod; label: string; enabled: boolean; icon: any }> = [
 { key:'efectivo', label:'Efectivo', enabled: settings.efectivoEnabled, icon: Money },
 { key:'tarjeta', label:'Tarjeta', enabled: settings.tarjetaEnabled, icon: CreditCard },
 { key:'transferencia', label:'Transfer', enabled: settings.transferenciaEnabled, icon: Bank },
 { key:'otros', label:'Otros', enabled: settings.otrosEnabled, icon: Calculator },
 ];

 const enabled = methods.filter(m => m.enabled);

 return (
 <div className="flex flex-col gap-3">
 <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Método de Pago</span>
 <div className="grid grid-cols-2 gap-2">
 {enabled.map(m => {
 const Icon = m.icon;
 const active = method === m.key;
 return (
 <button
 key={m.key}
 type="button"onClick={() => onMethodChange(m.key)}
 onDoubleClick={() => onMethodDoubleClick?.(m.key)}
 className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
 active
 ?'bg-primary border-primary text-primary-foreground shadow-xs':'bg-muted border-border text-foreground'}`}
 >
 <Icon size={16} /> {m.label}
 </button>
 );
 })}
 </div>

 {showDetails && method ==='tarjeta'&& settings.cardNetworks.length > 0 && (
 <div className="flex flex-col gap-1">
 <label className="text-xs font-bold text-foreground">Red de cobro</label>
 <select
 value={selectedCardNetwork ||''}
 onChange={(e) => onCardNetworkChange?.(e.target.value || null)}
 className="h-10 px-3 text-xs bg-muted border border-border rounded-xl font-semibold">
 <option value="">Selecciona red</option>
 {settings.cardNetworks.map((net) => (
 <option key={net} value={net}>{net}</option>
 ))}
 </select>
 </div>
 )}

 {showDetails && method ==='transferencia'&& (
 <div className="flex flex-col gap-2">
 {settings.transferBanks.length > 0 && (
 <div className="flex flex-col gap-1">
 <label className="text-xs font-bold text-foreground">Cuenta / Banco</label>
 <select
 value={selectedTransferBank ||''}
 onChange={(e) => onTransferBankChange?.(e.target.value || null)}
 className="h-10 px-3 text-xs bg-muted border border-border rounded-xl font-semibold">
 <option value="">Selecciona banco</option>
 {settings.transferBanks.map((banco) => (
 <option key={banco} value={banco}>{banco}</option>
 ))}
 </select>
 </div>
 )}
 {settings.requireTransferReference && (
 <div className="flex flex-col gap-1">
 <Label className="text-xs font-bold">Número de transferencia</Label>
 <Input
 type="text"placeholder="Ingresa referencia"value={transferReference}
 onChange={(e) => onTransferReferenceChange?.(e.target.value)}
 className="h-9 text-xs font-semibold"/>
 </div>
 )}
 </div>
 )}
 </div>
 );
}
