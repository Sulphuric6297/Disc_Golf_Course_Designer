-- Editors change a course in a draft of their own; the main version changes when a draft is
-- published (or, when the owner asks for it, once the owner accepts it). Every published change,
-- and the owner's own changes every few minutes, are kept as versions to look back at and restore.

-- The owner's switch: editors' drafts wait for the owner's OK
alter table courses add column approval boolean not null default false;

-- Aerial photos kept for versions, once each (by their SHA-256)
create table course_photos (
  course_id uuid not null references courses on delete cascade,
  sha bytea not null,
  data text not null,
  primary key (course_id, sha)
);

create table course_versions (
  id bigserial primary key,
  course_id uuid not null references courses on delete cascade,
  -- the course's version this was
  version integer not null,
  doc json not null,
  photo_sha bytea,
  summary json not null default '{}',
  -- created; autosave (the owner's changes as they go); publish (a draft); restore
  kind text not null check (kind in ('created', 'autosave', 'publish', 'restore')),
  note text not null default '',
  by_user uuid references users on delete set null,
  approved_by uuid references users on delete set null,
  created_at timestamptz not null default now()
);
create index course_versions_course on course_versions (course_id, id desc);

-- One draft for each editor and course: what it started from (to merge it with what changed
-- meanwhile) and what it is now
create table course_drafts (
  course_id uuid not null references courses on delete cascade,
  user_id uuid not null references users on delete cascade,
  doc json not null,
  base_doc json not null,
  base_version integer not null,
  summary json not null default '{}',
  -- a new aerial photo in the draft (a data URL), or null: the course's own
  photo text,
  updated_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

-- Drafts sent for the owner's OK
create table course_submissions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  user_id uuid references users on delete set null,
  doc json not null,
  base_doc json not null,
  base_version integer not null,
  photo text,
  summary json not null default '{}',
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_by uuid references users on delete set null,
  decided_at timestamptz
);
create index course_submissions_course on course_submissions (course_id, status);
