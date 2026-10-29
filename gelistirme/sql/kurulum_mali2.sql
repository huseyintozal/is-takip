-- =====================================================================
-- İş Takibi — MALİ TAKİP ek kurulum (B1.8.0): ödeme yöntemi, çek vadesi, dekont
-- Supabase: SQL Editor > New query > yapıştır > Run   (tekrar çalıştırmak zarar vermez)
-- =====================================================================
alter table public.hareketler add column if not exists yontem   text not null default '';   -- havale, nakit, cek
alter table public.hareketler add column if not exists cek_vade date;                       -- çekin tarihi
alter table public.hareketler add column if not exists dekont   text;                       -- buluttaki dekont dosyası (dosyalar deposu)
