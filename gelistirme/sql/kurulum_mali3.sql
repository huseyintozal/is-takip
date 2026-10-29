-- =====================================================================
-- İş Takibi — MALİ TAKİP ek kurulum (B1.10.0): özalit ve diğer tedarikçiler
-- Supabase: SQL Editor > New query > yapıştır > Run   (tekrar çalıştırmak zarar vermez)
-- =====================================================================
alter table public.cariler drop constraint if exists cariler_tur_check;
alter table public.cariler add constraint cariler_tur_check check (tur in ('isveren', 'lab', 'sondaj', 'ozalit', 'diger'));
