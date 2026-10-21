-- What the course list shows of each course without opening it: par, length, and the holes'
-- throw lines for a small map (sent by the app with each save)
alter table courses add column summary json not null default '{}';
