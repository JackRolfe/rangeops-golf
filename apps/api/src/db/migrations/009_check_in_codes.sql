-- The secret in each bay's QR code (APP_URL/check-in/<code>). 128 random bits.
alter table bays add column check_in_code text unique default replace(gen_random_uuid()::text, '-', '');
update bays set check_in_code = default where check_in_code is null;
alter table bays alter column check_in_code set not null;
