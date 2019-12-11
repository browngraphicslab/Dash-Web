import * as request from "request-promise";
import { log_execution, pathFromRoot } from "../ActionUtilities";
import { red, yellow, cyan, green, Color } from "colors";
import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/json-transport";
import { writeFileSync, appendFileSync, createWriteStream, existsSync } from "fs";
import { resolve } from 'path';
import { ChildProcess } from "child_process";
import { ProcessManager } from "../ProcessManager";

console.log(yellow("Initializing daemon..."));

process.on('SIGINT', () => current_backup?.kill("SIGTERM"));

const crashLogPath = resolve(__dirname, `./session_crashes_${timestamp()}.log`);
function addLogEntry(message: string, color: Color) {
    const formatted = color(`${message} ${timestamp()}.`);
    console.log(formatted);
    appendFileSync(crashLogPath, `${formatted}\n`);
}

const LOCATION = "http://localhost";
const recipient = "samuel_wilkins@brown.edu";
let restarting = false;

const frequency = 10;
const { pid } = process;
writeFileSync(resolve(__dirname, "./current_daemon_pid.txt"), pid);
console.log(cyan(`${pid} written to ./current_daemon_pid.txt`));

function timestamp() {
    return `@ ${new Date().toISOString()}`;
}

let current_backup: ChildProcess | undefined = undefined;

async function listen() {
    console.log(yellow(`Beginning to poll server heartbeat every ${frequency} seconds...\n`));
    if (!LOCATION) {
        console.log(red("No location specified for persistence daemon. Please include as a command line environment variable or in a .env file."));
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
                    await log_execution({
                        startMessage: "Sending crash notification email",
                        endMessage: ({ error, result }) => {
                            const success = error === null && result === true;
                            return `${(success ? `Notification successfully sent to` : `Failed to notify`)} ${recipient} ${timestamp()}`;
                        },
                        action: async () => notify(error || "Hmm, no error to report..."),
                        color: cyan
                    });
                    current_backup = await log_execution({
                        startMessage: "Initiating server restart",
                        endMessage: ({ result, error }) => {
                            const success = error === null && result !== undefined;
                            return success ? "Child process spawned.." : `An error occurred while attempting to restart the server:\n${error}`;
                        },
                        action: () => ProcessManager.spawn_detached('npm', ['run', 'start-spawn']),
                        color: green
                    });
                    writeFileSync(pathFromRoot("./logs/current_server_pid.txt"), `${current_backup?.pid ?? -1} created ${timestamp()}\n`);
                } else {
                    console.log(yellow(`Callback ignored because restarting already initiated ${timestamp()}`));
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