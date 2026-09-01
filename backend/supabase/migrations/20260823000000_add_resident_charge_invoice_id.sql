-- Links a resident charge to the invoice it was billed on, so an invoiced
-- charge can be excluded from the pending pool for future invoices.
alter table resident_charges add column invoice_id uuid null references invoices(id);
create index resident_charges_invoice_id_idx on resident_charges(invoice_id);
