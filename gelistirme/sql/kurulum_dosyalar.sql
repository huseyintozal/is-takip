-- =====================================================================
-- İş Takibi — DOSYALAR kurulumu (kurulum.sql'den SONRA, bir kez)
-- Supabase: SQL Editor > New query > yapıştır > Run   (tekrar çalıştırmak zarar vermez)
-- =====================================================================

-- 1) Her işin dosya listesi. Dosyanın kendisi bulutta (Storage) ve/veya bilgisayardaki proje klasöründe durur.
create table if not exists public.dosyalar (
  id         uuid primary key default gen_random_uuid(),
  is_id      text not null references public.isler(id) on delete cascade,
  kategori   text not null default 'diger',     -- mimari, evrak, geo, lab, rapor, imza_cd, diger
  ad         text not null,                     -- dosyanın adı (bilgisayardaki adı)
  boyut      bigint not null default 0,
  tur        text not null default '',
  bulut_yolu text,                              -- Storage'daki yeri; boşsa dosya yalnızca bilgisayarda
  pc         text not null default '',          -- dosyanın bulunduğu bilgisayarın adı
  ekleyen    text not null default '',
  eklenme    timestamptz not null default now()
);
create index if not exists dosyalar_is_id on public.dosyalar (is_id);

alter table public.dosyalar enable row level security;
drop policy if exists dosya_oku on public.dosyalar;
drop policy if exists dosya_ekle on public.dosyalar;
drop policy if exists dosya_guncelle on public.dosyalar;
drop policy if exists dosya_sil on public.dosyalar;
create policy dosya_oku on public.dosyalar for select to authenticated using (public.benim_rolum() is not null);
create policy dosya_ekle on public.dosyalar for insert to authenticated with check (public.benim_rolum() in ('yonetici', 'duzenle'));
create policy dosya_guncelle on public.dosyalar for update to authenticated
  using (public.benim_rolum() in ('yonetici', 'duzenle')) with check (public.benim_rolum() in ('yonetici', 'duzenle'));
create policy dosya_sil on public.dosyalar for delete to authenticated using (public.benim_rolum() in ('yonetici', 'duzenle'));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dosyalar') then
    alter publication supabase_realtime add table public.dosyalar;
  end if;
end $$;

-- 2) Bulut deposu (gizli; yalnızca giriş yapan yetkililer)
insert into storage.buckets (id, name, public) values ('dosyalar', 'dosyalar', false)
on conflict (id) do nothing;

drop policy if exists depo_oku on storage.objects;
drop policy if exists depo_ekle on storage.objects;
drop policy if exists depo_guncelle on storage.objects;
drop policy if exists depo_sil on storage.objects;
create policy depo_oku on storage.objects for select to authenticated
  using (bucket_id = 'dosyalar' and public.benim_rolum() is not null);
create policy depo_ekle on storage.objects for insert to authenticated
  with check (bucket_id = 'dosyalar' and public.benim_rolum() in ('yonetici', 'duzenle'));
create policy depo_guncelle on storage.objects for update to authenticated
  using (bucket_id = 'dosyalar' and public.benim_rolum() in ('yonetici', 'duzenle'));
create policy depo_sil on storage.objects for delete to authenticated
  using (bucket_id = 'dosyalar' and public.benim_rolum() in ('yonetici', 'duzenle'));

-- 3) Bulutta kullanılan toplam alan (Dosyalar sayfasında gösterilir)
create or replace function public.bulut_kullanim() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(boyut), 0)::bigint from public.dosyalar where bulut_yolu is not null and public.benim_rolum() is not null
$$;
