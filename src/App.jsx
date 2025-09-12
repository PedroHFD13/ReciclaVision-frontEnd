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

/** Upload primário: SDK v3 direto no S3 */
async function uploadDirectSDK(file) {
  const key = `uploads/${Date.now()}_${file.name}`;
  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET, // pode ser bucket name OU Access Point ARN
      Key: key,
      Body: file,
      ContentType: file.type || "application/octet-stream",
      // ACL removido (reduz preflight/CORS); padrão já é "private"
    },
    queueSize: 3,
    partSize: 5 * 1024 * 1024,
  });

  // uploader.on("httpUploadProgress", (e) => console.log(file.name, e));
  await uploader.done();
  return { key, via: "sdk" };
}

/** Upload fallback: URL pré-assinada via /api/s3-presign */
async function uploadViaPresigned(file) {
  // 1) pede URL pré-assinada
  const presignRes = await fetch("/api/s3-presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  if (!presignRes.ok) {
    const txt = await presignRes.text().catch(() => "");
    throw new Error(`presign failed (${presignRes.status}) ${txt}`);
  }
  const { url, key } = await presignRes.json();

  // 2) PUT direto p/ S3 (sem SDK) — mantém UI intacta
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
async function uploadWithFallback(file) {
  try {
    const r = await uploadDirectSDK(file);
    return r;
  } catch (err) {
    await logToVercel("warn", {
      message: "sdk-upload-failed-fallback",
      error: { message: err?.message, name: err?.name },
    });
    const r2 = await uploadViaPresigned(file);
    return r2;
  }
}

function App() {
  const [images, setImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState(null); // "success" | "error" | null

  // Log de ajuda (não quebra UI)
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
  });

  async function handleUploadClick() {
    if (!images.length || isUploading) return;
    setIsUploading(true);
    setStatus(null);

    logToVercel("info", {
      message: "upload-start",
      extra: {
        bucket: BUCKET,
        region: REGION,
        fileCount: images.length,
        files: images.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      },
    });

    try {
      const results = await Promise.all(images.map(uploadWithFallback));

      logToVercel("info", {
        message: "upload-success",
        extra: { results }, // cada item tem {key, via: "sdk"|"presigned"}
      });

      setStatus("success");
      // Opcional: limpar após sucesso
      // setImages([]);
    } catch (err) {
      logToVercel("error", {
        message: "upload-failed",
        error: {
          name: err?.name,
          message: err?.message,
          stack: err?.stack?.split("\n").slice(0, 5).join("\n"),
          toString: String(err),
        },
        extra: { bucket: BUCKET, region: REGION, fileCount: images.length },
      });
      setStatus("error");
    } finally {
      setIsUploading(false);
    }
  }

  // ===== UI ORIGINAL (sem alterações de estilo) =====
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
            alert("Selecione 1 ou mais imagens e clique em Enviar para subir ao S3.")
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
                <div key={i} className="thumb">
                  <img
                    src={file.preview}
                    alt={file.name}
                    onLoad={() => URL.revokeObjectURL(file.preview)}
                  />
                  <div className="name">{file.name}</div>
                </div>
              ))}
            </div>

            {/* Botão centralizado + mensagens de status (sem novo CSS) */}
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button
                className="btn"
                onClick={handleUploadClick}
                disabled={!images.length || isUploading}
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
