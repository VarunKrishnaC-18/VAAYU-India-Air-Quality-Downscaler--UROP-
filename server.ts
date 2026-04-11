import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findAvailablePort(startPort: number) {
  for (let port = startPort; port < startPort + 100; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const tester = net.createServer();
      tester.unref();
      tester.on("error", () => resolve(false));
      tester.listen(port, "0.0.0.0", () => {
        tester.close(() => resolve(true));
      });
    });

    if (available) {
      return port;
    }
  }

  throw new Error(`No available ports found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const PORT = await findAvailablePort(3000);
  const HMR_PORT = await findAvailablePort(24678);

  app.use(express.json());

  const backendBaseUrl = "http://127.0.0.1:8000";

  const proxyGet = (route: string, targetPath: string) => {
    app.get(route, async (_req, res) => {
      try {
        const response = await axios.get(`${backendBaseUrl}${targetPath}`);
        res.json(response.data);
      } catch (error) {
        console.error(`Backend proxy error for ${targetPath}:`, error);
        res.status(502).json({ error: `Failed to fetch ${targetPath}` });
      }
    });
  };

  const proxyPost = (route: string, targetPath: string) => {
    app.post(route, async (req, res) => {
      try {
        const response = await axios.post(`${backendBaseUrl}${targetPath}`, req.body);
        res.json(response.data);
      } catch (error) {
        console.error(`Backend proxy error for ${targetPath}:`, error);
        res.status(502).json({ error: `Failed to post ${targetPath}` });
      }
    });
  };

  // API Proxy for OpenAQ to avoid CORS issues
  app.get("/api/openaq", async (req, res) => {
    try {
      const response = await axios.get("https://api.openaq.org/v2/latest", {
        params: req.query,
      });
      res.json(response.data);
    } catch (error) {
      console.error("OpenAQ Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch data from OpenAQ" });
    }
  });

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  proxyGet("/api/cities", "/cities");
  proxyGet("/api/map", "/map");
  proxyGet("/api/metrics", "/metrics");
  proxyGet("/api/backend-health", "/");
  proxyPost("/api/predict", "/predict");

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: HMR_PORT } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Vite HMR running on port ${HMR_PORT}`);
  });
}

startServer();
