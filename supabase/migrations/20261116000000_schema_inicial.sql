create extension if not exists btree_gist;

create table public.administradores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  criado_em  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.administradores where usuario_id = (select auth.uid()));
$$;

create table public.servicos (
  id      text primary key,
  nome    text not null,
  duracao integer not null check (duracao between 5 and 480),
  ativo   boolean not null default true,
  ordem   integer not null default 0
);

insert into public.servicos (id, nome, duracao, ordem) values
  ('corte',        'Corte de cabelo', 30, 1),
  ('cabelo-barba', 'Cabelo + barba',  45, 2);

create table public.configuracoes (
  id                smallint primary key default 1 check (id = 1),
  dias              jsonb    not null,
  intervalo_ativo   boolean  not null default false,
  intervalo_inicio  time     not null default '12:00',
  intervalo_fim     time     not null default '13:00',
  dias_antecedencia smallint not null default 30 check (dias_antecedencia between 1 and 180),
  passo_minutos     smallint not null default 15 check (passo_minutos between 5 and 120),
  fuso_horario      text     not null default 'America/Cuiaba',
  atualizado_em     timestamptz not null default now()
);

insert into public.configuracoes (dias) values (
  '{"0":{"open":false,"start":"09:00","end":"19:00"},
    "1":{"open":true, "start":"09:00","end":"19:00"},
    "2":{"open":true, "start":"09:00","end":"19:00"},
    "3":{"open":true, "start":"09:00","end":"19:00"},
    "4":{"open":true, "start":"09:00","end":"19:00"},
    "5":{"open":true, "start":"09:00","end":"19:00"},
    "6":{"open":true, "start":"09:00","end":"19:00"}}'::jsonb
);

create table public.agendamentos (
  id         bigint generated always as identity primary key,
  nome       text not null check (char_length(nome) between 1 and 80),
  telefone   text not null check (telefone ~ '^55[0-9]{10,11}$'),
  servico_id text not null references public.servicos (id),
  data       date not null,
  inicio     time not null,
  fim        time not null,
  status     text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'done', 'no_show')),
  criado_em  timestamptz not null default now(),
  check (fim > inicio),
  constraint agendamentos_sem_sobreposicao exclude using gist (
    tsrange(data + inicio, data + fim) with &&
  ) where (status = 'confirmed')
);

create index agendamentos_data_idx     on public.agendamentos (data);
create index agendamentos_telefone_idx on public.agendamentos (telefone);

create table public.bloqueios (
  id        bigint generated always as identity primary key,
  data      date not null,
  inicio    time not null,
  fim       time not null,
  motivo    text check (char_length(motivo) <= 100),
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);

create index bloqueios_data_idx on public.bloqueios (data);

create table public.lista_negra (
  telefone  text primary key check (telefone ~ '^55[0-9]{10,11}$'),
  nome      text check (char_length(nome) <= 80),
  motivo    text check (char_length(motivo) <= 200),
  criado_em timestamptz not null default now()
);

grant select on public.servicos, public.configuracoes to anon;
grant select, insert, update, delete on public.servicos, public.agendamentos,
  public.bloqueios, public.lista_negra to authenticated;
grant select, update on public.configuracoes to authenticated;
grant select on public.administradores to authenticated;

alter table public.administradores enable row level security;
alter table public.servicos        enable row level security;
alter table public.configuracoes   enable row level security;
alter table public.agendamentos    enable row level security;
alter table public.bloqueios       enable row level security;
alter table public.lista_negra     enable row level security;

create policy "servicos: leitura pública" on public.servicos
  for select to anon, authenticated using (ativo or (select public.is_admin()));
create policy "configuracoes: leitura pública" on public.configuracoes
  for select to anon, authenticated using (true);

create policy "administradores: o próprio admin se vê" on public.administradores
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "servicos: admin" on public.servicos
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "configuracoes: admin atualiza" on public.configuracoes
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "agendamentos: admin" on public.agendamentos
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "bloqueios: admin" on public.bloqueios
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "lista_negra: admin" on public.lista_negra
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.get_busy(p_date date)
returns table (inicio time, fim time)
language sql
stable
security definer
set search_path = ''
as $$
  select a.inicio, a.fim from public.agendamentos a
   where a.data = p_date and a.status = 'confirmed'
  union all
  select b.inicio, b.fim from public.bloqueios b
   where b.data = p_date;
$$;

create or replace function public.book_appointment(
  p_service_id text,
  p_date       date,
  p_start      time,
  p_name       text,
  p_phone      text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cfg      public.configuracoes;
  v_duration integer;
  v_day      jsonb;
  v_end      time;
  v_now      timestamp;
  v_id       bigint;
begin
  select * into v_cfg from public.configuracoes where id = 1;
  v_now := (now() at time zone v_cfg.fuso_horario);

  select duracao into v_duration from public.servicos where id = p_service_id and ativo;
  if v_duration is null then
    raise exception 'Serviço inválido.' using errcode = 'P0001';
  end if;

  if p_phone !~ '^55[0-9]{10,11}$' then
    raise exception 'Telefone inválido.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Nome inválido.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.lista_negra where telefone = p_phone) then
    raise exception 'Não foi possível concluir o agendamento. Fale com a barbearia.' using errcode = 'P0001';
  end if;

  if p_date < v_now::date or p_date > v_now::date + v_cfg.dias_antecedencia then
    raise exception 'Data fora do período de agendamento.' using errcode = 'P0001';
  end if;
  if p_date + p_start <= v_now then
    raise exception 'Horário já passou.' using errcode = 'P0001';
  end if;
  if (extract(epoch from p_start)::integer / 60) % v_cfg.passo_minutos <> 0 then
    raise exception 'Horário inválido.' using errcode = 'P0001';
  end if;

  v_end := p_start + make_interval(mins => v_duration);
  if v_end <= p_start then
    raise exception 'Horário inválido.' using errcode = 'P0001';
  end if;

  v_day := v_cfg.dias -> extract(dow from p_date)::integer::text;
  if v_day is null or not (v_day ->> 'open')::boolean
     or p_start < (v_day ->> 'start')::time or v_end > (v_day ->> 'end')::time then
    raise exception 'Fora do horário de funcionamento.' using errcode = 'P0001';
  end if;

  if v_cfg.intervalo_ativo
     and p_start < v_cfg.intervalo_fim and v_end > v_cfg.intervalo_inicio then
    raise exception 'Horário indisponível.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.bloqueios b
              where b.data = p_date and p_start < b.fim and v_end > b.inicio) then
    raise exception 'Horário indisponível.' using errcode = 'P0001';
  end if;

  begin
    insert into public.agendamentos (nome, telefone, servico_id, data, inicio, fim)
    values (btrim(p_name), p_phone, p_service_id, p_date, p_start, v_end)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser reservado. Escolha outro.' using errcode = 'P0001';
  end;

  return v_id;
end;
$$;

revoke execute on function public.is_admin()                                     from public;
revoke execute on function public.get_busy(date)                                 from public;
revoke execute on function public.book_appointment(text, date, time, text, text) from public;

grant execute on function public.is_admin()                                      to anon, authenticated;
grant execute on function public.get_busy(date)                                  to anon, authenticated;
grant execute on function public.book_appointment(text, date, time, text, text)  to anon, authenticated;
