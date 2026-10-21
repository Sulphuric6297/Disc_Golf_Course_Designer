-- A public link's own name, chosen by its owner (…#site=<name>), instead of its random address
alter table course_links add column slug text unique;
