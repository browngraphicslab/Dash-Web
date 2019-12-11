import * as request from "request-promise";
import { log_execution, spawn_detached_process } from "../ActionUtilities";
import { red, yellow, cyan, green } from "colors";
import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/json-transport";
import { writeFileSync } from "fs";
import { resolve } from 'path';

const LOCATION = "http://localhost";
const recipient = "samuel_wilkins@brown.edu";
let restarting = false;

writeFileSync(resolve(__dirname, "./current_pid.txt"), process.pid);

function timestamp() {
    return `@ ${new Date().toISOString()}`;
}

async function listen() {
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
        } catch (e) {
            error = e;
        } finally {
            if (error) {
                if (!restarting) {
                    restarting = true;
                    console.log(yellow("Detected a server crash!"));
                    await log_execution({
                        startMessage: "Sending crash notification email",
                        endMessage: ({ error, result }) => {
                            const success = error === null && result === true;
                            return (success ? `Notification successfully sent to ` : `Failed to notify `) + recipient;
                        },
                        action: async () => notify(error || "Hmm, no error to report..."),
                        color: cyan
                    });
                    console.log(await log_execution({
                        startMessage: "Initiating server restart",
                        endMessage: "Server successfully restarted",
                        action: () => spawn_detached_process(`npm run start-spawn`),
                        color: green
                    }));
                    restarting = false;
                } else {
                    console.log(yellow(`Callback ignored because restarting already initiated ${timestamp()}`));
                }
            } else {
                console.log(green(`No issues detected ${timestamp()}`));
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
        smtpTransport.sendMail(mailOptions, (dispatchError: Error | null) => { console.log(dispatchError); resolve(dispatchError === null); });
    });
}

listen();