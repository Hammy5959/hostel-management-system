-- Tracks how much of a resident charge has been paid so the Resident Charges
-- page can render "partially paid" balances without depending on the
-- (not-yet-built) Invoices/Payments linkage.
alter table resident_charges add column amount_paid numeric not null default 0;
