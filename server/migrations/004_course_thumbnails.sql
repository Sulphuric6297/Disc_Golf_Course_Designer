-- A small picture of each course's printed map (made by the app after a save), for the course list
create table course_thumbnails (
  course_id uuid primary key references courses on delete cascade,
  data text not null,
  updated_at timestamptz not null default now()
);
