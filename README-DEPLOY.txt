SIMPLEARN AI NOTE MAKER — DEPLOYMENT

Isi folder ini adalah project Vercel:
- index.html: Simplearn dengan UI AI Note Maker
- api/ai-note.js: backend aman untuk verifikasi Firebase user dan memanggil OpenAI
- package.json: dependency verifikasi token

PENTING:
1. Jangan deploy index.html sendirian jika ingin AI berjalan. Deploy seluruh isi folder project ini ke Vercel.
2. Di Vercel Project Settings > Environment Variables, tambahkan:
   OPENAI_API_KEY = API key OpenAI milik kamu
   (Opsional) OPENAI_MODEL = gpt-4.1-mini
3. Redeploy setelah menambahkan environment variable.
4. Firebase Auth tetap harus mengizinkan domain Vercel.
5. Endpoint memverifikasi Firebase ID token dan hanya menerima permintaan dari pengguna yang login.
6. Catatan hasil AI otomatis disimpan melalui sistem save Simplearn ke dokumen users/{uid} yang sudah digunakan aplikasi.

Catatan:
- Backend ini menggunakan OpenAI API berbayar sesuai pemakaian. API key tidak ditaruh di HTML.
- Foto diproses oleh API AI; hindari mengunggah materi yang memuat data pribadi/sensitif.
- Jika project Vercel kamu saat ini hanya berupa static HTML, hubungkan project ini lewat GitHub atau deploy folder ini memakai Vercel CLI agar /api/ai-note tersedia.
