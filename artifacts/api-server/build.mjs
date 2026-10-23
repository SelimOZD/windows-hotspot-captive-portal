import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { cp, rm } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  const frontendPublicDir = path.resolve(artifactDir, "../local-wifi-portal/dist/public");
  await rm(distDir, { recursive: true, force: true });
  await cp(frontendPublicDir, path.join(distDir, "public"), { recursive: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    // Keep the output directory relative so esbuild-plugin-pino resolves its
    // worker files from the runtime working directory instead of embedding the
    // build machine's absolute path into the Windows bundle.
    outdir: "dist",
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [
      "*.node", "sharp", "better-sqlite3", "sqlite3", "canvas", "bcrypt", "argon2",
      "fsevents", "re2", "farmhash", "xxhash-addon", "bufferutil", "utf-8-validate",
      "ssh2", "cpu-features", "dtrace-provider", "isolated-vm", "lightningcss",
      "pg-native", "oracledb", "mongodb-client-encryption", "nodemailer", "handlebars",
      "knex", "typeorm", "protobufjs", "onnxruntime-node", "@tensorflow/*",
      "@prisma/client", "@mikro-orm/*", "@grpc/*", "@swc/*", "@aws-sdk/*",
      "@azure/*", "@opentelemetry/*", "@google-cloud/*", "@google/*", "googleapis",
      "firebase-admin", "@parcel/watcher", "@sentry/profiling-node", "@tree-sitter/*",
      "aws-sdk", "classic-level", "dd-trace", "ffi-napi", "grpc", "hiredis", "kerberos",
      "leveldown", "miniflare", "mysql2", "newrelic", "odbc", "piscina", "realm",
      "ref-napi", "rocksdb", "sass-embedded", "sequelize", "serialport", "snappy",
      "tinypool", "usb", "workerd", "wrangler", "zeromq", "zeromq-prebuilt",
      "playwright", "puppeteer", "puppeteer-core", "electron"
    ],
    sourcemap: "linked",
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';\nimport __bannerPath from 'node:path';\nimport __bannerUrl from 'node:url';\nglobalThis.require = __bannerCrReq(import.meta.url);\nglobalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);\nglobalThis.__dirname = __bannerPath.dirname(globalThis.__filename);`,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
