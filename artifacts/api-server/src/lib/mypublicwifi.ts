import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { logger } from "./logger";

export type WifiSession = {
  connectedAt: string | null;
  disconnectedAt: string | null;
  minutes: number;
  bytesDownload: number;
  bytesUpload: number;
};

export type WifiDevice = {
  mac: string;
  hostNames: string[];
  ipAddresses: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  sessions: WifiSession[];
  totalMinutes: number;
  totalBytesDownload: number;
  totalBytesUpload: number;
};

export function myPublicWifiRoot(): string {
  return process.env.MYPUBLICWIFI_ROOT ?? "C:\\Program Files (x86)\\MyPublicWiFi";
}

function normalizeMac(raw: string): string | null {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return (hex.match(/.{2}/g) as string[]).join("-");
}

// MyPublicWiFi stores MAC addresses as little-endian integers, e.g.
// 240726220464204 -> 4C-E0-DB-70-F0-DA
function macFromInteger(value: unknown): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const hex = Math.floor(numeric).toString(16).padStart(12, "0").slice(-12).toUpperCase();
  return (hex.match(/.{2}/g) as string[]).reverse().join("-");
}

// MyPublicWiFi lease files use "dd.MM.yyyy HH:mm:ss".
function parseLeaseDate(value: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// The database uses "yyyy-MM-dd HH:mm:ss".
function parseDbDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value.trim().replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ensureDevice(map: Map<string, WifiDevice>, mac: string): WifiDevice {
  let device = map.get(mac);
  if (!device) {
    device = {
      mac,
      hostNames: [],
      ipAddresses: [],
      firstSeen: null,
      lastSeen: null,
      sessions: [],
      totalMinutes: 0,
      totalBytesDownload: 0,
      totalBytesUpload: 0,
    };
    map.set(mac, device);
  }
  return device;
}

function touch(device: WifiDevice, at: string | null): void {
  if (!at) return;
  if (!device.firstSeen || at < device.firstSeen) device.firstSeen = at;
  if (!device.lastSeen || at > device.lastSeen) device.lastSeen = at;
}

function readLeases(root: string, devices: Map<string, WifiDevice>): void {
  const leaseDir = path.join(root, "Dhcp");
  if (!fs.existsSync(leaseDir)) return;

  for (const entry of fs.readdirSync(leaseDir)) {
    const full = path.join(leaseDir, entry);
    if (!fs.statSync(full).isFile()) continue;

    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const parts = line.split(";");
      if (parts.length < 4) continue;
      const mac = normalizeMac(parts[2] ?? parts[1] ?? "");
      if (!mac) continue;
      const device = ensureDevice(devices, mac);
      const ip = parts[0]?.trim();
      if (ip && !device.ipAddresses.includes(ip)) device.ipAddresses.push(ip);
      const hostName = parts[4]?.trim();
      if (hostName && !device.hostNames.includes(hostName)) device.hostNames.push(hostName);
      touch(device, parseLeaseDate(parts[3] ?? ""));
    }
  }
}

function readIpToMac(root: string, devices: Map<string, WifiDevice>): void {
  const file = path.join(root, "IPToMAC");
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([\d.]+)=(.+)$/.exec(line.trim());
    if (!match) continue;
    const mac = normalizeMac(match[2]);
    if (!mac) continue;
    const device = ensureDevice(devices, mac);
    if (!device.ipAddresses.includes(match[1])) device.ipAddresses.push(match[1]);
  }
}

