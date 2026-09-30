-- ============================================================================
-- 032  Backup of the retired Command Agent functions (not applied).
-- ============================================================================
-- These 18 functions served the old standalone "Command Agent" phone app
-- (n8n /webhook/hmb-agent, now 404). They read and write agent.app_sessions,
-- ai_queries, reset_requests, admin_log, app_assets, app_asset_versions and
-- agent.metrics, which the storage cleanup dropped on 18 Sep 2026, so every
-- one of them already failed. Nothing in the database, the dashboard, the
-- hmb-sales-agent service or n8n calls them.
--
-- Dropped 29 Sep 2026 by 033_drop_command_agent_functions.sql. This file is
-- the live definitions and EXECUTE grants captured just before the drop.
-- Restoring any of them also needs the tables they use.
-- ============================================================================

-- agent.is_admin(text)
CREATE OR REPLACE FUNCTION agent.is_admin(p_token text)
 RETURNS chat_users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare s_user public.chat_users;
begin
  if coalesce(p_token,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  select cu.* into s_user
    from agent.app_sessions ses
    join public.chat_users cu on cu.user_id = ses.user_id
   where ses.token = (p_token)::uuid and ses.expires_at > now() and cu.is_active;
  if s_user.user_id is null or coalesce(s_user.field_role,'') not in ('ALL','ADMIN') then
    return null;
  end if;
  return s_user;
end;
$function$
;


-- agent.snapshot_app_asset()
CREATE OR REPLACE FUNCTION agent.snapshot_app_asset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public'
AS $function$
begin
  insert into agent.app_asset_versions (name, content, content_type, note)
  values (old.name, old.content, old.content_type, 'auto-snapshot before update');
  return new;
end $function$
;


-- agent_admin_activity(text,integer)
CREATE OR REPLACE FUNCTION public.agent_admin_activity(p_token text, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare me public.chat_users; out_rows jsonb;
begin
  me := agent.is_admin(p_token);
  if me.user_id is null then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'at', q.asked_at, 'who', q.username, 'question', q.question,
           'ok', q.ok, 'rows', q.row_count, 'ms', q.duration_ms, 'error', q.error)
         order by q.asked_at desc), '[]'::jsonb)
    into out_rows
    from (select * from agent.ai_queries order by asked_at desc
           limit least(greatest(coalesce(p_limit,40),1),200)) q;

  return jsonb_build_object('ok', true, 'rows', out_rows,
    'today', (select count(*) from agent.ai_queries where asked_at > current_date),
    'failed_today', (select count(*) from agent.ai_queries where asked_at > current_date and ok is false));
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_admin_activity(text,integer) TO service_role;

-- agent_admin_health(text)
CREATE OR REPLACE FUNCTION public.agent_admin_health(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare me public.chat_users; out_rows jsonb;
begin
  me := agent.is_admin(p_token);
  if me.user_id is null then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'file', f.file_name, 'table', f.target_table, 'rows', f.row_count,
           'status', f.status, 'loaded_at', f.last_ingested_at,
           'hours_old', round(extract(epoch from (now() - f.last_ingested_at))/3600.0, 1))
         order by f.last_ingested_at desc), '[]'::jsonb)
    into out_rows from public.file_hashes f;

  return jsonb_build_object('ok', true, 'rows', out_rows,
    'latest_despatch', (select max(despatch_date) from agent.despatch),
    'open_alerts', (select count(*) from agent.alerts),
    'pending_resets', (select count(*) from agent.reset_requests where status = 'pending'));
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_admin_health(text) TO service_role;

-- agent_admin_set_user(text,text,jsonb)
CREATE OR REPLACE FUNCTION public.agent_admin_set_user(p_token text, p_user_id text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare me public.chat_users; target public.chat_users;
begin
  me := agent.is_admin(p_token);
  if me.user_id is null then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;

  select * into target from public.chat_users where user_id = (p_user_id)::uuid;
  if target.user_id is null then return jsonb_build_object('ok', false, 'error', 'No such user.'); end if;

  if target.user_id = me.user_id and (p_patch ? 'is_active') and (p_patch->>'is_active')::boolean is false then
    return jsonb_build_object('ok', false, 'error', 'You cannot deactivate your own account.');
  end if;

  update public.chat_users set
    is_active   = coalesce((p_patch->>'is_active')::boolean, is_active),
    field_role  = coalesce(nullif(p_patch->>'field_role',''), field_role),
    display_name= coalesce(nullif(p_patch->>'name',''), display_name),
    email       = case when p_patch ? 'email'  then nullif(p_patch->>'email','')  else email  end,
    mobile      = case when p_patch ? 'mobile' then nullif(p_patch->>'mobile','') else mobile end
  where user_id = target.user_id;

  -- deactivating someone signs them out everywhere, immediately
  if (p_patch ? 'is_active') and (p_patch->>'is_active')::boolean is false then
    delete from agent.app_sessions where user_id = target.user_id;
  end if;

  insert into agent.admin_log (actor, action, subject, detail)
  values (me.username, 'set_user', target.username, p_patch);

  return jsonb_build_object('ok', true, 'message', 'Saved.');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'Could not save that change.');
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_admin_set_user(text,text,jsonb) TO service_role;

