#!/usr/bin/env python3
"""
Gym Member Manager — Supabase Keep-Alive
Reuse project Supabase Financial Planner. Ping tiap 3 hari biar ga di-pause.
Cara pakai: python supabase-keepalive.py  (baca key dari .supabase-key)
Atau: python supabase-keepalive.py YOUR_ANON_KEY
"""
import urllib.request, sys, os

SUPABASE_URL = 'https://zstgiptwnqzsvgntsgtz.supabase.co'

def ping(anon_key):
    endpoints = [
        f'{SUPABASE_URL}/rest/v1/app_data?select=id&limit=1',
        f'{SUPABASE_URL}/rest/v1/app_data?select=count&limit=1',
    ]
    ok = False
    for url in endpoints:
        try:
            req = urllib.request.Request(url)
            req.add_header('apikey', anon_key)
            req.add_header('Authorization', f'Bearer {anon_key}')
            with urllib.request.urlopen(req, timeout=15) as resp:
                print(f'✅ Ping OK — {resp.status}')
                ok = True
        except Exception as e:
            print(f'⚠️  Ping gagal: {str(e)[:60]}')
    print('✅ Supabase aktif' if ok else '❌ Semua ping gagal — cek anon key')
    return ok

if __name__ == '__main__':
    key = None
    if len(sys.argv) > 1:
        key = sys.argv[1]
    else:
        here = os.path.dirname(os.path.abspath(__file__))
        for p in [os.path.join(here,'.supabase-key'), os.path.join(here,'..','.supabase-key'),
                  os.path.expanduser('~/.supabase-key')]:
            if os.path.exists(p):
                key = open(p).read().strip(); print(f'📖 key dari {p}'); break
    if not key:
        print('❌ Anon key tidak ditemukan. Simpan di scripts/.supabase-key atau pass sebagai arg.'); sys.exit(1)
    sys.exit(0 if ping(key) else 1)
