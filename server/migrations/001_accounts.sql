-- Accounts: users, their 2FA backup codes, sessions, invite and reset links, and the activity log.

create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  display_name text not null,
  password_hash text not null,
  is_admin boolean not null default false,
  -- 2FA (TOTP): the secret, encrypted with APP_SECRET; on once confirmed with a code
  totp_secret bytea,
  totp_enabled boolean not null default false,
  -- the last 30-second step a code was used for (a code works once)
  totp_last_step bigint not null default 0,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index users_username on users (lower(username));

create table backup_codes (
  user_id uuid not null references users on delete cascade,
  code_hash bytea not null,
  used_at timestamptz,
  primary key (user_id, code_hash)
);

-- The cookie holds a random token; only its SHA-256 is kept here.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  user_id uuid not null references users on delete cascade,
  -- 'mfa': password given, code next; 'mfa-setup': 2FA to set up next; 'full': signed in
  stage text not null check (stage in ('mfa', 'mfa-setup', 'full')),
  mfa_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip text,
  user_agent text
);
create index sessions_user on sessions (user_id);

-- Single-use links: an invite to join, or a reset (new password and 2FA) for one user.
create table invites (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  kind text not null check (kind in ('invite', 'reset')),
  user_id uuid references users on delete cascade,
  is_admin boolean not null default false,
  note text not null default '',
  created_by uuid references users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references users on delete set null
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid references users on delete set null,
  action text not null,
  detail jsonb not null default '{}',
  ip text
);
create index audit_log_at on audit_log (at desc);
