-- Formato da publicação: o mesmo texto vira coisas diferentes conforme o
-- destino, e o histórico precisa distinguir "saiu no feed" de "saiu no
-- stories" — stories some em 24h, feed fica.
alter table public.social_publications
  add column if not exists format text not null default 'texto';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'social_publications_format_check'
  ) then
    alter table public.social_publications
      add constraint social_publications_format_check
      check (format in ('texto','feed','stories','reels'));
  end if;
end $$;
