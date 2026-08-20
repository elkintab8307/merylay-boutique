alter table public.product_ratings add column author_name text not null default '';
alter table public.product_ratings alter column author_name drop default;
