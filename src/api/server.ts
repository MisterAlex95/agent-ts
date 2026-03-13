import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import { registerRoutes } from "./routes.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../public");

function validateConfig(): void {
  const missing: string[] = [];
  if (!process.env.QDRANT_URL) missing.push("QDRANT_URL");
  if (!process.env.AGENT_BASE_URL)
    missing.push("AGENT_BASE_URL (default http://localhost:11434 will be used)");
  if (!process.env.AGENT_MODEL) missing.push("AGENT_MODEL");
  if (!process.env.EMBEDDING_MODEL)
    missing.push("EMBEDDING_MODEL");

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] Some environment variables are missing or rely on defaults:",
      missing.join(", "),
    );
  }
}

async function main(): Promise<void> {
  validateConfig();

  const app = express();
  app.use(express.json());

  registerRoutes(app);
  app.get("/", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
  app.use(express.static(PUBLIC_DIR));

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: err.message });
    },
  );

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`HTTP server listening on http://0.0.0.0:${port}`);
  });
}

void main();

