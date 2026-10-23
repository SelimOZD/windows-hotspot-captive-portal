import { createApp, createCaptiveRedirectApp } from "./app";
import { logger } from "./lib/logger";
import { getDatabasePath } from "./lib/local-db";
import { startCaptiveDns } from "./lib/captive-dns";

function readPort(name: string, fallback: number): number {
  const raw = process.env[name] ?? String(fallback);
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid ${name}: "${raw}"`);
  }
  return port;
}

function readOptionalPort(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "" || raw.toLowerCase() === "disabled") {
    return null;
  }
  return readPort(name, 0);
}

const hotspotHost =
  process.env.HOTSPOT_HOST ??
  (process.platform === "win32" ? "192.168.5.1" : "0.0.0.0");
const guestPort = readPort("GUEST_PORT", readPort("PORT", 8080));
const adminPort = readPort("ADMIN_PORT", 8081);
const captiveRedirectPort = readOptionalPort("CAPTIVE_REDIRECT_PORT");

if (process.env.INTERNET_FORWARDING === "true") {
  throw new Error("INTERNET_FORWARDING must remain false for Local Wi-Fi Portal.");
}

const guestServer = createApp("guest").listen(guestPort, hotspotHost);

guestServer.on("listening", () => {
  logger.info({ host: hotspotHost, port: guestPort }, "Guest portal listening");
});

guestServer.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRNOTAVAIL") {
    logger.error(
      { host: hotspotHost, port: guestPort },
      "The hotspot address is not assigned on this PC yet. Start the MyPublicWiFi hotspot first, then start the portal again.",
    );
  } else if (error.code === "EADDRINUSE") {
    logger.error(
      { host: hotspotHost, port: guestPort },
      "The guest portal port is already in use by another program.",
    );
  } else {
    logger.error(
      { err: error, host: hotspotHost, port: guestPort },
      "Guest portal failed to start",
    );
  }
  process.exit(1);
});

// Answers every DNS lookup with the hotspot address so guest devices resolve the
// connectivity-probe hostnames and show the captive-portal prompt.
const captiveDns =
  process.env.CAPTIVE_DNS === "disabled"
    ? null
    : startCaptiveDns(hotspotHost, hotspotHost);

const captiveRedirectServer =
  captiveRedirectPort !== null && captiveRedirectPort !== guestPort
    ? createCaptiveRedirectApp(hotspotHost, guestPort).listen(
        captiveRedirectPort,
        hotspotHost,
      )
    : null;

if (captiveRedirectServer) {
  captiveRedirectServer.on("listening", () => {
    logger.info(
      {
        host: hotspotHost,
        port: captiveRedirectPort,
        target: `http://${hotspotHost}:${guestPort}`,
      },
      "Captive portal redirect listening",
    );
  });

  captiveRedirectServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.warn(
        {
          host: hotspotHost,
          port: captiveRedirectPort,
          target: `http://${hotspotHost}:${guestPort}`,
        },
        "Captive portal redirect could not bind because the port is already in use",
      );
      return;
    }
    logger.error(
      { err: error, host: hotspotHost, port: captiveRedirectPort },
      "Captive portal redirect server failed",
    );
  });
}

const adminServer = createApp("admin").listen(adminPort, "127.0.0.1");

adminServer.on("listening", () => {
  logger.info({ host: "127.0.0.1", port: adminPort }, "Admin console listening");
  logger.info({ database: getDatabasePath() }, "Local SQLite database ready");
});

adminServer.on("error", (error: NodeJS.ErrnoException) => {
  logger.error({ err: error, port: adminPort }, "Operator console failed to start");
  process.exit(1);
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down local portal");
  captiveDns?.close();
  guestServer.close(() => {
    const closeAdmin = () => adminServer.close(() => process.exit(0));
    if (captiveRedirectServer) {
      captiveRedirectServer.close(closeAdmin);
    } else {
      closeAdmin();
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
