// /api/proxy.js

export const config = {
    api: {
      bodyParser: false,
    }
  };
  
  export default async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
  
    try {
      const webhook = req.query.webhook;
      if (!webhook) {
        return res.status(400).json({ error: "Webhook obrigatório" });
      }
  
      const base = `http://54.156.234.253/reconhece-imagem/v1`;
      const targetURL = `${base}?webhook=${encodeURIComponent(webhook)}`;
  
      console.log("➡️ Enviando para:", targetURL);
  
      const response = await fetch(targetURL, {
        method: "POST",
        body: req,
      });
  
      console.log("✅ Resposta recebida da API");
  
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("❌ Erro no proxy:", err);
      return res.status(500).json({ error: "Proxy error" });
    }
  }
  