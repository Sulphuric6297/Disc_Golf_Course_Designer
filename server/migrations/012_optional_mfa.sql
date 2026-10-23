-- Two-factor sign-in is each person's choice, unless an admin requires it for them.
alter table users add column if not exists mfa_required boolean not null default false;
