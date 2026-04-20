-- ============================================================
-- Migration: Password reset for board members
-- Run this in the Supabase SQL editor.
-- ============================================================

-- 1. Add force_password_change column to villa_users
alter table villa_users
  add column if not exists force_password_change boolean not null default false;

-- 2. Database function: allows board members to reset a user's password by email.
create or replace function admin_reset_password(target_email text, new_password text)
returns void
language plpgsql
security definer
as $$
begin
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where email = target_email;

  if not found then
    raise exception 'No auth account found for this email.';
  end if;
end;
$$;

-- 3. Database function: reset password for phone-based users.
-- Phone users have {digits}@villaapp.local as their auth email.
create or replace function admin_reset_password_by_phone(target_phone text, new_password text)
returns void
language plpgsql
security definer
as $$
begin
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where email = target_phone || '@villaapp.local';

  if not found then
    raise exception 'No auth account found for this phone number.';
  end if;
end;
$$;
