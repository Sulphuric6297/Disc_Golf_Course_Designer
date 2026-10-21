-- What viewers may see (per member), public links (each with its own permissions, password,
-- expiry), and the course's public site: what the owner published for the public (pictures made
-- in the owner's browser, the course's numbers, and the course itself only if the map or 3D view
-- is allowed). Links show the site, never a draft or the course as it's being changed.

alter table course_members add column perms json;

create table course_links (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  token_hash bytea not null unique,
  -- (a link isn't a secret like a password: kept, so the owner can copy it again)
  token text not null,
  label text not null default '',
  perms json not null,
  password_hash text,
  expires_at timestamptz,
  created_by uuid references users on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index course_links_course on course_links (course_id);

create table course_sites (
  course_id uuid primary key references courses on delete cascade,
  -- the course's version it shows
  version integer not null,
  -- the parts it has (a link shows those of them it allows)
  parts json not null,
  -- name, designer, totals, holes (numbers per hole)
  info json not null,
  -- the course itself (no photo): only when the map or the 3D view is a part
  doc json,
  published_by uuid references users on delete set null,
  published_at timestamptz not null default now()
);

create table course_site_files (
  course_id uuid not null references courses on delete cascade,
  name text not null,
  mime text not null,
  data bytea not null,
  primary key (course_id, name)
);
