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
    console.log("📁 ARQUIVOS RECEBIDOS:", acceptedFiles);
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
      try {
        URL.revokeObjectURL(img.preview);
      } catch {}
      return prev.filter((_, i) => i !== index);
    });
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
  });

  // ===============================================================
  //  ENVIO DE IMAGEM — AGORA SOMENTE WEBHOOK (OBRIGATÓRIO)
  // ===============================================================
  async function uploadSingleImage(file) {
    console.log("=====================================================");
    console.log("📤 Iniciando envio da imagem:", file.name);
    console.log("📦 Tamanho:", file.size, "bytes");
    console.log("📄 Tipo:", file.type);
    console.log("=====================================================");

    const formData = new FormData();
    formData.append("imagem", file);

    const query =
      `?webhook=${encodeURIComponent(webhook)}` +
      (location ? `&lat=${location.lat}&lng=${location.lng}` : "") +
      (locationName ? `&locationName=${encodeURIComponent(locationName)}` : "");

    const finalURL = `http://54.156.234.253/reconhece-imagem/v1${query}`;

    console.log("🌐 URL final para envio:", finalURL);

    try {
      console.log("📨 Enviando requisição POST...");
      const res = await fetch(finalURL, {
        method: "POST",
        body: formData,
      });

      console.log("📥 Status:", res.status, res.statusText);
      const responseText = await res.text();
      console.log("📄 Resposta:", responseText);

      if (!res.ok) {
        console.error("❌ Backend retornou erro:", responseText);
        throw new Error(`Falha ao enviar imagem: ${file.name}`);
      }

      console.log("✅ Imagem enviada com sucesso:", file.name);
      return true;
    } catch (err) {
      console.error("🔥 ERRO NO ENVIO (FRONT-END):", err);
      throw err;
    }
  }

  // ===============================================================
  // ENVIO DE TODAS AS IMAGENS (1 REQ POR IMAGEM)
  // ===============================================================
  async function handleUploadClick() {
    console.log("=====================================================");
    console.log("🚀 INICIANDO ENVIO DE TODAS AS IMAGENS");
    console.log("📸 Total de imagens:", images.length);
    console.log("🔗 Webhook:", webhook);
    console.log("=====================================================");

    if (images.length === 0) {
      alert("Envie ao menos uma imagem.");
      console.log("❌ BLOQUEADO — nenhuma imagem selecionada");
      return;
    }

    if (!webhook.trim()) {
      console.log("❌ BLOQUEADO — webhook obrigatório não informado");
      alert("Informe um WEBHOOK antes de enviar.");
      return;
    }

    console.log("✔ Validação OK — iniciando uploads...");

    setIsUploading(true);
    setStatus(null);

    try {
      for (const file of images) {
        console.log("---------------------------------------------");
        console.log("📤 Enviando imagem:", file.name);
        await uploadSingleImage(file);
      }

      console.log("🎉 TODAS AS IMAGENS FORAM ENVIADAS COM SUCESSO!");
      setStatus("success");
    } catch (err) {
      console.log("💥 ERRO DURANTE O ENVIO:", err);
      setStatus("error");
    } finally {
      console.log("🏁 FINALIZADO");
      setIsUploading(false);
    }
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

        <button
          className="btn btn-ghost"
          onClick={() => alert("Selecione imagens, informe o webhook e clique Enviar.")}
        >
          Ajuda
        </button>
      </header>

      <main className="container">
        <div className="grid">

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
                  <img
                    src={file.preview}
                    alt={file.name}
                    onLoad={() => URL.revokeObjectURL(file.preview)}
                  />
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
              <button
                className="btn"
                onClick={handleUploadClick}
                disabled={images.length === 0}
              >
                {isUploading ? "Enviando..." : "Enviar"}
              </button>

              {status === "success" && (
                <p style={{ color: "green", marginTop: 6 }}>
                  Todas as imagens foram enviadas!
                </p>
              )}
              {status === "error" && (
                <p style={{ color: "red", marginTop: 6 }}>
                  Erro ao enviar algumas imagens.
                </p>
              )}
            </div>

          </section>

          <aside className="card">
            <h2>Dicas de descarte</h2>
            <ul className="list">
              <li>Lave e seque embalagens antes de descartar.</li>
              <li>Vidro e plástico devem ser separados.</li>
              <li>Descarte vidro quebrado com cuidado.</li>
              <li>Comprima garrafas plásticas para economizar espaço.</li>
            </ul>
          </aside>

        </div>
      </main>

      <footer className="footer">Feito com ♻️ para um mundo mais limpo</footer>
    </div>
  );
}

export default App;
