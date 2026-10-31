-- Visitors to a course's public page, counted without cookies and with nothing personal kept: a
-- visitor is a hash of their address and browser with a salt that's thrown away after a day, so
-- they're counted once a day and can't be followed from one day to the next. Each visit: where it
-- came from (a tee sign's QR code, a named public link, a search engine, another website, or none),
-- phone or computer, the visitor's own day of the week and hour, and how long it lasted. Counts per
-- day of what was looked at (each hole opened, each flyover played).

create table site_salts (
  day date primary key,
  salt bytea not null
);

create table site_visits (
  course_id uuid not null references courses on delete cascade,
  day date not null,
  visitor bytea not null,
  link_id uuid references course_links on delete set null,
  -- sign | link | search | web | direct
  source text not null,
  -- the sign's hole, or the website's host
  source_key text,
  phone boolean not null,
  dow smallint not null,
  hour smallint not null,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  seconds integer not null default 0,
  primary key (course_id, day, visitor)
);
create index site_visits_recent on site_visits (course_id, last_at);

create table site_counts (
  course_id uuid not null references courses on delete cascade,
  day date not null,
  -- hole | flyover
  kind text not null,
  -- the hole's number
  key text not null,
  n integer not null default 0,
  primary key (course_id, day, kind, key)
);
