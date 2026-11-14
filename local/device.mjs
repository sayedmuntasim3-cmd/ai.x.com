/**
 * What this computer has, measured rather than assumed: memory, cores, and
 * whether ffmpeg and an NVIDIA GPU answer. The brain comes from the same
 * settings the studio uses (worker/brain.mjs).
 */
import { spawnSync } from "node:child_process";
import os from "node:os";
import { deviceProfile } from "../engine/src/device-profile.mjs";
import { brainHealth } from "../worker/brain.mjs";

/** @param {string} bin @param {string[]} args */
const answers = (bin, args) => {
  try { return spawnSync(bin, args, { stdio: "ignore", timeout: 5000 }).status === 0; } catch { return false; }
};

/** @param {Record<string, string | undefined>} env */
export function probeDevice(env = process.env) {
  const brain = brainHealth(env);
  const raw = {
    memoryMb: os.totalmem() / 1048576,
    freeMemoryMb: os.freemem() / 1048576,
    cpus: typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length,
    ffmpeg: answers("ffmpeg", ["-version"]) && answers("ffprobe", ["-version"]),
    gpu: answers("nvidia-smi", ["-L"]),
    brain: brain.connected ? { kind: String(brain.kind), contextTokens: brain.contextTokens } : null,
  };
  return { raw, profile: deviceProfile(raw), platform: `${process.platform} ${os.arch()}`, host: os.hostname() };
}
