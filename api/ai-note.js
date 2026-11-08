
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

  if (!payload.sub || payload.sub.length > 128) {
    throw new Error("Token pengguna tidak valid.");
  }

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

    if (!token) {
      return res.status(401).json({
        error: "Silakan login ke Simplearn terlebih dahulu."
      });
    }

    await verifyFirebaseToken(token);

    const {
      image,
      subject = "Umum",
      chapter = "",
      hint = ""
    } = req.body || {};

    if (
      typeof image !== "string" ||
      !/^data:image\/(jpeg|jpg|png|webp|heic|heif);base64,/.test(image)
    ) {
      return res.status(400).json({ error: "Foto tidak valid." });
    }

    if (image.length > 16_500_000) {
      return res.status(413).json({
        error: "Foto terlalu besar. Maksimal sekitar 12 MB."
      });
    }

    if (!process.env.HF_TOKEN) {
      return res.status(500).json({
        error: "HF_TOKEN belum dipasang di Vercel."
      });
    }

    const instructions = `Kamu adalah AI Note Maker Simplearn.
Buat catatan belajar berbahasa Indonesia dari foto materi.
Mata pelajaran: ${String(subject).slice(0, 80)}.
Bab/topik: ${String(chapter).slice(0, 160)}.
Instruksi pengguna: ${String(hint).slice(0, 1000)}.

Pertahankan fakta, rumus, angka, dan istilah.
Jangan mengarang tulisan yang tidak terbaca.
Gunakan Markdown untuk subjudul, poin penting, penjelasan, dan contoh.
Kembalikan HANYA JSON valid dengan properti:
{"title":"Judul catatan","content":"Isi catatan dalam Markdown"}`;

    const aiResponse = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "Qwen/Qwen2.5-VL-3B-Instruct",
          messages: [
            {
              role: "system",
              content: instructions
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Buat catatan terstruktur dari foto ini."
                },
                {
                  type: "image_url",
                  image_url: { url: image }
                }
              ]
            }
          ],
          max_tokens: 3500,
          temperature: 0.2
        })
      }
    );

    const result = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("Hugging Face error:", result);
      return res.status(
        aiResponse.status === 429 ? 429 : 502
      ).json({
        error: "Layanan Hugging Face sedang bermasalah atau kuota gratis habis."
      });
    }

    let outputText = result.choices?.[0]?.message?.content;

    if (Array.isArray(outputText)) {
      outputText = outputText
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n");
    }

    if (typeof outputText !== "string") {
      return res.status(502).json({
        error: "AI tidak memberikan hasil teks."
      });
    }

    outputText = outputText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let note;

    try {
      note = JSON.parse(outputText);
    } catch {
      return res.status(502).json({
        error: "Format catatan dari AI tidak terbaca. Coba lagi."
      });
    }

    if (
      !note ||
      typeof note.title !== "string" ||
      typeof note.content !== "string"
    ) {
      return res.status(502).json({
        error: "Hasil AI belum lengkap."
      });
    }

    return res.status(200).json({
      note: {
        title: note.title,
        content: note.content
      }
    });

  } catch (error) {
    console.error("AI Note API error:", error);

    if (
      error.code === "ERR_JWT_INVALID" ||
      error.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" ||
      error.code === "ERR_JWT_EXPIRED"
    ) {
      return res.status(401).json({
        error: "Sesi login tidak valid. Login ulang."
      });
    }

    return res.status(500).json({
      error: "Server gagal memproses permintaan."
    });
  }
}
