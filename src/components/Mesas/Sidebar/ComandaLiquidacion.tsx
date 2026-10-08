import type { LiquidacionComanda } from '../../../lib/anticipoMesa';

const money = (n: number) => `$${n.toFixed(2)}`;

// Cómo se pagó una cuenta cerrada con anticipo de la mesa: lo que consumió, lo
// que cubrió el anticipo y lo que quedó por anclar en Centro de Ventas.
export function ComandaLiquidacion({ liquidacion }: { liquidacion: LiquidacionComanda }) {
  const { consumo, anticipoAplicado, porCobrar } = liquidacion;
  return (
    <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-muted/60 text-sm font-semibold text-muted-foreground">
      <div className="flex items-center justify-between">
        <span>Cuenta</span>
        <span className="font-bold text-foreground">{money(consumo)}</span>
      </div>
      {anticipoAplicado > 0.005 && (
        <div className="flex items-center justify-between text-info-foreground">
          <span>Pagado con anticipo</span>
          <span className="font-bold">−{money(anticipoAplicado)}</span>
        </div>
      )}
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
        <span className="text-base font-black text-foreground">
          Por cobrar
        </span>
        <span className="text-xl font-black text-foreground">{money(porCobrar)}</span>
      </div>
      <p className="text-[11px] font-medium leading-snug">
        {porCobrar > 0.005
          ? 'Se ancla como pago en Centro de Ventas.'
          : 'Cubierta completa por el anticipo: no hay nada que cobrar.'}
      </p>
    </div>
  );
}
