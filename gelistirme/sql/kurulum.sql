-- =====================================================================
-- İş Takibi — Supabase kurulumu
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run
-- Birden fazla kez çalıştırmak zarar vermez.
-- =====================================================================

-- 1) Kimlerin girebileceği. rol: yonetici (her şey + kullanıcı ekler), duzenle, goruntule (yalnızca bakar)
create table if not exists public.yetkililer (
  email   text primary key,
  rol     text not null default 'duzenle' check (rol in ('yonetici', 'duzenle', 'goruntule')),
  ad      text not null default '',
  eklenme timestamptz not null default now()
);

-- 2) İşler: her iş bir satır, iş kaydının tamamı "veri" içinde (uygulamadaki JSON'la birebir aynı)
create table if not exists public.isler (
  id          text primary key,
  veri        jsonb not null,
  olusturma   timestamptz not null default now(),
  guncelleme  timestamptz not null default now(),
  guncelleyen text not null default ''
);

-- 3) Giriş yapanın rolü
create or replace function public.benim_rolum() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.yetkililer where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- 4) Güvenlik: listede olmayan hiçbir şey göremez
alter table public.isler enable row level security;
alter table public.yetkililer enable row level security;

drop policy if exists isler_oku on public.isler;
drop policy if exists isler_ekle on public.isler;
drop policy if exists isler_guncelle on public.isler;
drop policy if exists isler_sil on public.isler;
create policy isler_oku on public.isler for select to authenticated using (public.benim_rolum() is not null);
create policy isler_ekle on public.isler for insert to authenticated with check (public.benim_rolum() in ('yonetici', 'duzenle'));
create policy isler_guncelle on public.isler for update to authenticated
  using (public.benim_rolum() in ('yonetici', 'duzenle')) with check (public.benim_rolum() in ('yonetici', 'duzenle'));
create policy isler_sil on public.isler for delete to authenticated using (public.benim_rolum() in ('yonetici', 'duzenle'));

drop policy if exists yetki_oku on public.yetkililer;
drop policy if exists yetki_yaz on public.yetkililer;
create policy yetki_oku on public.yetkililer for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email') or public.benim_rolum() = 'yonetici');
create policy yetki_yaz on public.yetkililer for all to authenticated
  using (public.benim_rolum() = 'yonetici') with check (public.benim_rolum() = 'yonetici');

-- 5) Kısmi güncelleme: yalnızca değişen alanlar yazılır, geçmiş sona eklenir.
--    Aynı anda iki kişi aynı işin farklı alanlarını değiştirirse ikisinin değişikliği de korunur.
create or replace function public.is_guncelle(p_id text, p_alanlar jsonb, p_gecmis jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  update public.isler set
    veri = jsonb_set(veri || (p_alanlar - 'gecmis' - 'id'), '{gecmis}',
                     coalesce(veri -> 'gecmis', '[]'::jsonb) || coalesce(p_gecmis, '[]'::jsonb)),
    guncelleme  = now(),
    guncelleyen = coalesce(auth.jwt() ->> 'email', '')
  where id = p_id
  returning veri into v;
  if v is null then raise exception 'İş bulunamadı ya da düzenleme yetkiniz yok'; end if;
  return v;
end $$;

-- 6) Canlı güncelleme (bir kişi değiştirince herkesin ekranı yenilenir)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'isler') then
    alter publication supabase_realtime add table public.isler;
  end if;
end $$;

-- 7) İlk yönetici: kendi mail adresin (gerekirse değiştir)
insert into public.yetkililer (email, rol, ad) values ('huseyinntozal1@gmail.com', 'yonetici', 'Üstad')
on conflict (email) do update set rol = 'yonetici';
