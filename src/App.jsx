import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import "./App.css";

// === S3 (AWS SDK v3) — sem mudanças visuais ===
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const REGION = import.meta.env.VITE_AWS_REGION;
const ACCESS_KEY_ID = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
const BUCKET = import.meta.env.VITE_S3_BUCKET || "tcc-original-bucket";

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    sessionToken: SESSION_TOKEN,
  },
});

async function uploadFileToS3(file) {
  const key = `uploads/${Date.now()}_${file.name}`;

  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: file,
      ContentType: file.type || "application/octet-stream",
      ACL: "private",
    },
    queueSize: 3,
    partSize: 5 * 1024 * 1024,
  });

  // Sem barra de progresso na UI para não mexer em estilo; mas dá para logar no console.
  // uploader.on("httpUploadProgress", (e) => console.log(file.name, e));

  await uploader.done();
}

function App() {
  const [images, setImages] = useState([]);

  // Mantém sua lógica de preview
  const onDrop = useCallback(async (acceptedFiles) => {
    setImages((prev) =>
      prev.concat(
        acceptedFiles.map((file) =>
          Object.assign(file, { preview: URL.createObjectURL(file) })
        )
      )
    );

    try {
      await Promise.all(acceptedFiles.map(uploadFileToS3));
      alert("Envio realizado com sucesso ✅");
    } catch (err) {
      console.error(err);
      alert("Falha no envio ao S3. Verifique CORS/credenciais.");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
  });

  // ===== A PARTIR DAQUI É SUA UI ORIGINAL (sem alterações de estilo) =====
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
            alert("O front envia automaticamente para o S3 ao soltar/selecionar os arquivos.")
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
                  {isDragActive ? "Solte para enviar" : "Solte o arquivo"}
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
