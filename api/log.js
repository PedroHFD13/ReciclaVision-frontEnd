// Node.js 18+ na Vercel
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = {};
  try {
    body = req.body ?? {};
  } catch (e) {
    // Em algumas configs é preciso parsear manualmente:
    try { body = JSON.parse(req.body || "{}"); } catch {}
  }

  const { level = "info", message, error, extra } = body;

  // Metadados úteis p/ debug
  const meta = {
    ts: new Date().toISOString(),
    ua: req.headers["user-agent"],
    ip: (req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket?.remoteAddress,
    referer: req.headers["referer"],
  };

  const payload = { level, message, error, extra, meta };

  try {
    if (level === "error") {
      console.error("[client-log]", JSON.stringify(payload));
    } else if (level === "warn") {
      console.warn("[client-log]", JSON.stringify(payload));
    } else {
      console.log("[client-log]", JSON.stringify(payload));
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[client-log-failed]", e);
    return res.status(500).json({ ok: false });
  }
}
