-- EnQuéGasto: agregar la categoría Gimnasio y enseñársela al asistente.
-- Seguro para ejecutar más de una vez. No modifica movimientos existentes.

insert into public.categories (household_id, name, type, is_default)
select h.id, 'Gimnasio', 'expense', false
from public.households h
on conflict (household_id, type, name) do nothing;

insert into public.assistant_knowledge
  (household_id, phrase, normalized_phrase, movement_type, category_name, canonical_concept, match_type, priority, is_active)
values
  (null, 'gimnasio', 'gimnasio', 'expense', 'Gimnasio', 'Gimnasio', 'phrase', 95, true),
  (null, 'gym', 'gym', 'expense', 'Gimnasio', 'Gimnasio', 'phrase', 95, true),
  (null, 'cuota del gimnasio', 'cuota del gimnasio', 'expense', 'Gimnasio', 'Gimnasio', 'phrase', 100, true),
  (null, 'abono del gimnasio', 'abono del gimnasio', 'expense', 'Gimnasio', 'Gimnasio', 'phrase', 100, true),
  (null, 'mensualidad del gimnasio', 'mensualidad del gimnasio', 'expense', 'Gimnasio', 'Gimnasio', 'phrase', 100, true),
  (null, 'membresia del gimnasio', 'membresia del gimnasio', 'expense', 'Gimnasio', 'Gimnasio', 'phrase', 100, true)
on conflict (normalized_phrase, movement_type) where household_id is null
do update set
  category_name = excluded.category_name,
  canonical_concept = excluded.canonical_concept,
  priority = excluded.priority,
  is_active = true;