-- agent_admin_users(text)
CREATE OR REPLACE FUNCTION public.agent_admin_users(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare me public.chat_users; out_rows jsonb;
begin
  me := agent.is_admin(p_token);
  if me.user_id is null then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;

  select coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb) into out_rows from (
    select jsonb_build_object(
      'user_id', cu.user_id, 'username', cu.username, 'name', cu.display_name,
      'field_role', cu.field_role, 'is_active', cu.is_active,
      'email', cu.email, 'mobile', cu.mobile,
      'states', array_to_string(cu.scope_states, ', '),
      'last_seen', (select max(s.expires_at) - interval '30 days'
                      from agent.app_sessions s where s.user_id = cu.user_id),
      'open_sessions', (select count(*) from agent.app_sessions s
                         where s.user_id = cu.user_id and s.expires_at > now())
    ) as t from public.chat_users cu
  ) q;

  return jsonb_build_object('ok', true, 'rows', out_rows,
    'summary', jsonb_build_object(
      'users', (select count(*) from public.chat_users),
      'active', (select count(*) from public.chat_users where is_active),
      'signed_in', (select count(distinct user_id) from agent.app_sessions where expires_at > now())));
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_admin_users(text) TO service_role;

-- agent_api2(text,jsonb)
CREATE OR REPLACE FUNCTION public.agent_api2(action text, params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare
  s_user     public.chat_users;
  s_token    uuid;
  scope_st   text[] := null;
  scope_di   text[] := null;
  eff_st     text[] := null;
  eff_di     text[] := null;
  f_state    text := nullif(params->>'state','');
  f_district text := nullif(params->>'district','');
  f_kro      text := nullif(params->>'kro','');
  f_krm      text := nullif(params->>'krm','');
  f_dealer   text := nullif(params->>'dealer','');
  f_brand    text := nullif(params->>'brand','');
  f_product  text := nullif(params->>'product','');
  f_search   text := nullif(params->>'search','');
  f_status   text := nullif(params->>'status','');
  f_month    date := nullif(params->>'month','')::date;
  d_from     date;
  d_to       date;
  lim        int := least(greatest(coalesce((params->>'limit')::int, 100), 1), 500);
  grain      text := coalesce(nullif(params->>'grain',''), 'day');
  result     jsonb;
  bounds     record;
begin
  begin s_token := (params->>'token')::uuid; exception when others then s_token := null; end;
  if s_token is null then return jsonb_build_object('ok', false, 'error', 'auth_required'); end if;

  select cu.* into s_user
    from agent.app_sessions ses
    join public.chat_users cu on cu.user_id = ses.user_id
   where ses.token = s_token and ses.expires_at > now() and cu.is_active;
  if s_user.user_id is null then return jsonb_build_object('ok', false, 'error', 'session_expired'); end if;
  update agent.app_sessions set last_seen = now() where token = s_token;

  if coalesce(s_user.field_role,'') not in ('ALL','ADMIN') then
    if array_length(s_user.scope_states,1) > 0 then
      select array_agg(coalesce(sd.display, initcap(x))) into scope_st
        from unnest(s_user.scope_states) x
        left join agent.state_display sd on sd.code = upper(x);
    end if;
    if array_length(s_user.scope_districts,1) > 0 then scope_di := s_user.scope_districts; end if;
  end if;

  if f_state is not null then
    if scope_st is null or f_state = any(scope_st) then eff_st := array[f_state];
    else return jsonb_build_object('ok', false, 'error', 'out_of_scope'); end if;
  else eff_st := scope_st; end if;

  if f_district is not null then
    if scope_di is null or f_district = any(scope_di) then eff_di := array[f_district];
    else return jsonb_build_object('ok', false, 'error', 'out_of_scope'); end if;
  else eff_di := scope_di; end if;

  d_from := nullif(params->>'from','')::date;
  d_to   := nullif(params->>'to','')::date;
  if d_from is null or d_to is null then
    select c.cycle_start, c.cycle_end into d_from, d_to from agent.cycle c;
  end if;
  if d_from > d_to then return jsonb_build_object('ok', false, 'error', 'bad_date_range'); end if;

  case action

    when 'board' then
      select jsonb_build_object(
        'rows', coalesce((select jsonb_agg(to_jsonb(b)) from agent.board_query(
                   coalesce(nullif(params->>'dim',''),'state'), d_from, d_to,
                   eff_st, eff_di, f_kro, f_krm, f_dealer, f_brand, f_product, f_search, lim) b), '[]'::jsonb),
        'total', coalesce((select to_jsonb(t) from agent.board_total(
                   d_from, d_to, eff_st, eff_di, f_kro, f_krm, f_dealer,
                   f_brand, f_product, f_search) t), '{}'::jsonb),
        'from', d_from, 'to', d_to, 'dim', coalesce(nullif(params->>'dim',''),'state')
      ) into result;

    when 'trend' then
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into result
        from agent.board_trend(grain, d_from, d_to, eff_st, eff_di,
                               f_kro, f_krm, f_dealer, f_brand, f_product) t;

    when 'lines' then
      select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into result
        from agent.board_lines(d_from, d_to, eff_st, eff_di, f_kro, f_krm,
                               f_dealer, f_brand, f_product, f_search, lim) l;

    when 'filters' then
      select min(despatch_date) as lo, max(despatch_date) as hi into bounds from agent.despatch;
      select jsonb_build_object(
        'date_min', bounds.lo, 'date_max', bounds.hi,
        'states', coalesce((select jsonb_agg(x order by x) from (
            select distinct state x from agent.despatch
             where state is not null and (eff_st is null or state = any(eff_st))) s), '[]'::jsonb),
        'districts', coalesce((select jsonb_agg(x order by x) from (
            select distinct district x from agent.despatch
             where district is not null
               and (eff_st is null or state = any(eff_st))
               and (eff_di is null or district = any(eff_di))) s), '[]'::jsonb),
        'kros', coalesce((select jsonb_agg(x order by x) from (
            select distinct kro x from agent.despatch
             where kro is not null and (eff_st is null or state = any(eff_st))) s), '[]'::jsonb),
        'krms', coalesce((select jsonb_agg(x order by x) from (
            select distinct krm x from agent.despatch
             where krm is not null and (eff_st is null or state = any(eff_st))) s), '[]'::jsonb),
        'brands', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'display', display)
                    order by sort_order) from agent.brand_display), '[]'::jsonb),
        'products', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'display', name)
                    order by sort_order) from agent.product_display), '[]'::jsonb),
        'scoped', (scope_st is not null or scope_di is not null),
        'role', s_user.field_role
      ) into result;

    when 'meta' then
      select jsonb_build_object(
        'last_despatch', (select max(despatch_date) from agent.despatch),
        'rows_despatch', (select count(*) from agent.despatch),
        'rows_pending',  (select count(*) from agent.pending),
        'server_time', now(),
        'user', jsonb_build_object('name', coalesce(s_user.display_name, s_user.username),
                                   'role', s_user.field_role)
      ) into result;

    -- ---------- plan vs actual ----------
    when 'plan' then
      if f_month is null then select max(plan_month) into f_month from agent.board_plan; end if;
      select jsonb_build_object(
        'month', f_month,
        'months', coalesce((select jsonb_agg(distinct plan_month order by plan_month desc)
                            from agent.board_plan), '[]'::jsonb),
        'coverage', coalesce((select to_jsonb(c) from agent.plan_coverage c
                              where c.plan_month = f_month), '{}'::jsonb),
        'summary', coalesce((select jsonb_build_object(
              'target_mt', round(sum(target_mt),2),
              'actual_mt', round(sum(actual_mt),2),
              'gap_mt',    round(sum(actual_mt) - sum(target_mt),2),
              'achievement_pct', round(100.0*sum(actual_mt)/nullif(sum(target_mt),0),1),
              'customers', count(*),
              'met', count(*) filter (where status='MET'),
              'no_despatch', count(*) filter (where status='NO DESPATCH'))
            from agent.board_plan p
            where p.plan_month = f_month
              and (eff_st is null or p.state = any(eff_st))
              and (eff_di is null or p.district = any(eff_di))
              and (f_kro is null or p.kro = f_kro)), '{}'::jsonb),
        'by_kro', coalesce((select jsonb_agg(to_jsonb(k)) from (
              select p.kro, round(sum(p.target_mt),2) target_mt, round(sum(p.actual_mt),2) actual_mt,
                     round(100.0*sum(p.actual_mt)/nullif(sum(p.target_mt),0),1) achievement_pct,
                     count(*) customers
              from agent.board_plan p
              where p.plan_month = f_month and p.kro is not null
                and (eff_st is null or p.state = any(eff_st))
                and (eff_di is null or p.district = any(eff_di))
              group by p.kro order by 2 desc nulls last) k), '[]'::jsonb),
        'rows', coalesce((select jsonb_agg(to_jsonb(r)) from (
              select p.customer, p.state, p.district, p.kro, p.target_mt, p.actual_mt,
                     p.gap_mt, p.achievement_pct, p.status, p.last_despatch
              from agent.board_plan p
              where p.plan_month = f_month
                and (eff_st is null or p.state = any(eff_st))
                and (eff_di is null or p.district = any(eff_di))
                and (f_kro is null or p.kro = f_kro)
                and (f_status is null or p.status = f_status)
                and (f_search is null or p.customer ilike '%' || f_search || '%')
              order by p.target_mt desc nulls last limit lim) r), '[]'::jsonb)
      ) into result;

    -- ---------- dealer 360 ----------
    when 'dealer360' then
      if f_dealer is null then return jsonb_build_object('ok', false, 'error', 'dealer_required'); end if;
      if not exists (select 1 from agent.despatch d where d.dealer = f_dealer
                      and (eff_st is null or d.state = any(eff_st))
                      and (eff_di is null or d.district = any(eff_di))) then
        return jsonb_build_object('ok', false, 'error', 'out_of_scope');
      end if;
      select jsonb_build_object(
        'dealer', f_dealer,
        'profile', (select jsonb_build_object('state', min(d.state), 'district', min(d.district),
                      'kro', min(d.kro), 'krm', min(d.krm),
                      'first_despatch', min(d.despatch_date), 'last_despatch', max(d.despatch_date),
                      'lifetime_mt', round(sum(d.qty_mt),2), 'invoices', count(distinct d.invoice_no))
                    from agent.despatch d where d.dealer = f_dealer),
        'period', jsonb_build_object('from', d_from, 'to', d_to,
                    'mt', coalesce((select round(sum(qty_mt),2) from agent.despatch
                                    where dealer = f_dealer and despatch_date between d_from and d_to), 0)),
        'monthly', coalesce((select jsonb_agg(to_jsonb(t)) from agent.board_trend(
                      'month', (current_date - interval '13 months')::date, current_date,
                      null, null, null, null, f_dealer, null, null) t), '[]'::jsonb),
        'products', coalesce((select jsonb_agg(to_jsonb(b)) from agent.board_query(
                      'product', d_from, d_to, null, null, null, null, f_dealer, null, null, null, 20) b), '[]'::jsonb),
        'pending', coalesce((select jsonb_agg(to_jsonb(p)) from (
                      select order_date, product, pending_mt, age_days, age_bucket
                      from agent.pending where dealer = f_dealer
                      order by age_days desc nulls last limit 30) p), '[]'::jsonb),
        'pending_mt', coalesce((select round(sum(pending_mt),2) from agent.pending where dealer = f_dealer), 0),
        'plan', coalesce((select jsonb_agg(to_jsonb(pl)) from (
                      select plan_month, target_mt, actual_mt, achievement_pct, status
                      from agent.board_plan where customer = f_dealer
                      order by plan_month desc limit 12) pl), '[]'::jsonb),
        'recent', coalesce((select jsonb_agg(to_jsonb(l)) from agent.board_lines(
                      '2000-01-01'::date, current_date, null, null, null, null,
                      f_dealer, null, null, null, 25) l), '[]'::jsonb)
      ) into result;

    -- ---------- executive 360 ----------
    when 'exec360' then
      if f_kro is null then return jsonb_build_object('ok', false, 'error', 'kro_required'); end if;
      select jsonb_build_object(
        'kro', f_kro,
        'period', jsonb_build_object('from', d_from, 'to', d_to,
                    'total', coalesce((select to_jsonb(t) from agent.board_total(
                       d_from, d_to, eff_st, eff_di, f_kro, null, null, null, null, null) t), '{}'::jsonb)),
        'monthly', coalesce((select jsonb_agg(to_jsonb(t)) from agent.board_trend(
                      'month', (current_date - interval '13 months')::date, current_date,
                      eff_st, eff_di, f_kro, null, null, null, null) t), '[]'::jsonb),
        'dealers', coalesce((select jsonb_agg(to_jsonb(b)) from agent.board_query(
                      'dealer', d_from, d_to, eff_st, eff_di, f_kro, null, null, null, null, null, 100) b), '[]'::jsonb),
        'districts', coalesce((select jsonb_agg(to_jsonb(b)) from agent.board_query(
                      'district', d_from, d_to, eff_st, eff_di, f_kro, null, null, null, null, null, 50) b), '[]'::jsonb),
        'products', coalesce((select jsonb_agg(to_jsonb(b)) from agent.board_query(
                      'product', d_from, d_to, eff_st, eff_di, f_kro, null, null, null, null, null, 20) b), '[]'::jsonb),
        'pending_mt', coalesce((select round(sum(pending_mt),2) from agent.pending where kro = f_kro), 0),
        'plan', coalesce((select to_jsonb(k) from (
                      select round(sum(target_mt),2) target_mt, round(sum(actual_mt),2) actual_mt,
                             round(100.0*sum(actual_mt)/nullif(sum(target_mt),0),1) achievement_pct,
                             count(*) customers, max(plan_month) plan_month
                      from agent.board_plan
                      where kro = f_kro and plan_month = (select max(plan_month) from agent.board_plan)) k), '{}'::jsonb)
      ) into result;

    else
      return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;

  return jsonb_build_object('ok', true, 'data', coalesce(result, '[]'::jsonb));
