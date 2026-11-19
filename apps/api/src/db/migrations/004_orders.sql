create table orders (
  id uuid primary key default gen_random_uuid(),
  -- Null for a booking handed in from another booking source with no RangeOps account.
  account_id uuid references accounts(id),
  range_id uuid not null references ranges(id),
  kind text not null check (kind in ('booking', 'bucket', 'pass', 'ball_credit')),
  total_cents integer not null check (total_cents >= 0),
  currency text not null,
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded')),
  payment_provider text,
  charge_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);
create index orders_account on orders (account_id, created_at desc);
create index orders_range on orders (range_id, created_at);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  position integer not null,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_cents integer not null,
  unique (order_id, position)
);
