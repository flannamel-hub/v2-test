-- BLOG 图床域名治理 P3：共享配置、不可变事件和 service-role-only 原子 RPC。
-- revision: 20260809-image-host-p3-v1
-- 执行顺序：preflight-image-host-governance-p3.sql -> 本文件 -> verify-image-host-governance-p3.sql

begin;

do $$
begin
  if to_regclass('public.blog_revalidate_queue') is null then
    raise exception 'image host P3 blocked: public.blog_revalidate_queue is missing';
  end if;

  if to_regclass('public.blog_image_host_config') is not null
     or to_regclass('public.blog_image_host_events') is not null
     or to_regprocedure('public.normalize_blog_image_host_origin(text)') is not null
     or to_regprocedure('public.normalize_blog_image_host_origins(text[])') is not null
     or to_regprocedure('public.validate_blog_image_host_summary(jsonb)') is not null
     or to_regprocedure(
       'public.activate_blog_image_host_config(bigint,text,text,text[],uuid,text,jsonb)'
     ) is not null
     or to_regprocedure(
       'public.rollback_blog_image_host_config(bigint,uuid,text,jsonb)'
     ) is not null then
    raise exception 'image host P3 blocked: target objects already exist or are partially installed';
  end if;
end;
$$;

create function public.normalize_blog_image_host_origin(p_origin text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_origin text := lower(btrim(p_origin));
  v_host_port text;
  v_host text;
  v_port_text text;
  v_port integer;
  v_labels text[];
  v_label text;
begin
  if v_origin !~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?$' then
    raise exception 'image host origin must be an HTTPS domain origin without path, query, hash, or userinfo';
  end if;

  v_host_port := substring(v_origin from 9);

  if position(':' in v_host_port) > 0 then
    v_host := split_part(v_host_port, ':', 1);
    v_port_text := split_part(v_host_port, ':', 2);
    v_port := v_port_text::integer;

    if v_port < 1 or v_port > 65535 then
      raise exception 'image host origin port must be between 1 and 65535';
    end if;
  else
    v_host := v_host_port;
    v_port := null;
  end if;

  if char_length(v_host) > 253 then
    raise exception 'image host domain is too long';
  end if;

  v_labels := string_to_array(v_host, '.');
  if coalesce(array_length(v_labels, 1), 0) < 2 then
    raise exception 'image host origin must use a fully qualified domain';
  end if;

  foreach v_label in array v_labels loop
    if char_length(v_label) < 1
       or char_length(v_label) > 63
       or v_label !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then
      raise exception 'image host domain contains an invalid label';
    end if;
  end loop;

  if v_labels[array_length(v_labels, 1)] !~ '[a-z]' then
    raise exception 'image host origin must use a domain name, not an IP address';
  end if;

  return 'https://' || v_host ||
    case when v_port is null or v_port = 443 then '' else ':' || v_port::text end;
end;
$$;

create function public.normalize_blog_image_host_origins(p_origins text[])
returns text[]
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_result text[] := '{}'::text[];
  v_item text;
  v_origin text;
begin
  foreach v_item in array coalesce(p_origins, '{}'::text[]) loop
    if v_item is null then
      raise exception 'image host legacy origins cannot contain null';
    end if;

    v_origin := public.normalize_blog_image_host_origin(v_item);
    if not (v_origin = any(v_result)) then
      v_result := array_append(v_result, v_origin);
    end if;
  end loop;

  return v_result;
end;
$$;

create function public.validate_blog_image_host_summary(p_summary jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_summary jsonb := coalesce(p_summary, '{}'::jsonb);
  v_text text;
begin
  if jsonb_typeof(v_summary) <> 'object' then
    raise exception 'image host validation summary must be a JSON object';
  end if;

  v_text := v_summary::text;
  if octet_length(v_text) > 8192 then
    raise exception 'image host validation summary exceeds 8192 bytes';
  end if;

  if v_text ~* '"[^"\\]*(token|cookie|authorization|password|secret)[^"\\]*"[[:space:]]*:' then
    raise exception 'image host validation summary contains a forbidden sensitive key';
  end if;

  return v_summary;
end;
$$;

create table public.blog_image_host_config (
  id smallint primary key,
  upload_api_origin text not null,
  public_asset_origin text not null,
  legacy_asset_origins text[] not null default '{}'::text[],
  version bigint not null default 1,
  updated_by uuid,
  reason text not null,
  updated_at timestamptz not null default now(),
  constraint blog_image_host_config_singleton_check check (id = 1),
  constraint blog_image_host_config_upload_origin_check check (
    upload_api_origin = public.normalize_blog_image_host_origin(upload_api_origin)
  ),
  constraint blog_image_host_config_public_origin_check check (
    public_asset_origin = public.normalize_blog_image_host_origin(public_asset_origin)
  ),
  constraint blog_image_host_config_legacy_origins_check check (
    legacy_asset_origins = public.normalize_blog_image_host_origins(legacy_asset_origins)
  ),
  constraint blog_image_host_config_current_not_legacy_check check (
    not (public_asset_origin = any(legacy_asset_origins))
  ),
  constraint blog_image_host_config_version_check check (version >= 1),
  constraint blog_image_host_config_reason_check check (
    char_length(btrim(reason)) between 3 and 500
  )
);

create table public.blog_image_host_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  previous_version bigint not null,
  new_version bigint not null,
  previous_config jsonb not null,
  new_config jsonb not null,
  actor_id uuid not null,
  reason text not null,
  validation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint blog_image_host_events_type_check check (
    event_type in ('activate', 'rollback')
  ),
  constraint blog_image_host_events_version_check check (
    previous_version >= 1 and new_version = previous_version + 1
  ),
  constraint blog_image_host_events_previous_config_check check (
    jsonb_typeof(previous_config) = 'object'
  ),
  constraint blog_image_host_events_new_config_check check (
    jsonb_typeof(new_config) = 'object'
  ),
  constraint blog_image_host_events_reason_check check (
    char_length(btrim(reason)) between 3 and 500
  ),
  constraint blog_image_host_events_validation_summary_check check (
    validation_summary = public.validate_blog_image_host_summary(validation_summary)
  ),
  constraint blog_image_host_events_new_version_key unique (new_version)
);

create index blog_image_host_events_created_at_idx
  on public.blog_image_host_events (created_at desc);

alter table public.blog_image_host_config enable row level security;
alter table public.blog_image_host_config force row level security;
alter table public.blog_image_host_events enable row level security;
alter table public.blog_image_host_events force row level security;

insert into public.blog_image_host_config (
  id,
  upload_api_origin,
  public_asset_origin,
  legacy_asset_origins,
  version,
  updated_by,
  reason
)
values (
  1,
  'https://img.x1file.top',
  'https://img.x1file.top',
  '{}'::text[],
  1,
  null,
  'P3 bootstrap: preserve the current production image host behavior'
);

create function public.activate_blog_image_host_config(
  p_expected_version bigint,
  p_upload_api_origin text,
  p_public_asset_origin text,
  p_legacy_asset_origins text[],
  p_actor_id uuid,
  p_reason text,
  p_validation_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current public.blog_image_host_config%rowtype;
  v_previous_config jsonb;
  v_new_config jsonb;
  v_upload_origin text;
  v_public_origin text;
  v_legacy_origins text[];
  v_reason text := btrim(p_reason);
  v_validation_summary jsonb;
  v_event_id uuid;
begin
  if p_actor_id is null then
    raise exception 'image host actor is required';
  end if;

  if p_upload_api_origin is null or p_public_asset_origin is null then
    raise exception 'image host upload and public origins are required';
  end if;

  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'image host activation reason must contain 3 to 500 characters';
  end if;

  v_upload_origin := public.normalize_blog_image_host_origin(p_upload_api_origin);
  v_public_origin := public.normalize_blog_image_host_origin(p_public_asset_origin);
  v_legacy_origins := public.normalize_blog_image_host_origins(p_legacy_asset_origins);
  v_validation_summary := public.validate_blog_image_host_summary(p_validation_summary);

  select * into v_current
  from public.blog_image_host_config
  where id = 1
  for update;

  if not found then
    raise exception 'image host singleton config is missing';
  end if;

  if p_expected_version is distinct from v_current.version then
    raise exception 'stale image host config: expected version %, current version %',
      p_expected_version, v_current.version;
  end if;

  if v_current.version = 9223372036854775807 then
    raise exception 'image host config version is exhausted';
  end if;

  if v_public_origin <> v_current.public_asset_origin
     and not (v_current.public_asset_origin = any(v_legacy_origins)) then
    v_legacy_origins := array_append(v_legacy_origins, v_current.public_asset_origin);
  end if;

  v_legacy_origins := public.normalize_blog_image_host_origins(v_legacy_origins);
  v_legacy_origins := array_remove(v_legacy_origins, v_public_origin);

  if v_upload_origin = v_current.upload_api_origin
     and v_public_origin = v_current.public_asset_origin
     and v_legacy_origins = v_current.legacy_asset_origins then
    raise exception 'image host activation does not change the current config';
  end if;

  v_previous_config := jsonb_build_object(
    'upload_api_origin', v_current.upload_api_origin,
    'public_asset_origin', v_current.public_asset_origin,
    'legacy_asset_origins', to_jsonb(v_current.legacy_asset_origins),
    'version', v_current.version,
    'updated_by', v_current.updated_by,
    'reason', v_current.reason,
    'updated_at', v_current.updated_at
  );

  update public.blog_image_host_config
  set upload_api_origin = v_upload_origin,
      public_asset_origin = v_public_origin,
      legacy_asset_origins = v_legacy_origins,
      version = v_current.version + 1,
      updated_by = p_actor_id,
      reason = v_reason,
      updated_at = now()
  where id = 1
  returning * into v_current;

  v_new_config := jsonb_build_object(
    'upload_api_origin', v_current.upload_api_origin,
    'public_asset_origin', v_current.public_asset_origin,
    'legacy_asset_origins', to_jsonb(v_current.legacy_asset_origins),
    'version', v_current.version,
    'updated_by', v_current.updated_by,
    'reason', v_current.reason,
    'updated_at', v_current.updated_at
  );

  insert into public.blog_image_host_events (
    event_type,
    previous_version,
    new_version,
    previous_config,
    new_config,
    actor_id,
    reason,
    validation_summary
  )
  values (
    'activate',
    v_current.version - 1,
    v_current.version,
    v_previous_config,
    v_new_config,
    p_actor_id,
    v_reason,
    v_validation_summary
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id,
    'event_type', 'activate',
    'config', v_new_config
  );
end;
$$;

create function public.rollback_blog_image_host_config(
  p_expected_version bigint,
  p_actor_id uuid,
  p_reason text,
  p_validation_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current public.blog_image_host_config%rowtype;
  v_source_event public.blog_image_host_events%rowtype;
  v_previous_config jsonb;
  v_new_config jsonb;
  v_upload_origin text;
  v_public_origin text;
  v_legacy_origins text[];
  v_reason text := btrim(p_reason);
  v_validation_summary jsonb;
  v_event_id uuid;
begin
  if p_actor_id is null then
    raise exception 'image host actor is required';
  end if;

  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'image host rollback reason must contain 3 to 500 characters';
  end if;

  v_validation_summary := public.validate_blog_image_host_summary(p_validation_summary);

  select * into v_current
  from public.blog_image_host_config
  where id = 1
  for update;

  if not found then
    raise exception 'image host singleton config is missing';
  end if;

  if p_expected_version is distinct from v_current.version then
    raise exception 'stale image host config: expected version %, current version %',
      p_expected_version, v_current.version;
  end if;

  if v_current.version = 9223372036854775807 then
    raise exception 'image host config version is exhausted';
  end if;

  select * into v_source_event
  from public.blog_image_host_events
  where new_version = v_current.version
  order by created_at desc, id desc
  limit 1;

  if not found then
    raise exception 'image host rollback source is missing for version %', v_current.version;
  end if;

  v_upload_origin := public.normalize_blog_image_host_origin(
    v_source_event.previous_config ->> 'upload_api_origin'
  );
  v_public_origin := public.normalize_blog_image_host_origin(
    v_source_event.previous_config ->> 'public_asset_origin'
  );

  select coalesce(array_agg(value order by ordinality), '{}'::text[])
  into v_legacy_origins
  from jsonb_array_elements_text(
    coalesce(v_source_event.previous_config -> 'legacy_asset_origins', '[]'::jsonb)
  ) with ordinality as legacy(value, ordinality);

  v_legacy_origins := public.normalize_blog_image_host_origins(v_legacy_origins);
  v_legacy_origins := array_remove(v_legacy_origins, v_public_origin);

  v_previous_config := jsonb_build_object(
    'upload_api_origin', v_current.upload_api_origin,
    'public_asset_origin', v_current.public_asset_origin,
    'legacy_asset_origins', to_jsonb(v_current.legacy_asset_origins),
    'version', v_current.version,
    'updated_by', v_current.updated_by,
    'reason', v_current.reason,
    'updated_at', v_current.updated_at
  );

  update public.blog_image_host_config
  set upload_api_origin = v_upload_origin,
      public_asset_origin = v_public_origin,
      legacy_asset_origins = v_legacy_origins,
      version = v_current.version + 1,
      updated_by = p_actor_id,
      reason = v_reason,
      updated_at = now()
  where id = 1
  returning * into v_current;

  v_new_config := jsonb_build_object(
    'upload_api_origin', v_current.upload_api_origin,
    'public_asset_origin', v_current.public_asset_origin,
    'legacy_asset_origins', to_jsonb(v_current.legacy_asset_origins),
    'version', v_current.version,
    'updated_by', v_current.updated_by,
    'reason', v_current.reason,
    'updated_at', v_current.updated_at
  );

  insert into public.blog_image_host_events (
    event_type,
    previous_version,
    new_version,
    previous_config,
    new_config,
    actor_id,
    reason,
    validation_summary
  )
  values (
    'rollback',
    v_current.version - 1,
    v_current.version,
    v_previous_config,
    v_new_config,
    p_actor_id,
    v_reason,
    v_validation_summary
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id,
    'event_type', 'rollback',
    'source_event_id', v_source_event.id,
    'config', v_new_config
  );
end;
$$;

revoke all on function public.normalize_blog_image_host_origin(text)
  from public, anon, authenticated, service_role;
revoke all on function public.normalize_blog_image_host_origins(text[])
  from public, anon, authenticated, service_role;
revoke all on function public.validate_blog_image_host_summary(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.activate_blog_image_host_config(
  bigint, text, text, text[], uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.activate_blog_image_host_config(
  bigint, text, text, text[], uuid, text, jsonb
) to service_role;

revoke all on function public.rollback_blog_image_host_config(
  bigint, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.rollback_blog_image_host_config(
  bigint, uuid, text, jsonb
) to service_role;

revoke all on table public.blog_image_host_config
  from public, anon, authenticated, service_role;
revoke all on table public.blog_image_host_events
  from public, anon, authenticated, service_role;
grant select on table public.blog_image_host_config to service_role;
grant select on table public.blog_image_host_events to service_role;

-- 在同一外层事务中验证 service_role 激活、自动保留旧 origin、回滚与版本单调递增；
-- 随后回滚到 savepoint，不保留测试配置或事件。
savepoint image_host_p3_rpc_self_test;

set local role service_role;
select public.activate_blog_image_host_config(
  1,
  'https://img.vlogs.cc',
  'https://img.vlogs.cc',
  '{}'::text[],
  gen_random_uuid(),
  'P3 transactional activation self-test',
  '{"a":{"status":"ok"},"b":{"status":"ok"}}'::jsonb
);
select public.rollback_blog_image_host_config(
  2,
  gen_random_uuid(),
  'P3 transactional rollback self-test',
  '{"a":{"status":"ok"},"b":{"status":"ok"}}'::jsonb
);
reset role;

do $$
begin
  if not exists (
    select 1
    from public.blog_image_host_config
    where id = 1
      and upload_api_origin = 'https://img.x1file.top'
      and public_asset_origin = 'https://img.x1file.top'
      and legacy_asset_origins = '{}'::text[]
      and version = 3
  ) then
    raise exception 'image host P3 self-test failed: rollback state is incorrect';
  end if;

  if (select count(*) from public.blog_image_host_events) <> 2 then
    raise exception 'image host P3 self-test failed: expected two audit events';
  end if;
end;
$$;

rollback to savepoint image_host_p3_rpc_self_test;

do $$
begin
  if not exists (
    select 1
    from public.blog_image_host_config
    where id = 1
      and upload_api_origin = 'https://img.x1file.top'
      and public_asset_origin = 'https://img.x1file.top'
      and legacy_asset_origins = '{}'::text[]
      and version = 1
      and updated_by is null
  ) or exists (select 1 from public.blog_image_host_events) then
    raise exception 'image host P3 self-test cleanup failed';
  end if;
end;
$$;

comment on table public.blog_image_host_config is
  '全平台 BLOG 共享图床单例配置；只能通过 service-role-only RPC 激活或回滚。';
comment on table public.blog_image_host_events is
  '图床配置激活/回滚的不可变审计事件；验活摘要不得包含密钥或响应正文。';
comment on function public.activate_blog_image_host_config(
  bigint, text, text, text[], uuid, text, jsonb
) is '按 expected_version 原子激活共享图床配置并写审计事件；仅 service_role 可执行。';
comment on function public.rollback_blog_image_host_config(
  bigint, uuid, text, jsonb
) is '恢复当前版本上一事件的 previous_config，版本号继续递增；仅 service_role 可执行。';

commit;
