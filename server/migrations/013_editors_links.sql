-- The owner's switch: editors may make public links and update the public site too.
alter table courses add column if not exists editors_links boolean not null default false;
