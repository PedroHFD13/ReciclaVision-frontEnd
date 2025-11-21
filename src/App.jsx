import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import "./App.css";

import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// ====== ENV ======
const REGION = import.meta.env.VITE_AWS_REGION || "us-east-1";
const ACCESS_KEY_ID = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
const BUCKET =
  import.meta.env.VITE_S3_BUCKET ||
  "arn:aws:s3:us-east-1:503821891242:accesspoint/s3-origin-put";

// Cliente do SDK v3
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    ...(import.meta.env.VITE_AWS_SESSION_TOKEN
      ? { sessionToken: import.meta.env.VITE_AWS_SESSION_TOKEN }
      : {}),
  },
});

// ---- logging para Vercel ----
async function logToVercel(level, data) {
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, ...data }),
    });
  } catch {}
}

// ===== Helpers =====
function getExt(file) {
  const n = file?.name || "";
  const i = n.lastIndexOf(".");
  if (i > -1 && i < n.length - 1) return n.slice(i + 1).toLowerCase();
  const t = (file?.type || "").toLowerCase();
  if (t.includes("jpeg")) return "jpg";
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  return "bin";
}

function makeObjectKey(file) {
  const ext = getExt(file);
  return `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
}

async function uploadDirectSDK(file, key) {
  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: file,
      ContentType: file.type || "application/octet-stream",
    },
    queueSize: 3,
    partSize: 5 * 1024 * 1024,
  });
  await uploader.done();
  return { key, via: "sdk" };
}

async function uploadViaPresigned(file, key) {
  const presignRes = await fetch("/api/s3-presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, contentType: file.type }),
  });
  if (!presignRes.ok) {
    const txt = await presignRes.text().catch(() => "");
    throw new Error(`presign failed (${presignRes.status}) ${txt}`);
  }
  const { url } = await presignRes.json();

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new Error(`PUT failed: ${xhr.status} ${xhr.responseText || ""}`));
    };
    xhr.onerror = () => reject(new Error("network error on PUT"));
    xhr.send(file);
  });

  return { key, via: "presigned" };
}

async function uploadWithFallback(file, key) {
  try {
    return await uploadDirectSDK(file, key);
  } catch (err) {
    await logToVercel("warn", {
      message: "sdk-upload-failed-fallback",
      error: { message: err?.message, name: err?.name },
      extra: { key },
    });
    return await uploadViaPresigned(file, key);
  }
}

function App() {
  const [images, setImages] = useState([]);
  const [email, setEmail] = useState("");
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

  async function handleUploadClick() {
    if (!images.length || isUploading) return;
    if (!email.trim()) {
      alert("Informe um e-mail antes de enviar.");
      return;
    }

    setIsUploading(true);
    setStatus(null);

    try {
      let successResult = null;

      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const key = makeObjectKey(file);

        try {
          const r = await uploadWithFallback(file, key);
          successResult = { index: i, ...r };
          break;
        } catch {}
      }

      if (!successResult) throw new Error("all-uploads-failed");

      const apiUrl =
        `/reconhece-imagem/v1?email=${encodeURIComponent(email)}` +
        (webhook ? `&webhook=${encodeURIComponent(webhook)}` : "") +
        (location ? `&lat=${location.lat}&lng=${location.lng}` : "") +
        (locationName ? `&locationName=${encodeURIComponent(locationName)}` : "");

      await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Key: successResult.key }),
      });

      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setIsUploading(false);
    }
  }

  // === UI ===
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
          onClick={() =>
            alert("Selecione umas imagens, informe e-mail e clique Enviar.")
          }
        >
          Ajuda
        </button>
      </header>

      <main className="container">
        {/* Agora usa APENAS seu grid oficial do CSS */}
        <div className="grid">

          {/* === COLUNA ESQUERDA === */}
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

            <h2>E-mail</h2>
            <p className="subtle">Será usado para identificar o arquivo enviado.</p>

            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
            />

            <h2>Webhook (opcional)</h2>
            <p className="subtle">Receberá o resultado via POST.</p>

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
                disabled={!email.trim() || images.length === 0}
              >
                {isUploading ? "Enviando..." : "Enviar"}
              </button>

              {status === "success" && (
                <p style={{ color: "green", marginTop: 6 }}>Upload realizado!</p>
              )}
              {status === "error" && (
                <p style={{ color: "red", marginTop: 6 }}>Erro ao enviar.</p>
              )}
            </div>

            <p className="subtle" style={{ marginTop: 20 }}>
              Após recebermos sua imagem, enviaremos o resultado por e-mail.
            </p>
          </section>

          {/* === COLUNA DIREITA (ASIDE) === */}
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
