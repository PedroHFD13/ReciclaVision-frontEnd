// /api/proxy.js

export const config = {
    api: {
      bodyParser: false,
    }
  };
  
  export default async function handler(req, res) {
    console.log("🔵 [PROXY] Nova requisição recebida");
  
    if (req.method !== "POST") {
      console.log("❌ [PROXY] Método inválido:", req.method);
      return res.status(405).json({ error: "Method not allowed" });
    }
  
    try {
      const webhook = req.query.webhook;
      if (!webhook) {
        console.log("❌ [PROXY] Webhook não informado");
        return res.status(400).json({ error: "Webhook obrigatório" });
      }
  
      const base = `http://54.156.234.253/reconhece-imagem/v1`;
      const targetURL = `${base}?webhook=${encodeURIComponent(webhook)}`;
  
      console.log("➡️ [PROXY] Enviando para AWS:", targetURL);
  
      const awsResponse = await fetch(targetURL, {
        method: "POST",
        body: req,
      });
  
      console.log("✅ [PROXY] Resposta recebida da AWS:", awsResponse.status);
  
      const text = await awsResponse.text();
      console.log("📥 [PROXY] Conteúdo da resposta AWS:", text);
  
      return res.status(awsResponse.status).json({
        success: true,
        awsStatus: awsResponse.status,
        awsResponse: text,
      });
  
    } catch (err) {
      console.error("❌ [PROXY] Erro na conexão com AWS:", err.toString());
  
      return res.status(500).json({
        error: "Proxy error",
        details: err.toString(),
      });
    }
  }
  