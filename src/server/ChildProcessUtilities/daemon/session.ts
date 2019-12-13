import * as request from "request-promise";
import { log_execution, pathFromRoot } from "../../ActionUtilities";
import { red, yellow, cyan, green, Color } from "colors";
import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/json-transport";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from 'path';
import { ChildProcess, exec, execSync } from "child_process";
import { createInterface } from "readline";
const killport = require("kill-port");

process.on('SIGINT', endPrevious);
const identifier = yellow("__session_manager__:");

let manualRestartActive = false;
createInterface(process.stdin, process.stdout).on('line', async line => {
    const prompt = line.trim().toLowerCase();
    switch (prompt) {
        case "restart":
            manualRestartActive = true;
            identifiedLog(cyan("Initializing manual restart..."));
            endPrevious();
            break;
        case "exit":
            identifiedLog(cyan("Initializing session end"));
            await endPrevious();
            identifiedLog("Cleanup complete. Exiting session...\n");
            execSync(killAllCommand());
            break;
        default:
            identifiedLog(red("commands: { exit, restart }"));
            return;
    }
});

const logPath = resolve(__dirname, "./logs");
const crashPath = resolve(logPath, "./crashes");
if (!existsSync(logPath)) {
    mkdirSync(logPath);
}
if (!existsSync(crashPath)) {
    mkdirSync(crashPath);
}

const crashLogPath = resolve(crashPath, `./session_crashes_${new Date().toISOString()}.log`);
function addLogEntry(message: string, color: Color) {
    const formatted = color(`${message} ${timestamp()}.`);
    identifiedLog(formatted);
    // appendFileSync(crashLogPath, `${formatted}\n`);
}

function identifiedLog(message?: any, ...optionalParams: any[]) {
    console.log(identifier, message, ...optionalParams);
}

if (!["win32", "darwin"].includes(process.platform)) {
    identifiedLog(red("Invalid operating system: this script is supported only on Mac and Windows."));
    process.exit(1);
}

const latency = 10;
const ports = [1050, 4321];
const onWindows = process.platform === "win32";
const LOCATION = "http://localhost";
const heartbeat = `${LOCATION}:1050/serverHeartbeat`;
const recipient = "samuel_wilkins@brown.edu";
const { pid } = process;
let restarting = false;
let count = 0;

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
    current_backup?.kill("SIGTERM");
    await Promise.all(ports.map(port => {
        const task = killport(port, 'tcp');
        return task.catch((error: any) => identifiedLog(red(error)));
    }));
    identifiedLog(yellow("Done. Any failures will be printed in red immediately above."));
}

let current_backup: ChildProcess | undefined = undefined;

async function checkHeartbeat() {
    let error: any;
    try {
        count && !restarting && process.stdout.write(green(`${identifier} <`));
        await request.get(heartbeat);
        count && !restarting && console.log(green("3"));
        if (restarting || manualRestartActive) {
            addLogEntry(count++ ? "Backup server successfully restarted" : "Server successfully started", green);
            restarting = false;
        }
    } catch (e) {
        if (count) {
            identifiedLog(red("Heartbeat failed..."));
            identifiedLog(red(e.message));
        }
        error = e;
    } finally {
        if (error) {
            if (!restarting || manualRestartActive) {
                restarting = true;
                if (count && !manualRestartActive) {
                    console.log();
                    addLogEntry("Detected a server crash", red);
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
                manualRestartActive = false;
                current_backup = exec(startServerCommand(), err => identifiedLog(err?.message || count ? "Previous server process exited." : "Spawned initial server."));
                writeLocalPidLog("server", `${(current_backup?.pid ?? -2) + 1} created ${timestamp()}`);
            }
        }
        setTimeout(checkHeartbeat, 1000 * latency);
    }
}

async function startListening() {
    identifiedLog(yellow(`After initialization, will poll server heartbeat repeatedly...\n`));
    if (!LOCATION) {
        identifiedLog(red("No location specified for session manager. Please include as a command line environment variable or in a .env file."));
        process.exit(0);
    }
    await checkHeartbeat();
}

function emailText(error: any) {
    return [
        `Hey ${recipient.split("@")[0]},`,
        "You, as a Dash Administrator, are being notified of a server crash event. Here's what we know:",
        `Location: ${LOCATION}\nError: ${error}`,
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

startListening();