exception when others then
  return jsonb_build_object('ok', false, 'error', 'request_failed');
end $function$
;
GRANT EXECUTE ON FUNCTION agent_api2(text,jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION agent_api2(text,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION agent_api2(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION agent_api2(text,jsonb) TO service_role;

-- agent_api_wrapped(text,jsonb)
CREATE OR REPLACE FUNCTION public.agent_api_wrapped(action text, params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare
  s_user   public.chat_users;
  s_token  uuid;
  scope_st text[] := null;      -- null = all states
  scope_di text[] := null;
  result   jsonb;
  lim int  := least(coalesce((params->>'limit')::int, 50), 500);
  f_state  text := nullif(params->>'state', '');
  f_district text := nullif(params->>'district', '');
  f_kro    text := nullif(params->>'kro', '');
  f_search text := nullif(params->>'search', '');
  f_status text := nullif(params->>'status', '');
  f_sev    text := nullif(params->>'severity', '');
  f_scope  text := nullif(params->>'scope', '');
begin
  -- ---- authenticate ----
  begin
    s_token := (params->>'token')::uuid;
  exception when others then
    s_token := null;
  end;

  if s_token is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  select cu.* into s_user
    from agent.app_sessions ses
    join public.chat_users cu on cu.user_id = ses.user_id
   where ses.token = s_token and ses.expires_at > now() and cu.is_active;

  if s_user.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'session_expired');
  end if;

  update agent.app_sessions set last_seen = now() where token = s_token;

  -- ---- territory scope ----
  if coalesce(s_user.field_role, '') not in ('ALL', 'ADMIN') then
    if array_length(s_user.scope_states, 1) > 0 then
      select array_agg(coalesce(sd.display, initcap(x)))
        into scope_st
        from unnest(s_user.scope_states) x
        left join agent.state_display sd on sd.code = upper(x);
    end if;
    if array_length(s_user.scope_districts, 1) > 0 then
      scope_di := s_user.scope_districts;
    end if;
  end if;

  -- ---- data ----
  case action

    when 'summary' then
      select to_jsonb(k) into result from agent.kpi_summary k;

    when 'states' then
      select coalesce(jsonb_agg(to_jsonb(s) order by s.mt desc nulls last), '[]'::jsonb) into result
        from agent.board_state s
       where scope_st is null or s.state = any(scope_st);

    when 'districts' then
      select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into result
        from (select * from agent.board_district
               where (scope_st is null or state = any(scope_st))
                 and (scope_di is null or district = any(scope_di))
                 and (f_state is null or state = f_state)
                 and (f_search is null or district ilike '%' || f_search || '%')
               order by public.severity_rank_of(severity), loss_mt desc nulls last
               limit lim) d;

    when 'products' then
      select coalesce(jsonb_agg(to_jsonb(p) order by p.mt desc), '[]'::jsonb)
        into result from agent.board_product p;

    when 'dealers' then
      select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into result
        from (select * from agent.board_dealer
               where (scope_st is null or state = any(scope_st))
                 and (scope_di is null or district = any(scope_di))
                 and (f_state is null or state = f_state)
                 and (f_district is null or district = f_district)
                 and (f_kro is null or kro = f_kro)
                 and (f_search is null or dealer ilike '%' || f_search || '%')
                 and (f_status is null or status = f_status)
               order by mt desc nulls last, avg_mt_per_month desc nulls last
               limit lim) d;

    when 'executives' then
      select coalesce(jsonb_agg(to_jsonb(e) order by e.mt desc nulls last), '[]'::jsonb)
        into result from agent.board_executive e
       where scope_st is null or e.territory ilike '%' || scope_st[1] || '%';

    when 'alerts' then
      select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into result
        from (select * from agent.alerts
               where (scope_st is null or state = any(scope_st) or state is null)
                 and (f_sev is null or severity = f_sev)
                 and (f_scope is null or scope = f_scope)
               order by severity_rank, loss_mt desc nulls last
               limit lim) a;

    when 'pending_age' then
      select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order), '[]'::jsonb)
        into result from agent.pending_age p;

    when 'pending_state' then
      select coalesce(jsonb_agg(to_jsonb(p) order by p.mt desc), '[]'::jsonb) into result
        from agent.pending_state p where scope_st is null or p.state = any(scope_st);

    when 'trend_daily' then
      select coalesce(jsonb_agg(to_jsonb(t) order by t.day), '[]'::jsonb)
        into result from agent.trend_daily t;

    when 'trend_monthly' then
      select coalesce(jsonb_agg(to_jsonb(t) order by t.month), '[]'::jsonb)
        into result from agent.trend_monthly t;

    when 'freshness' then
      select jsonb_build_object(
               'latest_despatch', (select max(despatch_date) from agent.despatch),
               'files', (select coalesce(jsonb_agg(jsonb_build_object(
                   'file', file_name, 'table', target_table, 'rows', row_count,
                   'status', status, 'loaded_at', last_ingested_at) order by last_ingested_at desc), '[]'::jsonb)
                 from public.file_hashes)) into result;

    when 'board_home' then
      select jsonb_build_object(
        'summary', (select to_jsonb(k) from agent.kpi_summary k),
        'states',  (select coalesce(jsonb_agg(to_jsonb(s) order by s.mt desc nulls last), '[]'::jsonb)
                      from agent.board_state s where scope_st is null or s.state = any(scope_st)),
        'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.mt desc), '[]'::jsonb) from agent.board_product p),
        'pending_age', (select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order), '[]'::jsonb) from agent.pending_age p),
        'trend_monthly', (select coalesce(jsonb_agg(to_jsonb(t) order by t.month), '[]'::jsonb) from agent.trend_monthly t),
        'trend_daily', (select coalesce(jsonb_agg(to_jsonb(t) order by t.day), '[]'::jsonb) from agent.trend_daily t),
        'districts', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from
                       (select * from agent.board_district
                         where (scope_st is null or state = any(scope_st))
                           and coalesce(prev_mt,0) >= 5
                         order by public.severity_rank_of(severity), loss_mt desc nulls last limit 6) d),
        'alerts',  (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from
                     (select * from agent.alerts
                       where (scope_st is null or state = any(scope_st) or state is null)
                       order by severity_rank, loss_mt desc nulls last limit 15) a),
        'latest_despatch', (select max(despatch_date) from agent.despatch)) into result;

    else
      return jsonb_build_object('ok', false, 'error', 'unknown action: ' || action);
  end case;

  return jsonb_build_object(
    'ok', true, 'action', action, 'data', coalesce(result, '[]'::jsonb),
    'user', jsonb_build_object('name', s_user.display_name, 'field_role', s_user.field_role,
                               'scoped', scope_st is not null),
    'generated_at', now());
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_api_wrapped(text,jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION agent_api_wrapped(text,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION agent_api_wrapped(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION agent_api_wrapped(text,jsonb) TO service_role;

-- agent_app_html(text)
CREATE OR REPLACE FUNCTION public.agent_app_html(p_name text DEFAULT 'app'::text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'agent', 'pg_temp'
AS $function$
  select content from agent.app_assets where name = coalesce(p_name, 'app');
$function$
;
GRANT EXECUTE ON FUNCTION agent_app_html(text) TO service_role;

-- agent_approve_reset(text,bigint)
CREATE OR REPLACE FUNCTION public.agent_approve_reset(p_token text, p_request_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare s_user public.chat_users; r agent.reset_requests; new_token uuid;
begin
  select cu.* into s_user
    from agent.app_sessions ses
    join public.chat_users cu on cu.user_id = ses.user_id
   where ses.token = (p_token)::uuid and ses.expires_at > now() and cu.is_active;

  if s_user.user_id is null or coalesce(s_user.field_role,'') not in ('ALL','ADMIN') then
    return jsonb_build_object('ok', false, 'error', 'Not allowed.');
  end if;

  select * into r from agent.reset_requests where id = p_request_id and status = 'pending' for update;
  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'That request is no longer open.');
  end if;

  new_token := gen_random_uuid();
  insert into agent.password_resets (token, user_id, expires_at, created_for)
  values (new_token, r.user_id, now() + interval '24 hours', r.username);

  update agent.reset_requests
     set status = 'approved', handled_by = s_user.username, handled_at = now(), reset_token = new_token
   where id = r.id;

  return jsonb_build_object('ok', true, 'username', r.username, 'reset_token', new_token::text);
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_approve_reset(text,bigint) TO service_role;

-- agent_change_password(text,text,text)
CREATE OR REPLACE FUNCTION public.agent_change_password(p_token text, p_old text, p_new text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'extensions', 'pg_temp'
AS $function$
declare s_user public.chat_users;
begin
  if coalesce(p_token,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'Please sign in again.');
  end if;

  select cu.* into s_user
    from agent.app_sessions ses
    join public.chat_users cu on cu.user_id = ses.user_id
   where ses.token = (p_token)::uuid and ses.expires_at > now() and cu.is_active;

  if s_user.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Please sign in again.');
  end if;

  if p_new is null or length(p_new) < 8 then
    insert into agent.admin_log (actor, action, subject, detail)
    values (s_user.username, 'change_password_rejected', s_user.username, jsonb_build_object('why','too short'));
    return jsonb_build_object('ok', false, 'error', 'Your new password needs at least 8 characters.');
  end if;
  if p_new = p_old then
    return jsonb_build_object('ok', false, 'error', 'The new password must be different from the old one.');
  end if;
  if btrim(p_new) <> p_new then
    return jsonb_build_object('ok', false, 'error', 'Your new password starts or ends with a space. Remove it and try again.');
  end if;
  if s_user.password_hash is null or s_user.password_hash <> crypt(coalesce(p_old,''), s_user.password_hash) then
    insert into agent.admin_log (actor, action, subject, detail)
    values (s_user.username, 'change_password_rejected', s_user.username, jsonb_build_object('why','wrong current password'));
    return jsonb_build_object('ok', false, 'error', 'Your current password is not correct.');
  end if;

  update public.chat_users
     set password_hash = crypt(p_new, gen_salt('bf', 10))
   where user_id = s_user.user_id;

  delete from agent.app_sessions
   where user_id = s_user.user_id and token <> (p_token)::uuid;

  insert into agent.admin_log (actor, action, subject, detail)
  values (s_user.username, 'change_password', s_user.username, jsonb_build_object('length', length(p_new)));

  return jsonb_build_object('ok', true, 'message', 'Password changed. Other devices have been signed out.');
exception when others then
  return jsonb_build_object('ok', false, 'error', 'Could not change the password. Please try again.');
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_change_password(text,text,text) TO service_role;

-- agent_gateway(text,jsonb)
CREATE OR REPLACE FUNCTION public.agent_gateway(action text, params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'agent', 'pg_temp'
AS $function$
begin
  if action = 'login' then
    return public.agent_login(params->>'username', params->>'password', params->>'agent');
  elsif action = 'logout' then
    delete from agent.app_sessions where token = (params->>'token')::uuid;
    return jsonb_build_object('ok', true);
  elsif action = 'reset_info' then
    return public.agent_reset_info(params->>'reset');
  elsif action = 'set_password' then
    return public.agent_set_password(params->>'reset', params->>'password');
  elsif action = 'change_password' then
    return public.agent_change_password(params->>'token', params->>'current', params->>'password');
  elsif action = 'request_reset' then
    return public.agent_request_reset(params->>'username', params->>'agent');
  elsif action = 'list_resets' then
    return public.agent_list_resets(params->>'token');
  elsif action = 'approve_reset' then
    return public.agent_approve_reset(params->>'token', (params->>'request_id')::bigint);
  elsif action = 'admin_users' then
    return public.agent_admin_users(params->>'token');
  elsif action = 'admin_set_user' then
    return public.agent_admin_set_user(params->>'token', params->>'user_id', coalesce(params->'patch','{}'::jsonb));
  elsif action = 'admin_activity' then
    return public.agent_admin_activity(params->>'token', (params->>'limit')::int);
  elsif action = 'admin_health' then
    return public.agent_admin_health(params->>'token');
  elsif action in ('board','trend','lines','filters','meta','plan','dealer360','exec360') then
    return public.agent_api2(action, params);
  else
    return public.agent_api_wrapped(action, params);
  end if;
exception when others then
  return jsonb_build_object('ok', false, 'error', 'request_failed');
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_gateway(text,jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION agent_gateway(text,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION agent_gateway(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION agent_gateway(text,jsonb) TO service_role;

-- agent_list_resets(text)
CREATE OR REPLACE FUNCTION public.agent_list_resets(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare s_user public.chat_users; out_rows jsonb;
begin
  select cu.* into s_user
    from agent.app_sessions ses
    join public.chat_users cu on cu.user_id = ses.user_id
   where ses.token = (p_token)::uuid and ses.expires_at > now() and cu.is_active;

  if s_user.user_id is null or coalesce(s_user.field_role,'') not in ('ALL','ADMIN') then
    return jsonb_build_object('ok', false, 'error', 'Not allowed.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'username', r.username, 'name', cu.display_name,
           'requested_at', r.requested_at) order by r.requested_at desc), '[]'::jsonb)
    into out_rows
    from agent.reset_requests r
    left join public.chat_users cu on cu.user_id = r.user_id
   where r.status = 'pending';

  return jsonb_build_object('ok', true, 'rows', out_rows);
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_list_resets(text) TO service_role;

-- agent_login(text,text,text)
CREATE OR REPLACE FUNCTION public.agent_login(p_username text, p_password text, p_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'extensions', 'pg_temp'
AS $function$
declare u public.chat_users; t uuid;
begin
  select * into u from public.chat_users
   where lower(username) = lower(trim(p_username)) and is_active;

  insert into public.chat_login_attempts(username, succeeded)
  values (trim(p_username), u.user_id is not null
          and u.password_hash = crypt(p_password, u.password_hash));

  if u.user_id is null or u.password_hash <> crypt(p_password, u.password_hash) then
    return jsonb_build_object('ok', false, 'error', 'Wrong username or password');
  end if;

  insert into agent.app_sessions(user_id, user_agent) values (u.user_id, p_agent)
  returning token into t;

  return jsonb_build_object(
    'ok', true,
    'token', t,
    'user', jsonb_build_object(
      'name', u.display_name, 'username', u.username, 'role', u.role,
      'field_role', u.field_role,
      'scope_states', u.scope_states, 'scope_districts', u.scope_districts,
      'can_manage', u.field_role in ('ALL','ADMIN')));
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_login(text,text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION agent_login(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION agent_login(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION agent_login(text,text,text) TO service_role;

-- agent_metrics(text)
CREATE OR REPLACE FUNCTION public.agent_metrics(p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'pg_temp'
AS $function$
declare
  s_user public.chat_users;
  avail  text;
  gaps   text;
begin
  if coalesce(p_token,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'This session is not valid. Please sign in again.');
  end if;

  select cu.* into s_user
    from agent.app_sessions ses
    join public.chat_users cu on cu.user_id = ses.user_id
   where ses.token = (p_token)::uuid and ses.expires_at > now() and cu.is_active;

  if s_user.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'This session is not valid. Please sign in again.');
  end if;

  select string_agg(
           m.name || ' -- ' || m.description
           || coalesce(' Formula: ' || m.formula || '.', '')
           || coalesce(' Read it from ' || m.source || '.', '')
           || coalesce(' Unit ' || m.unit || '.', '')
           || coalesce(' Note: ' || m.note, ''),
           chr(10) order by m.sort_order)
    into avail
    from agent.metrics m
   where m.status = 'available'
     and (m.security_class <> 'restricted' or coalesce(s_user.field_role,'') in ('ALL','ADMIN'));

  select string_agg(m.name || ' -- ' || m.description || coalesce(' ' || m.note, ''), chr(10) order by m.sort_order)
    into gaps
    from agent.metrics m
   where m.status = 'not_connected';

  return jsonb_build_object(
    'ok', true,
    'dictionary', 'DEFINED BUSINESS METRICS -- use these definitions, never invent your own.' || chr(10)
                  || coalesce(avail, 'none') || chr(10) || chr(10)
                  || 'NOT CONNECTED -- there is no data for these. If the question is about one of them, produce no SQL at all and reply with the single word NODATA followed by the metric name. Never substitute a different metric.' || chr(10)
                  || coalesce(gaps, 'none'),
    'count', (select count(*) from agent.metrics));
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_metrics(text) TO service_role;

-- agent_request_reset(text,text)
CREATE OR REPLACE FUNCTION public.agent_request_reset(p_username text, p_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'pg_temp'
AS $function$
declare u public.chat_users; recent int;
begin
  select * into u from public.chat_users
   where lower(username) = lower(btrim(coalesce(p_username,''))) and is_active;

  if u.user_id is not null then
    select count(*) into recent from agent.reset_requests
     where user_id = u.user_id and status = 'pending' and requested_at > now() - interval '2 hours';
    if recent = 0 then
      insert into agent.reset_requests (user_id, username, user_agent)
      values (u.user_id, u.username, left(coalesce(p_agent,''), 200));
    end if;
  end if;

  return jsonb_build_object('ok', true,
    'message', 'Request sent. The administrator will send you a reset link.');
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_request_reset(text,text) TO service_role;

-- agent_run_sql(text,text,integer,text)
CREATE OR REPLACE FUNCTION public.agent_run_sql(p_token text, p_sql text, p_limit integer DEFAULT 200, p_question text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'pg_temp'
AS $function$
declare
  s_user   public.chat_users;
  q        text := btrim(coalesce(p_sql, ''));
  lowered  text;
  rows_j   json;
  cols     text[] := '{}';
  n        int;
  t0       timestamptz := clock_timestamp();
  caveat   text := null;
  cov      record;
  banned   text[] := array['insert','update','delete','drop','alter','create','truncate','grant',
                           'revoke','copy','vacuum','call','do ','merge','listen',
                           'notify','set ','reset ','begin','commit','rollback','security',
                           'pg_sleep','dblink','pg_read_file','lo_import','lo_export'];
  allowed  text[] := array['alerts','board_dealer','board_district','board_executive',
                           'board_product','board_state','board_plan','board_plan_kro',
                           'plan_target','plan_coverage','plan_unmatched','cycle','despatch','kpi_summary',
                           'mv_despatch','mv_pending','pending','pending_age','pending_state',
                           'product_display','state_display','trend_daily','trend_monthly'];
  ctes     text[] := '{}';
  w        text;
  ref      text;
  msg      text;
begin
  if coalesce(p_token,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'This session is not valid. Please sign in again.');
  end if;

  select cu.* into s_user
    from agent.app_sessions ses
    join public.chat_users cu on cu.user_id = ses.user_id
   where ses.token = (p_token)::uuid and ses.expires_at > now() and cu.is_active;

  if s_user.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'This session is not valid. Please sign in again.');
  end if;

  if coalesce(s_user.field_role, '') not in ('ALL', 'ADMIN') then
    msg := 'Typed questions are limited to full-access accounts. Use the suggested questions instead.';
    insert into agent.ai_queries (user_id, username, field_role, question, sql_text, ok, error)
    values (s_user.user_id::text, s_user.username, s_user.field_role, p_question, q, false, msg);
    return jsonb_build_object('ok', false, 'error', msg);
  end if;

  q := regexp_replace(q, ';\s*$', '');
  lowered := lower(q);

  msg := null;
  if q = '' then msg := 'No query was produced.';
  elsif position(';' in q) > 0 then msg := 'Only one statement is allowed.';
  elsif lowered !~ '^\s*(select|with)\s' then msg := 'Only SELECT queries are allowed.';
  elsif lowered ~ '(--|/\*)' then msg := 'Comments are not allowed in the query.';
  elsif position('"' in q) > 0 then msg := 'Quoted identifiers are not allowed in the query.';
  end if;

  if msg is null then
    foreach w in array banned loop
      if lowered ~ ('(^|[^a-z_])' || w) then
        msg := 'That query used a keyword that is not permitted.';
        exit;
      end if;
    end loop;
  end if;

  if msg is null and lowered ~ '(pg_catalog|information_schema|pg_|auth\.|storage\.|public\.|app_sessions|password_resets|chat_users|ai_queries|admin_log|reset_requests)' then
    msg := 'Only the agent reporting views may be queried.';
  end if;

  if msg is null then
    select coalesce(array_agg(m[1]), '{}')
      into ctes
      from regexp_matches(lowered, '(?:with|,)\s+([a-z_][a-z0-9_]*)\s+as\s*\(', 'g') m;

    for ref in
      select regexp_replace(m[1], '^agent\.', '')
        from regexp_matches(lowered, '(?:from|join)\s+([a-z_][a-z0-9_.]*)', 'g') m
    loop
      if not (ref = any(allowed) or ref = any(ctes)) then
        msg := 'Only the agent reporting views may be queried (found: ' || ref || ').';
        exit;
      end if;
    end loop;
  end if;

  if msg is not null then
    insert into agent.ai_queries (user_id, username, field_role, question, sql_text, ok, error, duration_ms)
    values (s_user.user_id::text, s_user.username, s_user.field_role, p_question, q, false, msg,
            extract(milliseconds from clock_timestamp() - t0)::int);
    return jsonb_build_object('ok', false, 'error', msg);
  end if;

  set local statement_timeout = '8s';
  set local work_mem = '32MB';

  execute format(
    'select coalesce(json_agg(t), ''[]''::json) from (select * from (%s) q limit %s) t',
    q, least(greatest(coalesce(p_limit, 200), 1), 500))
  into rows_j;

  n := json_array_length(coalesce(rows_j, '[]'::json));
  if n > 0 then
    select array_agg(k) into cols from json_object_keys(rows_j -> 0) k;
  end if;

  if lowered ~ '(board_plan|board_plan_kro|plan_target)' then
    select * into cov from agent.plan_coverage order by plan_month desc limit 1;
    if found and coalesce(cov.tonnage_match_pct, 100) < 100 then
      caveat := 'Plan vs actual is matched by customer name. For '
             || to_char(cov.plan_month, 'Mon YYYY') || ', '
             || cov.matched_dealers || ' of ' || cov.planned_dealers
             || ' planned customers (' || cov.tonnage_match_pct
             || '% of planned tonnage) match a name in the despatch records. '
             || 'The rest will show as no despatch even if they did buy under a different spelling.';
    end if;
  end if;

  insert into agent.ai_queries (user_id, username, field_role, question, sql_text, ok, row_count, duration_ms)
  values (s_user.user_id::text, s_user.username, s_user.field_role, p_question, q, true, n,
          extract(milliseconds from clock_timestamp() - t0)::int);

  return jsonb_build_object('ok', true, 'rows', coalesce(rows_j, '[]'::json)::jsonb,
                            'columns', to_jsonb(coalesce(cols, '{}'::text[])),
                            'row_count', n, 'sql', q, 'caveat', caveat);
exception when others then
  msg := 'Query failed: ' || left(sqlerrm, 200);
  begin
    insert into agent.ai_queries (user_id, username, field_role, question, sql_text, ok, error, duration_ms)
    values (coalesce(s_user.user_id::text,'?'), s_user.username, s_user.field_role, p_question, q, false, msg,
            extract(milliseconds from clock_timestamp() - t0)::int);
  exception when others then null; end;
  return jsonb_build_object('ok', false, 'error', msg, 'sql', q);
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_run_sql(text,text,integer,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION agent_run_sql(text,text,integer,text) TO anon;
GRANT EXECUTE ON FUNCTION agent_run_sql(text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION agent_run_sql(text,text,integer,text) TO service_role;

-- agent_set_password(text,text)
CREATE OR REPLACE FUNCTION public.agent_set_password(p_token text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'agent', 'public', 'extensions', 'pg_temp'
AS $function$
declare pr agent.password_resets; uname text;
begin
  if p_password is null or length(p_password) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Use at least 8 characters.');
  end if;

  select * into pr from agent.password_resets
   where token = (p_token)::uuid and used_at is null and expires_at > now()
   for update;

  if pr.token is null then
    return jsonb_build_object('ok', false, 'error', 'This link is no longer valid. Ask for a new one.');
  end if;

  update public.chat_users
     set password_hash = crypt(p_password, gen_salt('bf', 10))
   where user_id = pr.user_id
   returning username into uname;

  update agent.password_resets set used_at = now() where token = pr.token;
  -- sign out any existing app sessions for that person
  delete from agent.app_sessions where user_id = pr.user_id;

  return jsonb_build_object('ok', true, 'username', uname);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'Could not set the password. Try the link again.');
end;
$function$
;
GRANT EXECUTE ON FUNCTION agent_set_password(text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION agent_set_password(text,text) TO anon;
GRANT EXECUTE ON FUNCTION agent_set_password(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION agent_set_password(text,text) TO service_role;
