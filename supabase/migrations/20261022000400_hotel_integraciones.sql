-- Hotel: credenciales de Cloudbeds por organización, guardadas desde Ajustes › Integraciones.
-- La API key y el secreto de los avisos se guardan CIFRADOS (AES-GCM, clave CREDENCIALES_KEY del Worker, atada a la organización).
-- La tabla es SOLO para el Worker `pos-cloudbeds` (clave de servicio): ningún usuario del POS puede leerla ni escribirla, ni
-- siquiera los administradores; el POS solo ve el estado que devuelve el Worker.
CREATE TABLE IF NOT EXISTS public.hotel_integraciones (
  organization_id text PRIMARY KEY,
  proveedor text NOT NULL DEFAULT 'cloudbeds',
  api_key_cifrada text NOT NULL,
  webhook_secret_cifrado text NOT NULL,
  -- Fuente de reservas del POS en Cloudbeds (cada cuenta tiene su propio id), opcional.
  fuente_id text,
  propiedad_id text,
  hotel_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hotel_integraciones ENABLE ROW LEVEL SECURITY;
-- Sin ninguna política: con RLS activo, anon y authenticated no ven nada. Además se les quitan los permisos.
REVOKE ALL ON public.hotel_integraciones FROM anon, authenticated;
