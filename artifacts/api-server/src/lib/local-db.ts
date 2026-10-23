import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type PortalSettings = {
  id: string;
  networkName: string;
  portalTitle: string;
  portalMessage: string;
  privacyNotice: string;
  policyVersion: string;
  retentionDays: number;
  hotspotAddress: string;
  internetForwarding: boolean;
  updatedAt: Date;
};

export type AccessRequest = {
  requestId: string;
  displayName: string;
  contact: string | null;
  status: "pending" | "approved" | "denied" | "expired";
  policyVersion: string;
  purposeAccepted: boolean;
  privacyAccepted: boolean;
  submittedAt: Date;
  decidedAt: Date | null;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  macAddress: string | null;
  deviceHostname: string | null;
  deviceVendor: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  screen: string | null;
  viewport: string | null;
  language: string | null;
  timezone: string | null;
  platform: string | null;
  hardware: string | null;
  touchPoints: number | null;
  connectionType: string | null;
  acceptLanguage: string | null;
  referer: string | null;
  portalOpenedAt: Date | null;
  timeOnFormMs: number | null;
};

function defaultDatabasePath(): string {
  if (process.env.SQLITE_PATH) return path.resolve(process.env.SQLITE_PATH);
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd();
    return path.join(base, "LocalWifiPortal", "data", "portal.sqlite");
  }
  return path.join(process.cwd(), ".data", "portal.sqlite");
}

