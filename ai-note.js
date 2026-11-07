import { createRemoteJWKSet, jwtVerify } from "jose";

const projectId = "simplearn-69f6e";
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

async function verifyFirebaseToken(token) {
  const { payload } = await jwtVerify(token, googleKeys, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (!payload.sub || payload.sub.length > 128) throw new Error("Token pengguna tidak valid.");
  return payload;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Silakan login ke Simplearn terlebih dahulu." });
    await verifyFirebaseToken(token);

    const { image, subject = "Umum", chapter = "", hint = "" } = req.body || {};
    if (typeof image !== "string" || !/^data:image\/(jpeg|jpg|png|webp|heic|heif);base64,/.test(image)) {
      return res.status(400).json({ error: "Foto tidak valid. Gunakan JPG, PNG, atau WebP." });
    }
    if (image.length > 16_500_000) return res.status(413).json({ error: "Foto terlalu besar. Maksimal sekitar 12 MB." });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY belum dipasang di Vercel Environment Variables." });

    const instructions = `Kamu adalah AI Note Maker untuk aplikasi belajar Simplearn. Baca isi foto materi dengan teliti dan ubah menjadi catatan belajar berbahasa Indonesia yang terstruktur. Mata pelajaran: ${String(subject).slice(0,80)}. Bab/topik: ${String(chapter).slice(0,160)}. Instruksi pengguna: ${String(hint).slice(0,1000)}.
Aturan: pertahankan fakta, rumus, angka, istilah, dan urutan penting yang terbaca; jangan mengarang bagian foto yang tidak terbaca. Jika ada bagian tidak jelas, tulis [tidak terbaca jelas] atau beri catatan singkat. Buat judul yang relevan. Isi catatan memakai Markdown dengan subjudul, poin penting, penjelasan, dan contoh hanya jika contoh ada di sumber atau dapat dijelaskan tanpa mengubah materi. Jika ada rumus, pertahankan notasinya. Hasil harus siap disimpan sebagai catatan.`;

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "Buatkan catatan terstruktur dari foto materi ini. Kembalikan JSON dengan properti title dan content. Properti content berisi Markdown." },
            { type: "input_image", image_url: image, detail: "high" }
          ]
        }],
        text: { format: { type: "json_object" } },
        max_output_tokens: 5000
      })
    });

    const result = await aiResponse.json();
    if (!aiResponse.ok) {
      const message = result?.error?.message || "Layanan AI sedang bermasalah.";
      return res.status(aiResponse.status === 429 ? 429 : 502).json({ error: message });
    }
    const outputText = (result.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");
    let note;
    try { note = JSON.parse(outputText); }
    catch { return res.status(502).json({ error: "AI mengirim format catatan yang tidak terbaca. Coba lagi." }); }
    if (!note || typeof note.title !== "string" || typeof note.content !== "string") {
      return res.status(502).json({ error: "Hasil AI belum lengkap. Coba foto yang lebih jelas." });
    }
    return res.status(200).json({ note: { title: note.title, content: note.content } });
  } catch (error) {
    console.error("AI Note API error:", error);
    if (error.code === "ERR_JWT_INVALID" || error.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" || error.code === "ERR_JWT_EXPIRED") {
      return res.status(401).json({ error: "Sesi login tidak valid. Login ulang lalu coba lagi." });
    }
    return res.status(500).json({ error: "Server gagal memproses permintaan. Periksa konfigurasi deployment." });
  }
}
