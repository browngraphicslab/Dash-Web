import * as request from "request-promise";
import { log_execution } from "../../ActionUtilities";
import { red, yellow, cyan, green, Color } from "colors";
import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/json-transport";
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from 'path';
import { ChildProcess, exec } from "child_process";
import * as killport from "kill-port";

const identifier = yellow("__daemon__:");

process.on('SIGINT', () => current_backup?.kill("SIGTERM"));

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

const LOCATION = "http://localhost";
const recipient = "samuel_wilkins@brown.edu";
const frequency = 10;
const { pid } = process;
let restarting = false;

identifiedLog("Initializing daemon...");

writeLocalPidLog("daemon", pid);

function writeLocalPidLog(filename: string, contents: any) {
    const path = `./logs/current_${filename}_pid.log`;
    identifiedLog(cyan(`${contents} written to ${path}`));
    writeFileSync(resolve(__dirname, path), `${contents}\n`);
}

function timestamp() {
    return `@ ${new Date().toISOString()}`;
}

let current_backup: ChildProcess | undefined = undefined;

async function listen() {
    identifiedLog(yellow(`Beginning to poll server heartbeat every ${frequency} seconds...\n`));
    if (!LOCATION) {
        identifiedLog(red("No location specified for persistence daemon. Please include as a command line environment variable or in a .env file."));
        process.exit(0);
    }
    const heartbeat = `${LOCATION}:1050/serverHeartbeat`;
    // if this is on our remote server, the server must be run in release mode
    // const suffix = LOCATION.includes("localhost") ? "" : "-release";
    setInterval(async () => {
        let error: any;
        try {
            await request.get(heartbeat);
            if (restarting) {
                addLogEntry("Backup server successfully restarted", green);
            }
            restarting = false;
        } catch (e) {
            error = e;
        } finally {
            if (error) {
                if (!restarting) {
                    restarting = true;
                    addLogEntry("Detected a server crash", red);
                    current_backup?.kill();
                    await killport(1050, 'tcp');
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
                    current_backup = exec('"C:\\Program Files\\Git\\git-bash.exe" -c "npm run start-release"', err => identifiedLog(err?.message || "Previous server process exited."));
                    writeLocalPidLog("server", `${(current_backup?.pid ?? -2) + 1} created ${timestamp()}`);
                } else {
                    identifiedLog(yellow(`Callback ignored because restarting already initiated ${timestamp()}`));
                }
            }
        }
    }, 1000 * 10);
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

listen();