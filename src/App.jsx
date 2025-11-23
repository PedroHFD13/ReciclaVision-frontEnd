// App.jsx
import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import "./App.css";

function App() {
  const [images, setImages] = useState([]);
  const [webhook, setWebhook] = useState("");
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState(null);

  // ✅ Histórico local
  const [results, setResults] = useState(() => {
    try {
      const stored = localStorage.getItem("reciclavision-results");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  function saveResult(result) {
    const updated = [...results, result];
    setResults(updated);
    localStorage.setItem("reciclavision-results", JSON.stringify(updated));
  }

  // ✅ Webhook interno FIXO
  const internalWebhook = `https://recicla-vision-front-end.vercel.app/api/local-webhook`;

  // ✅ Buscar resultados do webhook interno a cada 3s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/local-webhook-pending");
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
          data.forEach(item => saveResult(item));
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [results]);

  // localização
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(coords);

      try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json`;
        const resp = await fetch(url, {
          headers: { "User-Agent": "ReciclaVision/1.0" },
        });
        const data = await resp.json();
        setLocationName(data.display_name || `${coords.lat}, ${coords.lng}`);
      } catch {}
    });
  }, []);

  const onDrop = useCallback((acceptedFiles) => {
    setImages((prev) =>
      prev.concat(
        acceptedFiles.map((file) =>
          Object.assign(file, { preview: URL.createObjectURL(file) })
        )
      )
    );
    setStatus(null);
  }, []);

  function removeImage(index) {
    setImages((prev) => {
      const img = prev[index];
      try { URL.revokeObjectURL(img.preview); } catch {}
      return prev.filter((_, i) => i !== index);
    });
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
  });

  // ✅ ENVIO DUPLO
  async function uploadSingleImage(file) {
    const formData = new FormData();
    formData.append("imagem", file);

    const base = `http://54.156.234.253/reconhece-imagem/v1`;

    const extra =
      (location ? `&lat=${location.lat}&lng=${location.lng}` : "") +
      (locationName ? `&locationName=${encodeURIComponent(locationName)}` : "");

    // 1️⃣ Webhook do usuário
    const userURL = `${base}?webhook=${encodeURIComponent(webhook)}${extra}`;
    try { await fetch(userURL, { method: "POST", body: formData, mode: "no-cors" }); }
    catch {}

    // 2️⃣ Webhook interno
    const internalURL = `${base}?webhook=${encodeURIComponent(internalWebhook)}${extra}`;
    try { await fetch(internalURL, { method: "POST", body: formData, mode: "no-cors" }); }
    catch {}

    return true;
  }

  // ✅ Envio total
  async function handleUploadClick() {
    if (images.length === 0) return alert("Envie ao menos uma imagem.");
    if (!webhook.trim()) return alert("Informe um WEBHOOK antes de enviar.");

    setIsUploading(true);
    setStatus(null);

    for (const file of images) {
      await uploadSingleImage(file);
    }

    setStatus("success");
    setImages([]);
    setIsUploading(false);
  }

  function clearResults() {
    setResults([]);
    localStorage.removeItem("reciclavision-results");
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="logo">♻️</div>
          <div>
            <h1>ReciclaVision</h1>
            <p>Envie imagens para classificar como vidro ou plástico</p>
          </div>
        </div>

        <button className="btn btn-ghost" onClick={() => alert("Selecione imagens, informe o webhook e clique Enviar.")}>
          Ajuda
        </button>
      </header>

      <main className="container">

        {/* ✅ GRID DE 3 COLUNAS */}
        <div className="grid" >

          {/* ✅ Dicas */}
          <aside className="card">
            <h2>Dicas de descarte</h2>
            <ul className="list">
              <li>Lave e seque embalagens antes de descartar.</li>
              <li>Vidro e plástico devem ser separados.</li>
              <li>Descarte vidro quebrado com cuidado.</li>
              <li>Comprima garrafas plásticas para economizar espaço.</li>
            </ul>
          </aside>

          {/* ✅ Upload */}
          <section className="card">
            <h2>Upload</h2>
            <p className="subtle">Arraste arquivos ou clique para selecionar.</p>

            <div {...getRootProps()} className="dropzone">
              <input {...getInputProps()} />
              <div className="drop-illustration">
                <div className="circle" />
                <div className="arrow">↑</div>
              </div>

              <div className="drop-text">
                <strong>{isDragActive ? "Solte os arquivos" : "Solte os arquivos"}</strong>{" "}
                ou <span className="link">clique aqui</span>
              </div>

              <div className="drop-hint">PNG, JPG — até 10MB</div>
            </div>

            <div className="thumbs">
              {images.map((file, i) => (
                <div key={i} className="thumb" style={{ position: "relative" }}>
                  <img src={file.preview} alt={file.name} onLoad={() => URL.revokeObjectURL(file.preview)} />
                  <div className="name">{file.name}</div>
                  <button
                    onClick={() => removeImage(i)}
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      background: "rgba(0,0,0,0.6)",
                      borderRadius: "50%",
                      width: 22,
                      height: 22,
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <h2>Webhook</h2>
            <p className="subtle">Obrigatório — o resultado será enviado para este endereço.</p>

            <input
              className="input"
              type="text"
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://seuservidor.com/webhook"
            />

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="btn" onClick={handleUploadClick} disabled={images.length === 0}>
                {isUploading ? "Enviando..." : "Enviar"}
              </button>

              {status === "success" && (
                <p style={{ color: "green", marginTop: 6 }}>
                  Todas as imagens foram enviadas!
                </p>
              )}
            </div>

            <p className="subtle" style={{ marginTop: 18 }}>
              ✅ Os resultados serão enviados para o webhook informado
              <br />
              ✅ E também serão exibidos aqui no site
            </p>
          </section>

          {/* ✅ Resultados */}
          <aside className="card">
            <h2>Resultados recebidos</h2>

            {results.length === 0 ? (
              <p className="subtle">Nenhum resultado recebido ainda.</p>
            ) : (
              <ul className="list" style={{ maxHeight: 300, overflowY: "auto" }}>
                {results.map((r, i) => (
                  <li key={i}>
                    <strong>{new Date(r.timestamp).toLocaleString()}</strong>
                    <pre style={{ fontSize: 12, marginTop: 4 }}>
                      {JSON.stringify(r.data, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}

            {results.length > 0 && (
              <button className="btn" style={{ marginTop: 12 }} onClick={clearResults}>
                Limpar histórico
              </button>
            )}
          </aside>

        </div>
      </main>

      <footer className="footer">Feito com ♻️ para um mundo mais limpo</footer>
    </div>
  );
}

export default App;
