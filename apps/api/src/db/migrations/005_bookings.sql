create table bookings (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references ranges(id),
  bay_id uuid not null references bays(id),
  -- Null for a booking from another source with no RangeOps account.
  account_id uuid references accounts(id),
  source text not null check (source in ('rangeops', 'external')),
  external_ref text,
  customer_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('pending_payment', 'confirmed', 'cancelled')),
  order_id uuid references orders(id),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (starts_at < ends_at),
  check (source = 'external' or account_id is not null),
  -- A bay can't be booked twice for the same time. Cancelled bookings free it.
  constraint bookings_no_overlap exclude using gist (bay_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status <> 'cancelled')
);
create index bookings_account on bookings (account_id, starts_at desc);
create index bookings_range_time on bookings (range_id, starts_at);
create unique index bookings_external_ref on bookings (range_id, external_ref) where external_ref is not null;

create table booking_addons (
  booking_id uuid not null references bookings(id),
  kind text not null check (kind in ('robot', 'club_hire', 'lesson')),
  quantity integer not null check (quantity > 0),
  total_cents integer not null check (total_cents >= 0),
  primary key (booking_id, kind)
);
