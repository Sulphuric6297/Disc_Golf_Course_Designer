-- History: checkpoints of each person's draft (theirs alone to see), old automatic ones thinned;
-- reviews: a note when the owner asks for changes, and the notice it sends.
alter table course_versions drop constraint course_versions_kind_check;
alter table course_versions add constraint course_versions_kind_check check (kind in ('created', 'autosave', 'publish', 'restore', 'draft'));
alter table course_submissions add column decision_note text not null default '';
alter table notifications add column text text not null default '';
