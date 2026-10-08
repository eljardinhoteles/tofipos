import * as React from "react"
import { Toaster as Sonner } from "sonner"
import { CheckCircle, XCircle, Warning, Info, CircleNotch } from "@phosphor-icons/react"
import { useIsMobile } from "@/hooks/useIsMobile"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const isMobile = useIsMobile()

  // En móvil los toast se sentían intrusivos (tapaban el header del sheet y
  // duraban mucho): aquí salen más compactos, de a uno, y se van rápido.
  const mobileProps: Partial<ToasterProps> = isMobile
    ? {
        visibleToasts: 1,
        duration: 2200,
        mobileOffset: { top: "calc(env(safe-area-inset-top) + 6px)", left: 12, right: 12 },
      }
    : {}

  return (
    <Sonner
      className="toaster group"
      // Sin estilos por defecto de sonner: la apariencia sale solo de los tokens
      // semánticos (fondo suave + texto del estado), sin borde y con sombra suave,
      // igual que los badges y avisos del resto de la app.
      icons={{
        success: <CheckCircle size={20} weight="fill" />,
        error: <XCircle size={20} weight="fill" />,
        warning: <Warning size={20} weight="fill" />,
        info: <Info size={20} weight="fill" />,
        loading: <CircleNotch size={20} weight="bold" className="animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: isMobile
            ? "w-full flex items-center gap-2.5 rounded-full px-4 py-2.5 text-[13px] shadow-md"
            : "w-[356px] max-w-[calc(100vw-24px)] flex items-center gap-3 rounded-2xl px-4 py-3.5 shadow-lg",
          // sonner aplica `default` a TODOS los toast además de la clase de su tipo:
          // los tipos van con `!` para que siempre ganen sobre fondo/texto base.
          default: "bg-card text-foreground",
          loading: "bg-card! text-foreground!",
          success: "bg-success-soft! text-success-foreground!",
          error: "bg-destructive-soft! text-destructive!",
          warning: "bg-warning-soft! text-warning-foreground!",
          info: "bg-info-soft! text-info-foreground!",
          icon: "shrink-0 flex items-center",
          content: "flex flex-col gap-0.5 min-w-0 flex-1",
          title: isMobile ? "text-[13px] font-bold leading-tight" : "text-sm font-bold leading-tight",
          // La descripción es la info relevante (p. ej. qué mesa); en móvil se
          // recorta a una línea para no alargar el toast. Va en neutro para que
          // se lea bien sobre cualquier fondo suave.
          description: isMobile
            ? "text-xs font-medium text-foreground/70 leading-snug line-clamp-1"
            : "text-xs font-medium text-foreground/70 leading-snug",
          actionButton: "shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground",
          cancelButton: "shrink-0 rounded-lg bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground",
        },
      }}
      {...mobileProps}
      {...props}
    />
  )
}

export { Toaster }
