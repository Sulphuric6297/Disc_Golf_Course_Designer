-- Comments: what each person has read of each thread (a thread is new for you when someone else
-- wrote in it since), and reactions on a comment (a few emoji, one of each per person).
create table if not exists comment_reads (
  thread_id uuid not null references course_comments on delete cascade,
  user_id uuid not null references users on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists comment_reactions (
  comment_id uuid not null references course_comments on delete cascade,
  user_id uuid not null references users on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

-- (the threads there are already: read by everyone on their course, so nothing old shows as new)
insert into comment_reads (thread_id, user_id, seen_at)
  select c.id, m.user_id, now() from course_comments c join course_members m on m.course_id = c.course_id where c.parent_id is null
  on conflict do nothing;
