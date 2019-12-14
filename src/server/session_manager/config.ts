import { resolve } from 'path';
import { yellow } from "colors";

export const latency = 10;
export const ports = [1050, 4321];
export const onWindows = process.platform === "win32";
export const LOCATION = "http://localhost";
export const heartbeat = `${LOCATION}:1050/serverHeartbeat`;
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
    INITIALIZING,
    LISTENING,
    AUTOMATIC_RESTART,
    MANUAL_RESTART,
    EXITING
}