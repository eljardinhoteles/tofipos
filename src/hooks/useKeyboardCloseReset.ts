import { useEffect, useState } from 'react';

// Bug de móvil (iOS sobre todo): al abrir el teclado, vaul sube el sheet con
// `style.bottom`/`style.height` en línea y iOS puede desplazar la página para
// mostrar el input. Al cerrar el teclado, vaul solo lo restablece si el evento
// `visualViewport.resize` llega en el orden exacto que espera; si no, el sheet
// y la vista se quedan "pegados a la mitad" aunque el teclado ya no esté.
//
// Este hook detecta que el teclado se cerró (se perdió el foco de un campo de
// texto o el viewport volvió a su alto completo) y restablece el scroll de la
// página y los estilos en línea del sheet. Solo actúa en móvil.
export function useKeyboardCloseReset(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;

    const isEditable = (el: Element | null) =>
      !!el &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || (el as HTMLElement).isContentEditable);

    const reset = () => {
      // Teclado todavía abierto: hay un campo enfocado o el viewport sigue reducido.
      if (isEditable(document.activeElement)) return;
      if (vv && window.innerHeight - vv.height > 80) return;

      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      document.querySelectorAll<HTMLElement>('[data-vaul-drawer]').forEach((el) => {
        if (el.style.height) el.style.height = '';
        if (el.style.bottom) el.style.bottom = '';
      });
    };

    // iOS anima el cierre del teclado y a veces dispara los eventos antes de
    // terminar: se revisa dos veces (al poco y cuando ya terminó).
    const timers: number[] = [];
    const schedule = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
      timers.push(window.setTimeout(reset, 150), window.setTimeout(reset, 500));
    };

    document.addEventListener('focusout', schedule);
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
    return () => {
      document.removeEventListener('focusout', schedule);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [enabled]);
}

// vaul reacciona a CUALQUIER campo enfocado, aunque no esté dentro del sheet:
// al abrir un diálogo (p. ej. "Cambiar cliente") y escribir, el teclado hace
// que vaul encoja el sheet que hay detrás, y al cerrarse el diálogo ese
// encogimiento puede quedarse pegado. Este hook avisa si hay un diálogo de
// Radix abierto (distinto del propio sheet) para desactivar `repositionInputs`
// del sheet mientras tanto.
export function useOtherDialogOpen(enabled: boolean) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const hayDialogo = !!document.querySelector(
        '[role="dialog"]:not([data-vaul-drawer]), [role="alertdialog"]'
      );
      setOpen(prev => (prev === hayDialogo ? prev : hayDialogo));
    };
    check();
    // Los diálogos de Radix se montan como hijos directos de <body> (portal).
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [enabled]);

  return open;
}