const databasePath = defaultDatabasePath();
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS portal_settings (
    id TEXT PRIMARY KEY,
    network_name TEXT NOT NULL,
    portal_title TEXT NOT NULL,
    portal_message TEXT NOT NULL,
    privacy_notice TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    retention_days INTEGER NOT NULL DEFAULT 30,
    hotspot_address TEXT NOT NULL DEFAULT '192.168.137.1',
    internet_forwarding INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_requests (
    request_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    contact TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    policy_version TEXT NOT NULL,
    purpose_accepted INTEGER NOT NULL DEFAULT 0,
    privacy_accepted INTEGER NOT NULL DEFAULT 0,
    submitted_at TEXT NOT NULL,
    decided_at TEXT,
    expires_at TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    mac_address TEXT,
    device_hostname TEXT,
    device_vendor TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    screen TEXT,
    viewport TEXT,
    language TEXT,
    timezone TEXT,
    platform TEXT,
    hardware TEXT,
    touch_points INTEGER,
    connection_type TEXT,
    accept_language TEXT,
    referer TEXT,
    portal_opened_at TEXT,
    time_on_form_ms INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_access_requests_submitted_at
    ON access_requests(submitted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_access_requests_status
    ON access_requests(status);

  CREATE TABLE IF NOT EXISTS hidden_devices (
    mac TEXT PRIMARY KEY,
    hidden_at TEXT NOT NULL
  );
`);

// Databases created before the device-detail columns existed need them added.
function ensureColumn(table: string, column: string, definition: string): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((entry) => entry.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

const DEVICE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["purpose_accepted", "INTEGER NOT NULL DEFAULT 0"],
  ["privacy_accepted", "INTEGER NOT NULL DEFAULT 0"],
  ["mac_address", "TEXT"],
  ["device_hostname", "TEXT"],
  ["device_vendor", "TEXT"],
  ["device_type", "TEXT"],
  ["browser", "TEXT"],
  ["os", "TEXT"],
  ["screen", "TEXT"],
  ["viewport", "TEXT"],
  ["language", "TEXT"],
  ["timezone", "TEXT"],
  ["platform", "TEXT"],
  ["hardware", "TEXT"],
  ["touch_points", "INTEGER"],
  ["connection_type", "TEXT"],
  ["accept_language", "TEXT"],
  ["referer", "TEXT"],
  ["portal_opened_at", "TEXT"],
  ["time_on_form_ms", "INTEGER"],
];

for (const [column, definition] of DEVICE_COLUMNS) {
  ensureColumn("access_requests", column, definition);
}

export const DEFAULT_PORTAL_SETTINGS: Omit<PortalSettings, "updatedAt"> = {
  id: "default",
  networkName: "Guest Network",
  portalTitle: "Welcome to the guest network",
  portalMessage:
    "Request access to this isolated Wi-Fi network. There is no internet connection. What is recorded is described in the privacy notice below.",
  privacyNotice:
    "This request is stored locally on the host laptop. It includes the name and optional contact details you enter, the consent statements you accept along with the time you accepted them, and technical details this device reports automatically: IP and MAC address, device name, device manufacturer, operating system, browser, screen size, language, timezone, hardware information, and this device's connection times and data volume. While connected, the hotspot also records the domain names and addresses this device looks up, and the operator can review them. We do not collect passwords, page contents, or precise location. Records are kept for the retention period set by the operator and can be erased on request.",
  policyVersion: "2026-09",
  retentionDays: 30,
  hotspotAddress: "192.168.5.1",
  internetForwarding: false,
};

function mapSettings(row: Record<string, unknown>): PortalSettings {
  return {
    id: String(row.id),
    networkName: String(row.network_name),
    portalTitle: String(row.portal_title),
    portalMessage: String(row.portal_message),
    privacyNotice: String(row.privacy_notice),
    policyVersion: String(row.policy_version),
    retentionDays: Number(row.retention_days),
    hotspotAddress: String(row.hotspot_address),
    internetForwarding: Boolean(row.internet_forwarding),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text === "" ? null : text;
}

function optionalNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function mapRequest(row: Record<string, unknown>): AccessRequest {
  return {
    requestId: String(row.request_id),
    displayName: String(row.display_name),
    contact: row.contact == null ? null : String(row.contact),
    status: String(row.status) as AccessRequest["status"],
    policyVersion: String(row.policy_version),
    purposeAccepted: Number(row.purpose_accepted) === 1,
    privacyAccepted: Number(row.privacy_accepted) === 1,
    submittedAt: new Date(String(row.submitted_at)),
    decidedAt: row.decided_at == null ? null : new Date(String(row.decided_at)),
    expiresAt: new Date(String(row.expires_at)),
    ipAddress: String(row.ip_address),
    userAgent: String(row.user_agent),
    macAddress: optionalText(row.mac_address),
    deviceHostname: optionalText(row.device_hostname),
    deviceVendor: optionalText(row.device_vendor),
    deviceType: optionalText(row.device_type),
    browser: optionalText(row.browser),
    os: optionalText(row.os),
    screen: optionalText(row.screen),
    viewport: optionalText(row.viewport),
    language: optionalText(row.language),
    timezone: optionalText(row.timezone),
    platform: optionalText(row.platform),
    hardware: optionalText(row.hardware),
    touchPoints: optionalNumber(row.touch_points),
    connectionType: optionalText(row.connection_type),
    acceptLanguage: optionalText(row.accept_language),
    referer: optionalText(row.referer),
    portalOpenedAt: row.portal_opened_at == null ? null : new Date(String(row.portal_opened_at)),
    timeOnFormMs: optionalNumber(row.time_on_form_ms),
  };
}

export function getOrCreateSettings(): PortalSettings {
  const existing = sqlite
    .prepare("SELECT * FROM portal_settings WHERE id = ?")
    .get(DEFAULT_PORTAL_SETTINGS.id) as Record<string, unknown> | undefined;

  if (existing) return mapSettings(existing);

  const now = new Date().toISOString();
  sqlite
    .prepare(`
      INSERT INTO portal_settings
      (id, network_name, portal_title, portal_message, privacy_notice, policy_version,
       retention_days, hotspot_address, internet_forwarding, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `)
    .run(
      DEFAULT_PORTAL_SETTINGS.id,
      DEFAULT_PORTAL_SETTINGS.networkName,
      DEFAULT_PORTAL_SETTINGS.portalTitle,
      DEFAULT_PORTAL_SETTINGS.portalMessage,
      DEFAULT_PORTAL_SETTINGS.privacyNotice,
      DEFAULT_PORTAL_SETTINGS.policyVersion,
      DEFAULT_PORTAL_SETTINGS.retentionDays,
      DEFAULT_PORTAL_SETTINGS.hotspotAddress,
      now,
    );

  return getOrCreateSettings();
}

export function cleanupStoredRequests(settings: PortalSettings): void {
  const now = new Date();
  const retentionCutoff = new Date(
    now.getTime() - settings.retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  sqlite
    .prepare(
      "UPDATE access_requests SET status = 'expired' WHERE status = 'pending' AND expires_at < ?",
    )
    .run(now.toISOString());
  sqlite
    .prepare("DELETE FROM access_requests WHERE submitted_at < ?")
    .run(retentionCutoff);
}

export function listAccessRequests(status?: AccessRequest["status"]): AccessRequest[] {
  const rows = status
    ? sqlite
        .prepare("SELECT * FROM access_requests WHERE status = ? ORDER BY submitted_at DESC")
        .all(status)
    : sqlite
        .prepare("SELECT * FROM access_requests ORDER BY submitted_at DESC")
        .all();
  return rows.map((row) => mapRequest(row as Record<string, unknown>));
}

export function createAccessRequest(input: Omit<AccessRequest, "status" | "decidedAt">): AccessRequest {
  sqlite
    .prepare(`
      INSERT INTO access_requests
      (request_id, display_name, contact, status, policy_version,
       purpose_accepted, privacy_accepted, submitted_at, decided_at, expires_at,
       ip_address, user_agent, mac_address, device_hostname, device_vendor,
       device_type, browser, os, screen, viewport, language, timezone, platform,
       hardware, touch_points, connection_type, accept_language, referer,
       portal_opened_at, time_on_form_ms)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.requestId,
      input.displayName,
      input.contact,
      input.policyVersion,
      input.purposeAccepted ? 1 : 0,
      input.privacyAccepted ? 1 : 0,
      input.submittedAt.toISOString(),
      input.expiresAt.toISOString(),
      input.ipAddress,
      input.userAgent,
      input.macAddress,
      input.deviceHostname,
      input.deviceVendor,
      input.deviceType,
      input.browser,
      input.os,
      input.screen,
      input.viewport,
      input.language,
      input.timezone,
      input.platform,
      input.hardware,
      input.touchPoints,
      input.connectionType,
      input.acceptLanguage,
      input.referer,
      input.portalOpenedAt ? input.portalOpenedAt.toISOString() : null,
      input.timeOnFormMs,
    );
  return getAccessRequest(input.requestId)!;
}

export function getAccessRequest(requestId: string): AccessRequest | null {
  const row = sqlite
    .prepare("SELECT * FROM access_requests WHERE request_id = ?")
    .get(requestId) as Record<string, unknown> | undefined;
  return row ? mapRequest(row) : null;
}

export function decideAccessRequest(
  requestId: string,
  decision: "approved" | "denied",
): AccessRequest | null {
  const result = sqlite
    .prepare("UPDATE access_requests SET status = ?, decided_at = ? WHERE request_id = ?")
    .run(decision, new Date().toISOString(), requestId);
  if (Number(result.changes) === 0) return null;
  return getAccessRequest(requestId);
}

export function eraseAccessRequest(requestId: string): boolean {
  const result = sqlite
    .prepare("DELETE FROM access_requests WHERE request_id = ?")
    .run(requestId);
  return Number(result.changes) > 0;
}

export function updateSettings(
  updates: Partial<Pick<PortalSettings, "networkName" | "portalTitle" | "portalMessage" | "privacyNotice" | "policyVersion" | "retentionDays" | "hotspotAddress">>,
): PortalSettings {
  const current = getOrCreateSettings();
  const next = { ...current, ...updates, internetForwarding: false };

  sqlite
    .prepare(`
      UPDATE portal_settings SET
        network_name = ?, portal_title = ?, portal_message = ?, privacy_notice = ?,
        policy_version = ?, retention_days = ?, hotspot_address = ?,
        internet_forwarding = 0, updated_at = ?
      WHERE id = ?
    `)
    .run(
      next.networkName,
      next.portalTitle,
      next.portalMessage,
      next.privacyNotice,
      next.policyVersion,
      next.retentionDays,
      next.hotspotAddress,
      new Date().toISOString(),
      current.id,
    );

  return getOrCreateSettings();
}

export function getDatabasePath(): string {
  return databasePath;
}

export function listHiddenDevices(): string[] {
  const rows = sqlite.prepare("SELECT mac FROM hidden_devices").all() as Array<{ mac: string }>;
  return rows.map((row) => String(row.mac).toUpperCase());
}

export function hideDevice(mac: string): void {
  sqlite
    .prepare("INSERT OR REPLACE INTO hidden_devices (mac, hidden_at) VALUES (?, ?)")
    .run(mac.toUpperCase(), new Date().toISOString());
}

export function unhideDevice(mac: string): boolean {
  const result = sqlite.prepare("DELETE FROM hidden_devices WHERE mac = ?").run(mac.toUpperCase());
  return Number(result.changes) > 0;
}
