-- Clínicas del usuario actual (como miembro del equipo), con su rol y estado de suscripción.
-- Security definer: el estado se informa aunque la clínica esté suspendida (para mostrar
-- la pantalla de acceso pausado), pero solo campos no sensibles.
create function public.mis_clinicas()
returns table (
  clinica_id uuid,
  nombre text,
  slug text,
  color_primario text,
  estado_suscripcion public.estado_suscripcion,
  rol public.rol_equipo
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.nombre, c.slug, c.color_primario, c.estado_suscripcion, m.rol
  from public.membresias m
  join public.clinicas c on c.id = m.clinica_id
  where m.user_id = (select auth.uid()) and m.activo
  order by c.nombre;
$$;
revoke all on function public.mis_clinicas() from public, anon;
grant execute on function public.mis_clinicas() to authenticated;
