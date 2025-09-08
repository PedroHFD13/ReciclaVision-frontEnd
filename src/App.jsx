import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import "./App.css";

function App() {
  const [images, setImages] = useState([]);

  const onDrop = useCallback((acceptedFiles) => {
    setImages(prev =>
      prev.concat(
        acceptedFiles.map(file =>
          Object.assign(file, { preview: URL.createObjectURL(file) })
        )
      )
    );
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] }
  });

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
        <button className="btn btn-ghost" onClick={()=>alert('Este front conecta ao S3 e ao classificador. A UI aqui é só uma camada visual.')}>
          Ajuda
        </button>
      </header>

      <main className="container">
        <div className="grid">
          <section className="card">
            <h2>Upload</h2>
            <p className="subtle">Arraste e solte arquivos aqui, ou clique para selecionar.</p>

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
                <strong>{isDragActive ? "Solte para enviar" : "Solte o arquivo"}</strong> ou <span className="link">clique para escolher</span>
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
              <li>Faça o devido descarte de vidro quebrado, para não machucar os coletores.</li>
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
