import { useRef } from 'react';
import { showToast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const TAPS_PARA_LLUVIA = 5;
const VENTANA_MS = 1600;

const MENSAJES = [
  '¡Guac! 🥑',
  'Hecho con amor (y aguacate) en la Amazonía',
  'Un aguacate al día mantiene el hambre en vigilancia',
  '¡Este POS es palta-bulosa! 🥑',
];

const reducirMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Lluvia de aguacates sobre toda la pantalla; se limpia sola.
function lluviaDeAguacates() {
  const capa = document.createElement('div');
  capa.setAttribute('aria-hidden', 'true');
  capa.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden';
  document.body.appendChild(capa);

  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  const total = Math.min(40, Math.round(ancho / 28));
  for (let i = 0; i < total; i++) {
    const el = document.createElement('span');
    el.textContent = '🥑';
    const tam = 22 + Math.random() * 28;
    el.style.cssText = `position:absolute;top:0;left:${Math.random() * ancho}px;font-size:${tam}px;will-change:transform`;
    capa.appendChild(el);
    const deriva = (Math.random() - 0.5) * 160;
    const giro = (Math.random() - 0.5) * 720;
    el.animate(
      [
        { transform: `translate(0, -60px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${deriva}px, ${alto + 80}px) rotate(${giro}deg)`, opacity: 1 },
      ],
      { duration: 1800 + Math.random() * 1600, delay: Math.random() * 900, easing: 'cubic-bezier(0.3, 0.1, 0.6, 1)', fill: 'forwards' }
    );
  }
  setTimeout(() => capa.remove(), 4800);
}

interface AguacateEggProps {
  className?: string;
  alt?: string;
}

// Icono de la app con sorpresa: cada toque lo hace saltar y girar; cinco toques
// seguidos desatan una lluvia de aguacates.
export function AguacateEgg({ className, alt = '' }: AguacateEggProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const taps = useRef<number[]>([]);

  const alTocar = () => {
    const ahora = Date.now();
    taps.current = [...taps.current.filter(t => ahora - t < VENTANA_MS), ahora];

    if (!reducirMovimiento()) {
      imgRef.current?.animate(
        [
          { transform: 'translateY(0) rotate(0deg) scale(1)' },
          { transform: 'translateY(-8px) rotate(180deg) scale(1.2)', offset: 0.45 },
          { transform: 'translateY(0) rotate(360deg) scale(1)' },
        ],
        { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
    }

    if (taps.current.length >= TAPS_PARA_LLUVIA) {
      taps.current = [];
      if (!reducirMovimiento()) lluviaDeAguacates();
      showToast.success(MENSAJES[Math.floor(Math.random() * MENSAJES.length)]);
    }
  };

  return (
    <button type="button" onClick={alTocar} aria-label="Aguacate" tabIndex={-1}
      className="shrink-0 cursor-pointer select-none active:scale-95 transition-transform">
      <img ref={imgRef} src="/Icon-app.webp" alt={alt} draggable={false} className={cn('object-contain', className)} />
    </button>
  );
}
