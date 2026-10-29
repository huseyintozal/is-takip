#!/bin/sh
# Uygulamayı gerçek Supabase yerine sahte (tarayıcı içi) Supabase ile yerelde açar: http://localhost:8800
# Veriler tarayıcının localStorage'ında durur (anahtar: sahteDB). Oturum için localStorage.sahteOturum = 'mail'.
set -e
KOK="$(cd "$(dirname "$0")/../.." && pwd)"
HEDEF="${TMPDIR:-/tmp}/is_takip_test"
rm -rf "$HEDEF" && mkdir -p "$HEDEF"
cp -r "$KOK"/*.js "$KOK"/*.css "$KOK"/*.html "$KOK"/*.png "$KOK"/*.webmanifest "$KOK"/vendor "$HEDEF"/
cp "$KOK/gelistirme/test/sahte_supabase.js" "$HEDEF"/
sed -i 's#<script src="vendor/supabase.js[^"]*"></script>#<script src="sahte_supabase.js"></script>#' "$HEDEF/index.html"
cd "$HEDEF" && echo "http://localhost:8800" && python3 -m http.server 8800
