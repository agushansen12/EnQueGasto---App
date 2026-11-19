-- EnQuéGasto: soporte para compras financiadas y cuotas.
-- Ejecutar una sola vez en Supabase > SQL Editor > New query.
-- No modifica ni elimina los movimientos existentes.

alter table public.movements
  add column if not exists payment_method text not null default 'cash'
    check (payment_method in ('cash', 'debit', 'credit', 'transfer')),
  add column if not exists installment_plan_id uuid,
  add column if not exists installment_number integer;

create table if not exists public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  concept text not null,
  category_id uuid,
  person text not null check (person in ('Agus', 'Camila', 'Compartido')),
  purchase_total numeric(14,2) not null check (purchase_total > 0),
  financed_total numeric(14,2) not null check (financed_total > 0),
  installment_count integer not null check (installment_count between 2 and 120),
  first_due_date date not null,
  recorded_by uuid not null references auth.users(id),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  comment text,
  created_at timestamptz not null default now(),
  foreign key (category_id, household_id)
    references public.categories(id, household_id),
  unique (id, household_id)
);

alter table public.movements
  add constraint movements_installment_plan_household_fk
  foreign key (installment_plan_id, household_id)
  references public.installment_plans(id, household_id)
  on delete restrict;

alter table public.movements
  add constraint movements_id_household_unique unique (id, household_id);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plan_id uuid not null,
  movement_id uuid not null,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, installment_number),
  foreign key (plan_id, household_id)
    references public.installment_plans(id, household_id) on delete cascade,
  foreign key (movement_id, household_id)
    references public.movements(id, household_id) on delete cascade
);

create index if not exists installments_due_date_idx
  on public.installments(due_date);
create index if not exists installment_plans_household_idx
  on public.installment_plans(household_id);

alter table public.installment_plans enable row level security;
alter table public.installments enable row level security;

drop policy if exists "Members can view installment plans" on public.installment_plans;
create policy "Members can view installment plans"
on public.installment_plans for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members can create installment plans" on public.installment_plans;
create policy "Members can create installment plans"
on public.installment_plans for insert to authenticated
with check (
  public.is_household_member(household_id)
  and recorded_by = (select auth.uid())
);

drop policy if exists "Members can update installment plans" on public.installment_plans;
create policy "Members can update installment plans"
on public.installment_plans for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "Members can delete installment plans" on public.installment_plans;
create policy "Members can delete installment plans"
on public.installment_plans for delete to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members can view installments" on public.installments;
create policy "Members can view installments"
on public.installments for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Members can create installments" on public.installments;
create policy "Members can create installments"
on public.installments for insert to authenticated
with check (public.is_household_member(household_id));

drop policy if exists "Members can update installments" on public.installments;
create policy "Members can update installments"
on public.installments for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "Members can delete installments" on public.installments;
create policy "Members can delete installments"
on public.installments for delete to authenticated
using (public.is_household_member(household_id));

grant select, insert, update, delete on public.installment_plans to authenticated;
grant select, insert, update, delete on public.installments to authenticated;
