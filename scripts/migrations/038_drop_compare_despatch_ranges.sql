-- 038: the period-comparison picker (036) was reverted on 30 Sep; nothing
-- calls compare_despatch_ranges any more.

drop function if exists public.compare_despatch_ranges(date, date, date, date, text[]);
