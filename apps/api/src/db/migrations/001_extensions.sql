-- btree_gist lets exclusion constraints combine "same bay" (=) with
-- "overlapping time" (&&), so double bookings are refused by the database.
create extension if not exists btree_gist;
