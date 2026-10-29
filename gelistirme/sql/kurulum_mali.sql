-- =====================================================================
-- İş Takibi — MALİ TAKİP kurulumu (kurulum.sql'den SONRA, bir kez)
-- Supabase: SQL Editor > New query > yapıştır > Run   (tekrar çalıştırmak zarar vermez)
-- Mali bilgileri YALNIZCA YÖNETİCİLER görür.
-- =====================================================================

-- 1) Cariler: işverenler, laboratuvarlar, sondajcılar
create table if not exists public.cariler (
  id               uuid primary key default gen_random_uuid(),
  tur              text not null check (tur in ('isveren', 'lab', 'sondaj')),
  ad               text not null,
  anahtar          text not null,                 -- büyük harfli ad (eşleştirme için)
  varsayilan_ucret numeric(12,2) not null default 0,  -- işveren: iş başı fiyat; lab/sondaj: iş başı maliyet
  varsayilan       boolean not null default false, -- lab/sondaj: işe ayrıca seçilmezse bu kullanılır
  notlar           text not null default '',
  eklenme          timestamptz not null default now(),
  unique (tur, anahtar)
);

-- 2) İşlerin ücretleri (boş olan alan carinin varsayılan fiyatından gelir)
create table if not exists public.is_ucretleri (
  is_id        text primary key references public.isler(id) on delete cascade,
  ucret        numeric(12,2),
  lab_id       uuid references public.cariler(id) on delete set null,
  lab_ucret    numeric(12,2),
  sondajci_id  uuid references public.cariler(id) on delete set null,
  sondaj_ucret numeric(12,2),
  guncelleme   timestamptz not null default now()
);

-- 3) Hareketler: işverenden alınan ödemeler (tahsilat), lab/sondajcıya yapılan ödemeler (odeme)
create table if not exists public.hareketler (
  id       uuid primary key default gen_random_uuid(),
  cari_id  uuid not null references public.cariler(id) on delete cascade,
  tur      text not null check (tur in ('tahsilat', 'odeme')),
  tutar    numeric(12,2) not null,
  tarih    date not null default current_date,
  aciklama text not null default '',
  is_id    text references public.isler(id) on delete set null,
  ekleyen  text not null default '',
  eklenme  timestamptz not null default now()
);
create index if not exists hareketler_cari on public.hareketler (cari_id);

-- 4) Güvenlik: yalnızca yönetici
do $$
declare t text;
begin
  foreach t in array array['cariler', 'is_ucretleri', 'hareketler'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_yonetici', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.benim_rolum() = ''yonetici'') with check (public.benim_rolum() = ''yonetici'')', t || '_yonetici', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
