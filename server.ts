import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Configuração de caminhos para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware para processar JSON no corpo das requisições
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: "browser-only" });
});

// Configuração do Vite ou Arquivos Estáticos
const configureApp = async () => {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }
};

// Inicializa a configuração e inicia o servidor
const startServer = async () => {
  await configureApp();

  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
    });
  }
};

startServer();

export default app;
