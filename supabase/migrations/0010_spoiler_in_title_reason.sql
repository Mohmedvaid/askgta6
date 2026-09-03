-- Titles are visible at every level, so a spoiler in a title is a report reason
-- of its own rather than a variant of wrong_spoiler_level.

alter table public.reports drop constraint if exists reports_reason_check;

alter table public.reports
  add constraint reports_reason_check
  check (reason in ('spam', 'leak', 'harassment', 'wrong_spoiler_level', 'spoiler_in_title', 'other'));