function readDatabase(root: string, devices: Map<string, WifiDevice>): void {
  const source = path.join(root, "Data.db");
  if (!fs.existsSync(source)) return;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpw-db-"));
  const copy = path.join(tempDir, "Data.db");
  try {
    fs.copyFileSync(source, copy);
    const db = new DatabaseSync(copy);
    try {
      const hostRows = db
        .prepare("SELECT MAC, HostName FROM ClientHostNames")
        .all() as Array<Record<string, unknown>>;
      for (const row of hostRows) {
        const mac = macFromInteger(row.MAC);
        if (!mac) continue;
        const device = ensureDevice(devices, mac);
        const name = String(row.HostName ?? "").trim();
        if (name && !device.hostNames.includes(name)) device.hostNames.push(name);
      }

      const logRows = db
        .prepare(
          "SELECT MAC, ConnectedTime, DisconnectedTime, MinutesDuration, BytesDownload, BytesUpload FROM ClientLogs",
        )
        .all() as Array<Record<string, unknown>>;
      for (const row of logRows) {
        const mac = macFromInteger(row.MAC);
        if (!mac) continue;
        const device = ensureDevice(devices, mac);
        const connectedAt = parseDbDate(row.ConnectedTime);
        const disconnectedAt = parseDbDate(row.DisconnectedTime);
        const minutes = Number(row.MinutesDuration) || 0;
        const bytesDownload = Number(row.BytesDownload) || 0;
        const bytesUpload = Number(row.BytesUpload) || 0;
        device.sessions.push({ connectedAt, disconnectedAt, minutes, bytesDownload, bytesUpload });
        device.totalMinutes += minutes;
        device.totalBytesDownload += bytesDownload;
        device.totalBytesUpload += bytesUpload;
        touch(device, connectedAt);
        touch(device, disconnectedAt);
      }
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export type WifiDeviceReport = {
  available: boolean;
  root: string;
  devices: WifiDevice[];
};

export function readMyPublicWifiDevices(): WifiDeviceReport {
  const root = myPublicWifiRoot();
  const devices = new Map<string, WifiDevice>();
  const available = fs.existsSync(root);

  if (available) {
    for (const [label, reader] of [
      ["leases", readLeases],
      ["IPToMAC", readIpToMac],
      ["database", readDatabase],
    ] as const) {
      try {
        reader(root, devices);
      } catch (error) {
        logger.warn({ err: error, source: label }, "MyPublicWiFi data read failed");
      }
    }
  }

  const list = [...devices.values()];
  for (const device of list) {
    device.sessions.sort((a, b) => (a.connectedAt ?? "").localeCompare(b.connectedAt ?? ""));
  }
  list.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));

  return { available, root, devices: list };
}

export type DeviceIdentity = {
  mac: string | null;
  hostName: string | null;
};

function readLeaseLines(root: string): string[] {
  const leaseDir = path.join(root, "Dhcp");
  if (!fs.existsSync(leaseDir)) return [];
  const lines: string[] = [];
  for (const entry of fs.readdirSync(leaseDir)) {
    const full = path.join(leaseDir, entry);
    if (!fs.statSync(full).isFile()) continue;
    lines.push(...fs.readFileSync(full, "utf8").split(/\r?\n/));
  }
  return lines;
}

/**
 * Resolve the device behind an IP address as MyPublicWiFi currently sees it.
 * Called at submission time so the record keeps a stable MAC, even after the
 * DHCP lease is later reused by a different device.
 */
export function lookupDeviceByIp(ip: string | null | undefined): DeviceIdentity {
  const result: DeviceIdentity = { mac: null, hostName: null };
  const target = (ip ?? "").trim();
  if (!target) return result;

  const root = myPublicWifiRoot();
  if (!fs.existsSync(root)) return result;

  // Dhcp leases: ip;macHex;MAC;timestamp;hostname
  try {
    for (const line of readLeaseLines(root)) {
      const parts = line.split(";");
      if (parts.length < 4 || parts[0].trim() !== target) continue;
      result.mac = normalizeMac(parts[2] ?? parts[1] ?? "") ?? result.mac;
      const name = parts[4]?.trim();
      if (name) result.hostName = name;
    }
  } catch (error) {
    logger.warn({ err: error }, "lease lookup failed");
  }

  // IPToMAC: ip=MAC
  try {
    const mapFile = path.join(root, "IPToMAC");
    if (fs.existsSync(mapFile)) {
      for (const line of fs.readFileSync(mapFile, "utf8").split(/\r?\n/)) {
        const match = /^([\d.]+)=(.+)$/.exec(line.trim());
        if (match && match[1] === target) result.mac = normalizeMac(match[2]) ?? result.mac;
      }
    }
  } catch (error) {
    logger.warn({ err: error }, "IPToMAC lookup failed");
  }

  return result;
}

export type UrlLogEntry = {
  at: string | null;
  hostName: string | null;
  target: string;
  port: number | null;
  kind: "dns" | "http" | "other";
};

/**
 * Reads MyPublicWiFi's per-device URL/DNS log. This is browsing-activity data,
 * so it is only surfaced in the operator console and is disclosed to guests in
 * the portal privacy notice.
 */
export function readUrlLog(mac: string, limit = 200): UrlLogEntry[] {
  const dir = path.join(myPublicWifiRoot(), "UrlLog");
  if (!fs.existsSync(dir)) return [];

  const target = mac.trim().toUpperCase();
  const entries: UrlLogEntry[] = [];

  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".txt"));
  } catch {
    return [];
  }
  files.sort();

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      const [stamp, , , hostName, macColumn, targetValue, portValue] = parts;
      if (normalizeMac(macColumn ?? "") !== target) continue;
      const port = Number(portValue);
      entries.push({
        at: parseLeaseDate(stamp ?? ""),
        hostName: hostName?.trim() || null,
        target: targetValue?.trim() ?? "",
        port: Number.isFinite(port) ? port : null,
        kind: port === 53 ? "dns" : port === 80 || port === 443 ? "http" : "other",
      });
    }
  }

  return entries.slice(-limit).reverse();
}
