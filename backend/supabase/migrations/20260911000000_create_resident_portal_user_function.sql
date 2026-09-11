-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Atomic Resident Portal account creation: creates a resident-role user
-- account and links it to the given resident (residents.user_id), all inside
-- a single locking transaction. Mirrors hms_checkout_resident's shape (same
-- FOR UPDATE locking pattern, same RAISE EXCEPTION 'tag' error convention).
--
-- The resident role id is resolved inside the function (not trusted from the
-- caller), so this function can only ever create resident-role accounts.
--
-- Apply via the Supabase Dashboard -> SQL Editor (runs as `postgres`).
-- Idempotent (CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_create_resident_portal_user(
    p_resident_id uuid,
    p_email text,
    p_first_name text,
    p_password_hash text,
    p_last_name text DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_profile_picture_url text DEFAULT NULL,
    p_status text DEFAULT 'invited'
)
RETURNS SETOF residents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resident residents;
    v_role_id uuid;
    v_user_id uuid;
BEGIN
    SELECT * INTO v_resident FROM residents WHERE id = p_resident_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'resident_not_found';
    END IF;
    IF v_resident.user_id IS NOT NULL THEN
        RAISE EXCEPTION 'resident_already_linked';
    END IF;

    SELECT id INTO v_role_id FROM roles WHERE name = 'resident';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'resident_role_not_found';
    END IF;

    BEGIN
        -- users.status is the user_status enum, not text — p_status (text)
        -- needs an explicit cast; Postgres won't implicitly cast a
        -- text-typed variable (only untyped literals get that).
        INSERT INTO users (email, first_name, last_name, phone, profile_picture_url, role_id, status, password_hash)
        VALUES (p_email, p_first_name, p_last_name, p_phone, p_profile_picture_url, v_role_id, p_status::user_status, p_password_hash)
        RETURNING id INTO v_user_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'email_exists';
    END;

    RETURN QUERY
    UPDATE residents SET user_id = v_user_id, updated_at = now()
     WHERE id = p_resident_id
     RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION hms_create_resident_portal_user(uuid, text, text, text, text, text, text, text) TO service_role;
