create table robots (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references ranges(id),
  -- The 4 characters after "Mulligan-" in its Bluetooth name; bytes 1..4 of its hire keys.
  serial text not null unique check (serial ~ '^[A-Z0-9]{4}$'),
  name text not null,
  home_bay_id uuid references bays(id),
  in_service boolean not null default true,
  last_state text,
  battery_pct integer check (battery_pct between 0 and 100),
  balls_on_board integer check (balls_on_board >= 0),
  firmware text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table hires (
  id uuid primary key default gen_random_uuid(),
  robot_id uuid not null references robots(id),
  booking_id uuid not null unique references bookings(id),
  range_id uuid not null references ranges(id),
  bay_number integer not null check (bay_number between 1 and 255),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- pending while the booking is being paid for; active once the key is signed.
  status text not null check (status in ('pending', 'active', 'cancelled')),
  key bytea check (key is null or length(key) = 78),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  constraint hires_no_overlap exclude using gist (robot_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status <> 'cancelled')
);
create index hires_range_time on hires (range_id, starts_at);
