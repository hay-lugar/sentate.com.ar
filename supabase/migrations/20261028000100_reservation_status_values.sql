-- {Sin Nombre} · Explorador · Etapa E (1/2): estados nuevos de la reserva.
-- En archivo aparte: un valor de enum recién agregado no se puede usar dentro de la misma transacción.
--   expired  → solicitud pendiente que nadie respondió a tiempo (libera el cupo)
--   finished → reserva confirmada ya cumplida
alter type public.reservation_status add value if not exists 'expired';
alter type public.reservation_status add value if not exists 'finished';
