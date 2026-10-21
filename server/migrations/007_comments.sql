-- Comments on a course: pinned to a spot on the map, or to a hole or feature there (they move
-- with it); threads of replies; resolved or open; assigned to someone. And the notices people get
-- about them (a reply in their thread, a mention, an assignment).

create table course_comments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  -- a reply (null: the first comment of a thread)
  parent_id uuid references course_comments on delete cascade,
  author_id uuid references users on delete set null,
  body text not null,
  -- where it's pinned: { x, y } on the plan, and the hole or feature it's on, if any
  anchor json,
  -- what it was made on: the course's version, and whether in a draft
  version integer not null,
  in_draft boolean not null default false,
  assignee_id uuid references users on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references users on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index course_comments_course on course_comments (course_id, created_at);
create index course_comments_parent on course_comments (parent_id);

create table notifications (
  id bigserial primary key,
  user_id uuid not null references users on delete cascade,
  course_id uuid references courses on delete cascade,
  comment_id uuid references course_comments on delete cascade,
  -- reply, mention, assigned
  kind text not null,
  by_id uuid references users on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user on notifications (user_id, read_at, id desc);
