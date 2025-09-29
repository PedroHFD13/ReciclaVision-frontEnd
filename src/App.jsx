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

// Cliente do SDK v3 (usado no caminho primário)
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

// ---- logging para Vercel (serverless) ----
async function logToVercel(level, data) {
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, ...data }),
    });
  } catch {/* silencioso */}
}

// ===== Helpers p/ nome do arquivo =====
function sanitizeEmail(email) {
  return (email || "noemail").trim().replace(/\s+/g, "").replace(/[\\/]/g, "-");
}
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
function makeObjectKey(file, email) {
  const safe = sanitizeEmail(email);
  const ext = getExt(file);
  const ts = Date.now();
  return `uploads/${safe}-${ts}.${ext}`;
}

/** Upload primário: SDK v3 direto no S3 */
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

/** Upload fallback: URL pré-assinada via /api/s3-presign */
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

/** Tenta SDK → se falhar, cai para presigned */
async function uploadWithFallback(file, key) {
  try {
    const r = await uploadDirectSDK(file, key);
    return r;
  } catch (err) {
    await logToVercel("warn", {
      message: "sdk-upload-failed-fallback",
      error: { message: err?.message, name: err?.name },
      extra: { key },
    });
    const r2 = await uploadViaPresigned(file, key);
    return r2;
  }
}

function App() {
  const [images, setImages] = useState([]);
  const [email, setEmail] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState(null); // "success" | "error" | null

  useEffect(() => {
    if (!BUCKET) logToVercel("warn", { message: "missing-bucket" });
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

    logToVercel("info", {
      message: "files-added",
      extra: {
        count: acceptedFiles.length,
        files: acceptedFiles.map((f) => ({
          name: f.name,
          type: f.type,
          size: f.size,
        })),
      },
    });
  }, []);

  function removeImage(index) {
    setImages((prev) => {
      const img = prev[index];
      try { URL.revokeObjectURL(img?.preview); } catch {}
      return prev.filter((_, i) => i !== index);
    });
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
  });

  // Envia EM ORDEM e PARA no primeiro sucesso
  async function handleUploadClick() {
    if (!images.length || isUploading) return;
    if (!email.trim()) {
      alert("Informe um e-mail antes de enviar.");
      return;
    }
    setIsUploading(true);
    setStatus(null);

    logToVercel("info", {
      message: "upload-start",
      extra: {
        bucket: BUCKET,
        region: REGION,
        fileCount: images.length,
        email,
        files: images.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      },
    });

    try {
      let successResult = null;

      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const key = makeObjectKey(file, email); // {email}-{timestamp}.{ext}
        try {
          const r = await uploadWithFallback(file, key);
          successResult = { index: i, ...r };
          await logToVercel("info", {
            message: "upload-one-success",
            extra: { index: i, name: file.name, via: r.via, key: r.key },
          });
          break;
        } catch (err) {
          await logToVercel("warn", {
            message: "upload-one-failed",
            error: { name: err?.name, message: err?.message },
            extra: { index: i, name: file.name, key },
          });
        }
      }

      if (successResult) {
        setStatus("success");
        await logToVercel("info", {
          message: "upload-success",
          extra: { firstSuccess: successResult },
        });
      } else {
        throw new Error("all-uploads-failed");
      }
    } catch (err) {
      await logToVercel("error", {
        message: "upload-failed",
        error: {
          name: err?.name,
          message: err?.message,
          stack: err?.stack?.split("\n").slice(0, 5).join("\n"),
          toString: String(err),
        },
        extra: { bucket: BUCKET, region: REGION, fileCount: images.length, email },
      });
      setStatus("error");
    } finally {
      setIsUploading(false);
    }
  }

  // ===== UI =====
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
            alert("Selecione 1 ou mais imagens, informe seu e-mail e clique em Enviar.")
          }
        >
          Ajuda
        </button>
      </header>

      <main className="container">
        <div className="grid">
          <section className="card">
            <h2>Upload</h2>
            <p className="subtle">
              Arraste e solte arquivos aqui, ou clique para selecionar.
            </p>

            <div
              {...getRootProps({ tabIndex: 0 })}
              className="dropzone"
              aria-label="Área para soltar arquivos"
            >
              <input {...getInputProps()} />
              <div className="drop-illustration">
                <div className="circle" />
                <div className="arrow">↑</div>
              </div>
              <div className="drop-text">
                <strong>
                  {isDragActive ? "Solte para adicionar" : "Solte o arquivo"}
                </strong>{" "}
                ou <span className="link">clique para escolher</span>
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
                      color: "white",
                      border: "none",
                      borderRadius: "50%",
                      width: 24,
                      height: 24,
                      cursor: "pointer",
                      lineHeight: "24px",
                    }}
                    aria-label="Remover imagem"
                    title="Remover"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* === E-mail com o mesmo padrão de títulos/legendas === */}
            <div style={{ marginTop: 12 }}>
              <h2 id="email-title">E-mail</h2>
              <p className="subtle">Será usado para identificar o arquivo enviado.</p>
              <input
                id="email"
                type="email"
                aria-labelledby="email-title"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="input"
                style={{
                  // fallback caso .input não exista no seu App.css
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: "1rem",
                  fontFamily: "inherit",
                  color: "#333",
                }}
              />
            </div>

            {/* Botão centralizado + mensagens de status */}
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button
                className="btn"
                onClick={handleUploadClick}
                disabled={!images.length || isUploading || !email.trim()}
                title={!email.trim() ? "Informe um e-mail" : undefined}
              >
                {isUploading ? "Enviando..." : "Enviar"}
              </button>
              {status === "success" && (
                <p style={{ color: "green", marginTop: 8 }}>
                  ✅ Upload realizado com sucesso!
                </p>
              )}
              {status === "error" && (
                <p style={{ color: "red", marginTop: 8 }}>
                  ❌ Erro no upload. Veja os logs na Vercel e tente novamente.
                </p>
              )}
            </div>

            {/* Texto informativo ADICIONADO FORA da div do upload/email, com mais espaçamento */}
            <div style={{ marginTop: 32 }}>
              <p className="subtle">
                Após recebermos sua imagem, o resultado da análise será enviado por e-mail,
                indicando a probabilidade de ser vidro ou plástico.
              </p>
            </div>
          </section>

          <aside className="card">
            <h2>Dicas de descarte</h2>
            <ul className="list">
              <li>Lave e seque embalagens antes de descartar.</li>
              <li>Vidro e plástico vão em recipientes diferentes.</li>
              <li>Faça o devido descarte de vidro quebrado para não machucar os coletores.</li>
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
