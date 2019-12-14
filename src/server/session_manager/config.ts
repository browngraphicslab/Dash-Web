import { resolve } from 'path';
import { yellow } from "colors";

export const latency = 10;
export const ports = [1050, 4321];
export const onWindows = process.platform === "win32";
export const heartbeat = `http://localhost:1050/serverHeartbeat`;
export const recipient = "samuel_wilkins@brown.edu";
export const { pid, platform } = process;

/**
 * Logging
 */
export const identifier = yellow("__session_manager__:");

/**
 * Paths
 */
export const logPath = resolve(__dirname, "./logs");
export const crashPath = resolve(logPath, "./crashes");

/**
 * State
 */
export enum SessionState {
    STARTING = "STARTING",
    INITIALIZED = "INITIALIZED",
    LISTENING = "LISTENING",
    AUTOMATICALLY_RESTARTING = "CRASH_RESTARTING",
    MANUALLY_RESTARTING = "MANUALLY_RESTARTING",
    EXITING = "EXITING"
}