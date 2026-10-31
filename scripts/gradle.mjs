// Runs the Android Gradle build with Java 21 and the Android SDK, so no global
// environment variables are needed. Usage: node scripts/gradle.mjs <gradle tasks...>
//
// Java: LAST_COAT_JAVA_HOME, else a JDK 21 in ~/.jdks, else JAVA_HOME if it is Java 21.
// SDK:  ANDROID_HOME / ANDROID_SDK_ROOT, else the default Android Studio location.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function javaMajor(home) {
  try {
    const m = readFileSync(join(home, "release"), "utf8").match(/JAVA_VERSION="(\d+)/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

function findJdk21() {
  const cands = [];
  if (process.env.LAST_COAT_JAVA_HOME) cands.push(process.env.LAST_COAT_JAVA_HOME);
  const jdks = join(homedir(), ".jdks");
  if (existsSync(jdks)) for (const d of readdirSync(jdks).sort().reverse()) cands.push(join(jdks, d));
  if (process.env.JAVA_HOME) cands.push(process.env.JAVA_HOME);
  return cands.find((p) => javaMajor(p) === 21);
}

function findSdk() {
  const cands = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
  if (isWin && process.env.LOCALAPPDATA) cands.push(join(process.env.LOCALAPPDATA, "Android", "Sdk"));
  cands.push(join(homedir(), "Library", "Android", "sdk"), join(homedir(), "Android", "Sdk"));
  return cands.find((p) => p && existsSync(join(p, "platform-tools")) || (p && existsSync(join(p, "platforms"))));
}

const java = findJdk21();
if (!java) {
  console.error("Java 21 not found. Capacitor 8 needs JDK 21: put one in ~/.jdks or set LAST_COAT_JAVA_HOME.");
  process.exit(1);
}
const sdk = findSdk();
if (!sdk) {
  console.error("Android SDK not found. Open Android Studio and finish its setup wizard, then try again.");
  process.exit(1);
}

const tasks = process.argv.slice(2);
if (!tasks.length) tasks.push("assembleDebug");
console.log(`Java 21: ${java}\nAndroid SDK: ${sdk}\nRunning: gradlew ${tasks.join(" ")}`);

const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
// Full path: some Windows shells don't run programs from the current folder.
const androidDir = join(root, "android");
const wrapper = join(androidDir, isWin ? "gradlew.bat" : "gradlew");
const r = spawnSync(isWin ? `"${wrapper}"` : wrapper, tasks, {
  cwd: androidDir, stdio: "inherit", env, shell: isWin
});
process.exit(r.status ?? 1);
