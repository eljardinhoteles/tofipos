import * as React from "react"
import { Toaster as Sonner } from "sonner"
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
      toastOptions={{
        classNames: {
          toast: isMobile
            ? "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-md group-[.toaster]:rounded-full group-[.toaster]:px-4 group-[.toaster]:py-2.5 group-[.toaster]:text-[13px]"
            : "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:p-4",
          title: isMobile ? "group-[.toast]:text-[13px] group-[.toast]:font-bold" : "",
          // En móvil los éxitos/info salen solo con título (la descripción
          // alargaba el toast); errores y avisos conservan su detalle.
          description: isMobile
            ? "group-[.toast]:text-muted-foreground group-data-[type=success]:hidden group-data-[type=info]:hidden"
            : "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...mobileProps}
      {...props}
    />
  )
}

export { Toaster }
