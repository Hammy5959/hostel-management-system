-- Remove permissions maintenance_staff should no longer hold: complaint
-- access removed entirely, and ticket view/update replaced by the new
-- self-scoped maintenance_tickets.view_own / update_own (granted separately
-- by the seeder — app/seed/catalog.py). The seeder (app/seed/run.py) only
-- ever inserts missing role_permissions rows, it never revokes one that's
-- fallen out of the catalog, so this one-off cleanup is required alongside
-- re-running the seeder (which adds the two new _own grants).
--
-- Apply this AFTER re-running the seeder, not before, so maintenance_staff
-- is never left with zero ticket access in between.
delete from role_permissions
where role_id = (select id from roles where name = 'maintenance_staff')
  and permission_id in (
    select id from permissions where name in (
      'complaints.view',
      'complaints.update',
      'maintenance_tickets.view',
      'maintenance_tickets.create',
      'maintenance_tickets.update'
    )
  );
