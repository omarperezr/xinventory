-- ---------------------------------------------------------------------------
-- Rollback for 0005_social.sql: removes the Redes Sociales module tables.
--
-- Order matters only for readability; none of these tables is referenced by
-- anything outside the module. Storage objects in the `social-posts` bucket
-- are NOT touched (buckets are dashboard-managed, same as product-images);
-- delete the bucket by hand if the module is gone for good.
-- ---------------------------------------------------------------------------

begin;

drop table if exists public.social_promoted;
drop table if exists public.social_posts;
drop table if exists public.social_config;

commit;
