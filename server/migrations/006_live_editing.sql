-- How each person edits a course: in a draft of their own (the default), or straight into the
-- course ("Publish as I go", owners only; owners of courses made before drafts keep editing live)
alter table course_members add column live boolean not null default false;
update course_members set live = true where role = 'owner';
