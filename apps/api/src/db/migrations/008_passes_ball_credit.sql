create table pass_products (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references ranges(id),
  kind text not null check (kind in ('monthly_pass', 'ball_credit')),
  name text not null,
  cents integer not null check (cents >= 0),
  -- monthly_pass: how long it lasts and its discount on bay-hours and buckets.
  days integer check (days > 0),
  discount_pct integer check (discount_pct between 1 and 100),
  -- ball_credit: how many balls it adds.
  balls integer check (balls > 0),
  active boolean not null default true,
  check ((kind = 'monthly_pass' and days is not null and discount_pct is not null and balls is null)
      or (kind = 'ball_credit' and balls is not null and days is null and discount_pct is null))
);

create table passes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  range_id uuid not null references ranges(id),
  pass_product_id uuid not null references pass_products(id),
  order_id uuid not null references orders(id),
  name text not null,
  discount_pct integer not null,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  created_at timestamptz not null default now(),
  check (valid_from < valid_to)
);
create index passes_account on passes (account_id, range_id, valid_to);

-- Ball credit is a ledger: the balance is the sum. Bought is positive, spent negative.
create table ball_credit_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  range_id uuid not null references ranges(id),
  balls integer not null check (balls <> 0),
  reason text not null check (reason in ('purchase', 'bucket')),
  order_id uuid references orders(id),
  bucket_code_id uuid references bucket_codes(id),
  created_at timestamptz not null default now()
);
create index ball_credit_account on ball_credit_entries (account_id, range_id);
