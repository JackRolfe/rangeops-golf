create table accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text,
  created_at timestamptz not null default now()
);

-- Only token hashes are stored. A link is single use.
create table sign_in_links (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  account_id uuid not null references accounts(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table range_staff (
  account_id uuid not null references accounts(id),
  range_id uuid not null references ranges(id),
  primary key (account_id, range_id)
);
