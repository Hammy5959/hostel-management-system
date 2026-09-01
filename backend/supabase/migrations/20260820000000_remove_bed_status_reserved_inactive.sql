-- Remove the 'reserved' and 'inactive' values from bed_status.
-- Remaining values: available, occupied, cleaning, maintenance.
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so the enum is recreated
-- without the two removed values and the column is swapped over to it.

-- 1. Move any beds currently on a status being removed to 'available' so
--    the column-type swap below never fails on an unmapped value.
UPDATE beds SET status = 'available' WHERE status IN ('reserved', 'inactive');

-- 2. Recreate the enum without 'reserved' / 'inactive'.
ALTER TABLE beds ALTER COLUMN status DROP DEFAULT;

CREATE TYPE bed_status_new AS ENUM ('available', 'occupied', 'cleaning', 'maintenance');

ALTER TABLE beds
  ALTER COLUMN status TYPE bed_status_new
  USING status::text::bed_status_new;

DROP TYPE bed_status;

ALTER TYPE bed_status_new RENAME TO bed_status;

ALTER TABLE beds ALTER COLUMN status SET DEFAULT 'available'::bed_status;
