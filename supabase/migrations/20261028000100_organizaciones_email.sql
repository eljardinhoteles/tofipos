-- Correo de contacto de la organización: va en el pie de los correos automáticos a los huéspedes (Resend, sin responder)
-- y como Reply-To de esos correos.
ALTER TABLE public.organizaciones
  ADD COLUMN IF NOT EXISTS email text;
