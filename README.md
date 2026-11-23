# Bahasa Indonesia untuk Orca

Terjemahan antarmuka [Orca](https://orca.dev/) ke bahasa Indonesia, dikemas sebagai plugin bahasa.
Isinya hanya data: tidak ada kode yang dijalankan.

> Paket **tidak resmi** buatan komunitas. Tidak berafiliasi dengan Stably / Lovecast Inc.

## Pasang

Di Orca: **Settings → Plugins**, tambahkan katalog komunitas
(`https://github.com/stablyai/orca-community-plugins.git`, ref `main`), pasang **Bahasa Indonesia**,
lalu aktifkan. Setelah itu pilih **Settings → Appearance → Language → Bahasa Indonesia**.

Selama plugin belum ada di katalog, folder ini bisa dimuat langsung dari sumber:

```sh
git clone https://github.com/Vann-Dev/orca-indonesian-plugin.git
orca plugin dev load ./orca-indonesian-plugin
```

## Cakupan

Terjemahan mengikuti katalog bahasa Inggris Orca 1.4.271. Kalau Orca menambah teks baru, teks itu
tampil dalam bahasa Inggris sampai paket berikutnya dirilis — sama seperti paket bahasa lain.

Teks yang dilindungi Orca tetap dalam bahasa Inggris: dialog keamanan, izin, dan hal-hal yang
berkaitan dengan kepercayaan plugin. Itu batasan Orca, bukan sesuatu yang bisa ditimpa paket.

## Istilah

Istilah yang dipakai developer tetap dalam bahasa Inggris, mengikuti cara orang menulisnya di repo
dan dokumen Indonesia: `checkout`, `branch`, `commit`, `push`, `pull`, `stash`, `rebase`, `merge`,
`fast-forward`, `stage`, `diff`, `fork`, `pipeline`, `shell`, `hook`, `thread`, `header`, `worker`,
`review`, `reviewer`, `issue`, `origin`, `upstream`, `repo`, `worktree`, `host`, `plugin`, `sandbox`,
`prompt`, `token`, `agent`, `skill`. Yang diterjemahkan adalah kalimat dan kata kerja di sekitarnya.

## Mengubah terjemahan

Semua terjemahan berada di [`locales/id.json`](locales/id.json). Key-nya sama persis dengan katalog
bahasa Inggris Orca; kalau sebuah key tidak ada, Orca otomatis menampilkan teks bahasa Inggris.

Untuk memperbaiki satu teks, cari key-nya lalu ganti nilainya. Setelah itu cek dengan:

```sh
orca plugin validate .
```

## Lisensi

MIT — lihat [LICENSE](LICENSE).

---

# Indonesian for Orca

Unofficial, community-made Indonesian UI language pack for Orca. Data only; nothing runs. Not
affiliated with or endorsed by Stably / Lovecast Inc. Licensed under MIT; see `LICENSE`.
