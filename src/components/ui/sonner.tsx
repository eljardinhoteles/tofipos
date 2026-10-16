import * as React from "react"
import { Toaster as Sonner } from "sonner"
import { CheckCircle, XCircle, Warning, Info, CircleNotch } from "@phosphor-icons/react"
import { useIsMobile } from "@/hooks/useIsMobile"

type ToasterProps = React.ComponentProps<typeof Sonner>

// Aviso con la misma línea que el resto del UI kit: una superficie más (como el popover y el menú del Select: bg-popover, borde
// border, rounded-2xl, shadow-xl), tipografía por roles (título t-cuerpo-fuerte, detalle t-meta), botón de acción como un Button
// primario pequeño y todo con clases y tokens, sin estilos en línea. Solo el icono lleva el color del tipo. Las reglas de contenido
// (qué tipo usar, cómo escribirlos) están en lib/toast.ts.
const Toaster = ({ ...props }: ToasterProps) => {
  const isMobile = useIsMobile()

  // En móvil los toast se sentían intrusivos (tapaban el header del sheet y
  // duraban mucho): aquí salen de a uno.
  const mobileProps: Partial<ToasterProps> = isMobile
    ? {
        visibleToasts: 1,
        mobileOffset: { top: "calc(env(safe-area-inset-top) + 6px)", left: 12, right: 12 },
      }
    : {}

  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CheckCircle size={20} weight="fill" className="text-success-foreground" />,
        error: <XCircle size={20} weight="fill" className="text-destructive" />,
        warning: <Warning size={20} weight="fill" className="text-warning-foreground" />,
        info: <Info size={20} weight="fill" className="text-info-foreground" />,
        loading: <CircleNotch size={20} weight="bold" className="animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "w-full sm:w-[360px] max-w-[calc(100vw-24px)] flex items-center gap-3 rounded-2xl border border-border bg-popover text-popover-foreground px-4 py-3 shadow-xl",
          icon: "shrink-0 flex items-center",
          content: "flex flex-col gap-0.5 min-w-0 flex-1",
          title: "t-cuerpo-fuerte leading-tight",
          description: "t-meta text-muted-foreground leading-snug",
          actionButton: "shrink-0 rounded-2xl bg-primary px-3 py-1.5 t-dato text-primary-foreground cursor-pointer",
          cancelButton: "shrink-0 rounded-2xl bg-muted px-3 py-1.5 t-dato text-muted-foreground cursor-pointer",
        },
      }}
      {...mobileProps}
      {...props}
    />
  )
}

export { Toaster }
