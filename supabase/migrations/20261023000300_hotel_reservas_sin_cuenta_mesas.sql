-- Mesas › Llegadas: marca de una reserva a la que NO se le abrirá cuenta de habitación en Mesas (el huésped no consumió, ya estaba atendido
-- con el sistema anterior, no llegó…). La tira de llegadas deja de mostrarla. Vive en el Hotel: no toca cuentas ni ventas.
ALTER TABLE public.hotel_reservas
  ADD COLUMN IF NOT EXISTS sin_cuenta_mesas boolean NOT NULL DEFAULT false;
