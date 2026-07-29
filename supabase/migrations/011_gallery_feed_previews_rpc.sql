create or replace function public.get_gallery_feed_previews(
  p_site_id uuid,
  p_slugs text[],
  p_thumb_limit integer default 6
)
returns table (
  post_slug text,
  image_count integer,
  url text,
  thumb_url text,
  sort_order integer
)
language sql
stable
set search_path = public
as $$
  with requested_galleries as (
    select
      g.id,
      g.post_slug,
      g.image_count
    from public.galleries g
    where g.site_id = p_site_id
      and g.post_slug = any(coalesce(p_slugs, '{}'::text[]))
      and g.image_count > 0
  ),
  ranked_images as (
    select
      gallery.post_slug,
      gallery.image_count,
      image.url,
      image.thumb_url,
      image.sort_order,
      row_number() over (
        partition by gallery.id
        order by image.sort_order asc, image.created_at asc, image.id asc
      ) as image_rank
    from requested_galleries gallery
    join public.gallery_images image
      on image.gallery_id = gallery.id
     and image.site_id = p_site_id
  )
  select
    ranked.post_slug,
    ranked.image_count,
    ranked.url,
    ranked.thumb_url,
    ranked.sort_order
  from ranked_images ranked
  where ranked.image_rank <= least(greatest(coalesce(p_thumb_limit, 6), 1), 12)
  order by ranked.post_slug, ranked.sort_order;
$$;

revoke all on function public.get_gallery_feed_previews(uuid, text[], integer)
  from public, anon, authenticated;
grant execute on function public.get_gallery_feed_previews(uuid, text[], integer)
  to service_role;

comment on function public.get_gallery_feed_previews(uuid, text[], integer) is
  'Returns the first N Gallery images for multiple post slugs in one service-role-only query.';
