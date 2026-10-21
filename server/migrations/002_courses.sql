-- Courses kept on the server, and who may open them: owner (shares, deletes), editor (changes),
-- viewer (looks).

create table courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holes integer not null default 0,
  -- the course document (the app's CourseDoc) without its aerial photo
  doc json not null,
  -- each save adds one; a save made from an older version is refused
  version integer not null default 1,
  created_by uuid references users on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references users on delete set null,
  updated_at timestamptz not null default now()
);

-- The aerial photo (a data URL), apart: large, and it changes seldom
create table course_backgrounds (
  course_id uuid primary key references courses on delete cascade,
  data text not null,
  updated_at timestamptz not null default now()
);

create table course_members (
  course_id uuid not null references courses on delete cascade,
  user_id uuid not null references users on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (course_id, user_id)
);
create index course_members_user on course_members (user_id);
