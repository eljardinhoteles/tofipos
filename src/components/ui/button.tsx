import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-2xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primario: relleno con un brillo interior arriba y sombra corta (se siente "en relieve").
        default: "bg-primary text-primary-foreground border-primary shadow-[inset_0_1px_0_oklch(1_0_0/0.2),var(--shadow-btn)] hover:brightness-110",
        // Outline y secundario: tarjeta blanca con borde suave y sombra corta.
        outline: "border-border bg-card text-foreground shadow-(--shadow-btn) hover:bg-muted/60 aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary: "border-border bg-card text-foreground shadow-(--shadow-btn) hover:bg-muted/60 aria-expanded:bg-muted aria-expanded:text-foreground",
        // Secundarios con intención (misma tarjeta blanca, texto de color): acción de servicio, hotel, cuenta, división.
        primarySoft: "border-border bg-card text-primary shadow-(--shadow-btn) hover:bg-primary/5",
        infoSoft: "border-border bg-card text-info-foreground shadow-(--shadow-btn) hover:bg-info-soft",
        warningSoft: "border-border bg-card text-warning-foreground shadow-(--shadow-btn) hover:bg-warning-soft",
        specialSoft: "border-border bg-card text-special-foreground shadow-(--shadow-btn) hover:bg-special-soft",
        // Principal de cuenta/cobro (naranja de "cuenta pedida").
        warning: "bg-warning-foreground text-white border-warning-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.2),var(--shadow-btn)] hover:brightness-110",
        ghost: "aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive: "bg-destructive/10 text-destructive focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        // Acción de riesgo secundaria: solo texto en rojo atenuado.
        dangerGhost: "text-destructive/80 hover:bg-destructive/10 hover:text-destructive",
        link: "text-primary underline-offset-4",
      },
      size: {
        default: "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

// Botones pegados en un solo bloque (anterior | mes | siguiente, filtros…): comparten
// borde y sombra y se separan con una línea fina.
function ButtonGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "inline-flex items-stretch divide-x divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-btn)",
        "[&>*]:rounded-none [&>*]:border-0 [&>*]:bg-transparent [&>*]:shadow-none",
        className
      )}
      {...props}
    />
  )
}

export { ButtonGroup }
