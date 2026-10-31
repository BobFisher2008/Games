// Creates the Google Play upload key once and writes android/keystore.properties
// so release builds are signed automatically. Never overwrites an existing key.
// The password is random and only stored in android/keystore.properties.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keyDir = join(homedir(), "last-coat-keys");
const keyFile = join(keyDir, "last-coat-upload.jks");
const propsFile = join(root, "android", "keystore.properties");

if (existsSync(keyFile) || existsSync(propsFile)) {
  console.log(`Upload key already set up (${existsSync(keyFile) ? keyFile : propsFile}). Nothing changed.`);
  process.exit(0);
}

// Find keytool from a JDK 21 in ~/.jdks (same JDK the build uses).
const jdks = join(homedir(), ".jdks");
const jdk = existsSync(jdks) && readdirSync(jdks).map((d) => join(jdks, d))
  .find((p) => /JAVA_VERSION="21/.test((() => { try { return readFileSync(join(p, "release"), "utf8"); } catch { return ""; } })()));
const keytool = jdk ? join(jdk, "bin", process.platform === "win32" ? "keytool.exe" : "keytool") : "keytool";

mkdirSync(keyDir, { recursive: true });
const password = randomBytes(24).toString("base64url");
const r = spawnSync(keytool, [
  "-genkeypair", "-keystore", keyFile, "-storetype", "PKCS12", "-alias", "upload",
  "-keyalg", "RSA", "-keysize", "4096", "-validity", "10000",
  "-storepass", password, "-keypass", password, "-dname", "CN=Last Coat Upload Key"
], { stdio: ["ignore", "ignore", "pipe"] });
if (r.status !== 0) {
  console.error("keytool failed:", String(r.stderr || r.error || "").trim());
  process.exit(1);
}

writeFileSync(propsFile, [
  "# Release signing for Google Play. Keep this file and the .jks file private and backed up.",
  `storeFile=${keyFile.replace(/\\/g, "/")}`,
  `storePassword=${password}`,
  "keyAlias=upload",
  `keyPassword=${password}`,
  ""
].join("\n"));
console.log(`Created upload key: ${keyFile}`);
console.log(`Wrote signing settings: ${propsFile}`);
console.log("Back up BOTH files somewhere safe (a password manager or encrypted USB drive).");
