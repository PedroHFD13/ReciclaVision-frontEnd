// /api/local-webhook.js

let pendingResults = [];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("✅ Webhook interno recebeu dados:");
    console.log(req.body);

    pendingResults.push({
      timestamp: Date.now(),
      data: req.body
    });

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Erro no webhook interno:", err);
    return res.status(500).json({ error: "Internal webhook error" });
  }
}

// ✅ Função auxiliar para o outro endpoint
export function consumePendingResults() {
  const items = [...pendingResults];
  pendingResults = [];
  return items;
}
