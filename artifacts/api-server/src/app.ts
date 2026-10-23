import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import healthRouter from "./routes/health";
import portalRouter from "./routes/portal";
import adminRouter from "./routes/admin";
import { logger } from "./lib/logger";

export type ServerSurface = "guest" | "admin";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, "public");
const captiveProbePaths = [
  "/generate_204",
  "/hotspot-detect.html",
  "/connecttest.txt",
  "/ncsi.txt",
  "/success.txt",
];

export function createApp(surface: ServerSurface): Express {
  const app: Express = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: "32kb" }));
  app.use(express.urlencoded({ extended: true, limit: "32kb" }));

  app.use("/api", healthRouter);
  if (surface === "guest") {
    app.use("/api", portalRouter);
  } else {
    app.use("/api", adminRouter);
  }

  app.use(express.static(publicDir, { index: false }));

  if (surface === "guest") {
    app.get(captiveProbePaths, (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(path.join(publicDir, "index.html"));
    });
    app.head(captiveProbePaths, (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendStatus(200);
    });
  }

  app.get("/", (_req, res) => {
    if (surface === "admin") {
      res.redirect("/admin");
      return;
    }
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/admin", (req, res) => {
    if (surface !== "admin") {
      res.status(404).send("Not found");
      return;
    }
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/admin/*splat", (req, res) => {
    if (surface !== "admin") {
      res.status(404).send("Not found");
      return;
    }
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use((_req, res) => {
    res.status(404).send("Not found");
  });

  return app;
}

/**
 * A deliberately simple HTTP front door for captive-portal detection.
 *
 * It only issues a redirect to the local guest portal. It does not proxy,
 * inspect, store, or forward guest traffic.
 */
export function createCaptiveRedirectApp(
  hotspotHost: string,
  guestPort: number,
): Express {
  const app: Express = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use((req, res) => {
    const requestedPath = req.originalUrl || "/";
    const safePath = requestedPath.startsWith("/")
      ? requestedPath
      : `/${requestedPath}`;
    const target = `http://${hotspotHost}:${guestPort}${safePath}`;

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.redirect(302, target);
  });

  return app;
}
