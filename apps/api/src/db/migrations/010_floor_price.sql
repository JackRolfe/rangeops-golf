-- The least a bay-hour may cost at a range (idea 7 in docs/PLAN.md). Range and bay prices can't be set
-- below it, and demand pricing, when it comes, is clamped to it. 0 means no floor.
alter table ranges add column floor_cents integer not null default 0 check (floor_cents >= 0);
