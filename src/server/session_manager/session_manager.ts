import * as request from "request-promise";
import { log_execution, pathFromRoot } from "../ActionUtilities";
import { red, yellow, cyan, green, Color } from "colors";
import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/json-transport";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from 'path';
import { ChildProcess, exec, execSync } from "child_process";
import InputManager from "./input_manager";
import { identifier, logPath, crashPath, onWindows, pid, ports, heartbeat, recipient, latency, SessionState } from "./config";
const killport = require("kill-port");

process.on('SIGINT', endPrevious);
let state: SessionState = SessionState.STARTING;
const is = (...reference: SessionState[]) => reference.includes(state);
const set = (reference: SessionState) => state = reference;

const { registerCommand } = new InputManager({ identifier });

registerCommand("restart", [], async () => {
    set(SessionState.MANUALLY_RESTARTING);
    identifiedLog(cyan("Initializing manual restart..."));
    await endPrevious();
});

registerCommand("exit", [], exit);

async function exit() {
    set(SessionState.EXITING);
    identifiedLog(cyan("Initializing session end"));
    await endPrevious();
    identifiedLog("Cleanup complete. Exiting session...\n");
    execSync(killAllCommand());
}

registerCommand("update", [], async () => {
    set(SessionState.UPDATING);
    identifiedLog(cyan("Initializing server update from version control..."));
    await endPrevious();
    await new Promise<void>(resolve => {
        exec(updateCommand(), error => {
            if (error) {
                identifiedLog(red(error.message));
            }
            resolve();
        });
    });
    await exit();
});

registerCommand("state", [], () => identifiedLog(state));

if (!existsSync(logPath)) {
    mkdirSync(logPath);
}
if (!existsSync(crashPath)) {
    mkdirSync(crashPath);
}

function addLogEntry(message: string, color: Color) {
    const formatted = color(`${message} ${timestamp()}.`);
    identifiedLog(formatted);
    // appendFileSync(resolve(crashPath, `./session_crashes_${new Date().toISOString()}.log`), `${formatted}\n`);
}

function identifiedLog(message?: any, ...optionalParams: any[]) {
    console.log(identifier, message, ...optionalParams);
}

if (!["win32", "darwin"].includes(process.platform)) {
    identifiedLog(red("Invalid operating system: this script is supported only on Mac and Windows."));
    process.exit(1);
}

function updateCommand() {
    if (onWindows) {
        return '"C:\\Program Files\\Git\\git-bash.exe" -c "git pull && npm install"';
    }
    return `osascript -e 'tell app "Terminal"\ndo script "cd ${pathFromRoot()} && git pull && npm install"\nend tell'`;
}

function startServerCommand() {
    if (onWindows) {
        return '"C:\\Program Files\\Git\\git-bash.exe" -c "npm run start-release"';
    }
    return `osascript -e 'tell app "Terminal"\ndo script "cd ${pathFromRoot()} && npm run start-release"\nend tell'`;
}

function killAllCommand() {
    if (onWindows) {
        return "taskkill /f /im node.exe";
    }
    return "killall -9 node";
}

identifiedLog("Initializing session...");

writeLocalPidLog("session_manager", pid);

function writeLocalPidLog(filename: string, contents: any) {
    const path = `./logs/current_${filename}_pid.log`;
    identifiedLog(cyan(`${contents} written to ${path}`));
    writeFileSync(resolve(__dirname, path), `${contents}\n`);
}

function timestamp() {
    return `@ ${new Date().toISOString()}`;
}

async function endPrevious() {
    identifiedLog(yellow("Cleaning up previous connections..."));
    current_backup?.kill("SIGKILL");
    await Promise.all(ports.map(port => {
        const task = killport(port, 'tcp');
        return task.catch((error: any) => identifiedLog(red(error)));
    }));
    identifiedLog(yellow("Done. Any failures will be printed in red immediately above."));
}

let current_backup: ChildProcess | undefined = undefined;

async function checkHeartbeat() {
    const listening = is(SessionState.LISTENING);
    let error: any;
    try {
        listening && process.stdout.write(`${identifier} 👂 `);
        await request.get(heartbeat);
        listening && console.log('⇠ 💚');
        if (!listening) {
            addLogEntry(is(SessionState.INITIALIZED) ? "Server successfully started" : "Backup server successfully restarted", green);
            set(SessionState.LISTENING);
        }
    } catch (e) {
        listening && console.log("⇠ 💔");
        error = e;
    } finally {
        if (error && !is(SessionState.AUTOMATICALLY_RESTARTING, SessionState.INITIALIZED, SessionState.UPDATING)) {
            if (is(SessionState.STARTING)) {
                set(SessionState.INITIALIZED);
            } else if (is(SessionState.MANUALLY_RESTARTING)) {
                set(SessionState.AUTOMATICALLY_RESTARTING);
            } else {
                set(SessionState.AUTOMATICALLY_RESTARTING);
                console.log();
                addLogEntry("Detected a server crash", red);
                identifiedLog(red(error.message));
                await endPrevious();
                await log_execution({
                    startMessage: identifier + " Sending crash notification email",
                    endMessage: ({ error, result }) => {
                        const success = error === null && result === true;
                        return identifier + ` ${(success ? `Notification successfully sent to` : `Failed to notify`)} ${recipient} ${timestamp()}`;
                    },
                    action: async () => notify(error || "Hmm, no error to report..."),
                    color: cyan
                });
                identifiedLog(green("Initiating server restart..."));
            }
            current_backup = exec(startServerCommand(), err => identifiedLog(err?.message || is(SessionState.INITIALIZED) ? "Spawned initial server." : "Previous server process exited."));
            writeLocalPidLog("server", `${(current_backup?.pid ?? -2) + 1} created ${timestamp()}`);
        }
        setTimeout(checkHeartbeat, 1000 * latency);
    }
}

function emailText(error: any) {
    return [
        `Hey ${recipient.split("@")[0]},`,
        "You, as a Dash Administrator, are being notified of a server crash event. Here's what we know:",
        `Location: ${heartbeat}\nError: ${error}`,
        "The server should already be restarting itself, but if you're concerned, use the Remote Desktop Connection to monitor progress."
    ].join("\n\n");
}

async function notify(error: any) {
    const smtpTransport = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: 'brownptcdash@gmail.com',
            pass: 'browngfx1'
        }
    });
    const mailOptions = {
        to: recipient,
        from: 'brownptcdash@gmail.com',
        subject: 'Dash Server Crash',
        text: emailText(error)
    } as MailOptions;
    return new Promise<boolean>(resolve => {
        smtpTransport.sendMail(mailOptions, (dispatchError: Error | null) => resolve(dispatchError === null));
    });
}

identifiedLog(yellow(`After initialization, will poll server heartbeat repeatedly...\n`));
checkHeartbeat();