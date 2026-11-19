-- A bought bucket is a code. Whoever redeems it (staff, later a ball machine)
-- doesn't need to know how it was paid for.
create table bucket_codes (
  id uuid primary key default gen_random_uuid(),
  range_id uuid not null references ranges(id),
  order_id uuid not null references orders(id),
  account_id uuid references accounts(id),
  bucket_product_id uuid not null references bucket_products(id),
  name text not null,
  balls integer not null check (balls > 0),
  -- Stored without the dash, upper case.
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references accounts(id),
  unique (range_id, code)
);
create index bucket_codes_account on bucket_codes (account_id, created_at desc);
