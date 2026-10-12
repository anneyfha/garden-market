# Garden Market Admin

Deploy lewat GitHub atau Netlify CLI (bukan drag-and-drop, karena ada Functions).

1. Netlify > Site configuration > Environment variables:
   - ADMIN_PASSWORD = password admin
   - SESSION_SECRET = teks acak minimal 32 karakter
   - Notifikasi push (opsional): jalankan `npx web-push generate-vapid-keys`, lalu isi
     VAPID_PUBLIC, VAPID_PRIVATE, dan VAPID_SUBJECT (contoh `mailto:emailanda@gmail.com`)
2. Taruh gambar QRIS toko Anda di `public/qris.png` (tampil di halaman reseller setelah pesan).
3. Deploy. Admin di `/`, reseller di `/toko.html`.
4. Di admin, tekan "Aktifkan notifikasi" di tiap perangkat. Di HP, pasang lewat "Tambahkan ke layar utama".
