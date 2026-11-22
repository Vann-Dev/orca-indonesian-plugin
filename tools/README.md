# Tools

Semua skrip di sini jalan di Node 22+ tanpa dependensi. Tidak ada yang menyentuh `main`:
perubahan selalu lewat branch `auto/orca-<versi>` dan pull request.

| Perintah | Gunanya |
| --- | --- |
| `npm run status` | Rilis Orca terbaru vs versi pack, plus jumlah string yang kurang |
| `npm run upstream -- 1.4.270` | Simpan `en.json`, protected copy, dan chrome dari tag Orca itu |
| `npm run sync -- --plan --orca 1.4.270` | Apa yang berubah: key baru, teks Inggris berubah, key usang |
| `npm run sync -- --orca 1.4.270 --write-todo todo.json` | Daftar string yang perlu diterjemahkan |
| `npm run sync -- --orca 1.4.270 --apply todo.json` | Tulis pack baru, naikkan versi plugin, perbarui README |
| `npm run quality` | Gate: placeholder, markup, protected copy, glosarium, coverage |
| `npm run report -- --orca 1.4.270` | Isi badan pull request |
| `node tools/open-pr.mjs --version 1.4.270 --body pr-body.md` | Commit, push branch, buka PR (tidak pernah merge) |

## Alur satu rilis

```sh
npm run upstream -- 1.4.270
npm run sync -- --plan --orca 1.4.270
npm run sync -- --orca 1.4.270 --write-todo todo.json
# isi `id` untuk setiap entri di todo.json
npm run sync -- --orca 1.4.270 --apply todo.json
npm run quality
npm run report -- --orca 1.4.270 --out pr-body.md
node tools/open-pr.mjs --version 1.4.270 --body pr-body.md
```

`--apply` menulis ulang `locales/id.json` mengikuti urutan katalog Inggris, jadi diff-nya
kecil walau ada key baru di tengah. Key yang sudah tidak ada di rilis itu ikut dibuang,
dan key yang sekarang dilindungi Orca dikeluarkan.

## Versi

`orca-plugin.json` `version` mengikuti versi Orca (`1.4.269`, `1.4.270`, …). Kalau perlu
revisi untuk rilis yang sama, pakai `1.4.270-1`, `1.4.270-2`, dan seterusnya.
`engines.orca` tetap di Orca tertua yang masih bisa memuat pack ini, supaya pengguna versi
lama tidak kehilangan terjemahan.

## Baseline

`tools/quality-baseline.json` mencatat masalah lama (glosarium mesin, huruf awal kalimat)
supaya gate tidak memerahkan setiap PR. Masalah **baru** tetap menggagalkan CI. Setelah
backlog dibereskan dalam satu pass terpisah, jalankan `npm run quality -- --baseline`.

## Sumber Inggris

`tools/upstream/` tidak masuk git. CI mengunduhnya dari tag Orca yang sesuai dengan versi
pack, jadi hasil build selalu bisa direproduksi walaupun `main` Orca sudah bergerak.
