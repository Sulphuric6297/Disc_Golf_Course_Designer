-- The park a course is in (its owner names it): courses in the same park show each other on their
-- maps, and the course list groups by park.
alter table courses add column park text not null default '';
