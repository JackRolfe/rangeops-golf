create table ranges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  time_zone text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  off_peak_cents integer not null check (off_peak_cents >= 0),
  peak_cents integer not null check (peak_cents >= 0),
  created_at timestamptz not null default now()
);

create table bays (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references ranges(id),
  -- 1 to 255: the bay number is a single byte in the robot's hire key.
  number integer not null check (number between 1 and 255),
  name text not null,
  active boolean not null default true,
  off_peak_cents integer check (off_peak_cents >= 0),
  peak_cents integer check (peak_cents >= 0),
  unique (range_id, number)
);

-- Local times as minutes after midnight. Weekday 0 is Sunday. No row means closed.
create table opening_hours (
  range_id uuid not null references ranges(id),
  weekday integer not null check (weekday between 0 and 6),
  opens_min integer not null check (opens_min between 0 and 1439),
  closes_min integer not null check (closes_min between 1 and 1440),
  primary key (range_id, weekday),
  check (opens_min < closes_min)
);

create table peak_windows (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references ranges(id),
  weekday integer not null check (weekday between 0 and 6),
  from_min integer not null check (from_min between 0 and 1439),
  to_min integer not null check (to_min between 1 and 1440),
  check (from_min < to_min)
);

create table addon_prices (
  range_id uuid not null references ranges(id),
  kind text not null check (kind in ('robot', 'club_hire', 'lesson')),
  cents integer not null check (cents >= 0),
  unit text not null check (unit in ('per_hour', 'per_booking')),
  primary key (range_id, kind)
);

create table bucket_products (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references ranges(id),
  name text not null,
  balls integer not null check (balls > 0),
  cents integer not null check (cents >= 0),
  active boolean not null default true
);
