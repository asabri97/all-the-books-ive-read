import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import { loadEnv } from "vite";
import { searchCatalogue } from "../src/lib/librarySearch.functions";

type SearchHost = {
  config: { mode: string; envDir: string | false; root: string };
  middlewares: Connect.Server;
};

async function readJson(req: IncomingMessage): Promise<{ query?: unknown }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_000) throw new Error("too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as { query?: unknown };
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function attach(server: SearchHost) {
  const env = loadEnv(server.config.mode, server.config.envDir || server.config.root, "");
  server.middlewares.use(async (req, res, next) => {
    const url = req.url?.split("?")[0];
    if (url !== "/api/search" || req.method !== "POST") {
      next();
      return;
    }
    try {
      const body = await readJson(req);
      const query = typeof body.query === "string" ? body.query.slice(0, 500) : "";
      const result = await searchCatalogue(query, {
        openai: env.OPENAI_API_KEY,
        gemini: env.GEMINI_API_KEY,
        anthropic: env.ANTHROPIC_API_KEY,
      });
      if ("error" in result) {
        send(res, result.status, { error: result.error });
        return;
      }
      send(res, 200, result);
    } catch {
      send(res, 500, { error: "The shelves couldn't be read just now." });
    }
  });
}

export function librarySearchPlugin(): Plugin {
  return {
    name: "library-search",
    configureServer(server) {
      attach(server as ViteDevServer);
    },
    configurePreviewServer(server) {
      attach(server as PreviewServer);
    },
  };
}
