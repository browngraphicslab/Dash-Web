import { readFile, writeFile, exists, mkdir, unlink, createWriteStream } from 'fs';
import { ExecOptions } from 'shelljs';
import { exec } from 'child_process';
import * as path from 'path';
import * as rimraf from "rimraf";
import { yellow, Color } from 'colors';
import * as nodemailer from "nodemailer";
import { MailOptions } from "nodemailer/lib/json-transport";

const projectRoot = path.resolve(__dirname, "../../");
export function pathFromRoot(relative?: string) {
    if (!relative) {
        return projectRoot;
    }
    return path.resolve(projectRoot, relative);
}

export async function fileDescriptorFromStream(path: string) {
    const logStream = createWriteStream(path);
    return new Promise<number>(resolve => logStream.on("open", resolve));
}

export const command_line = (command: string, fromDirectory?: string) => {
    return new Promise<string>((resolve, reject) => {
        const options: ExecOptions = {};
        if (fromDirectory) {
            options.cwd = fromDirectory ? path.resolve(projectRoot, fromDirectory) : projectRoot;
        }
        exec(command, options, (err, stdout) => err ? reject(err) : resolve(stdout));
    });
};

export const read_text_file = (relativePath: string) => {
    const target = path.resolve(__dirname, relativePath);
    return new Promise<string>((resolve, reject) => {
        readFile(target, (err, data) => err ? reject(err) : resolve(data.toString()));
    });
};

export const write_text_file = (relativePath: string, contents: any) => {
    const target = path.resolve(__dirname, relativePath);
    return new Promise<void>((resolve, reject) => {
        writeFile(target, contents, (err) => err ? reject(err) : resolve());
    });
};

export type Messager<T> = (outcome: { result: T | undefined, error: Error | null }) => string;

export interface LogData<T> {
    startMessage: string;
    // if you care about the execution informing your log, you can pass in a function that takes in the result and a potential error and decides what to write
    endMessage: string | Messager<T>;
    action: () => T | Promise<T>;
    color?: Color;
}

let current = Math.ceil(Math.random() * 20);
export async function log_execution<T>({ startMessage, endMessage, action, color }: LogData<T>): Promise<T | undefined> {
    let result: T | undefined = undefined, error: Error | null = null;
    const resolvedColor = color || `\x1b[${31 + ++current % 6}m%s\x1b[0m`;
    log_helper(`${startMessage}...`, resolvedColor);
    try {
        result = await action();
    } catch (e) {
        error = e;
    } finally {
        log_helper(typeof endMessage === "string" ? endMessage : endMessage({ result, error }), resolvedColor);
    }
    return result;
}

function log_helper(content: string, color: Color | string) {
    if (typeof color === "string") {
        console.log(color, content);
    } else {
        console.log(color(content));
    }
}

export function logPort(listener: string, port: number) {
    console.log(`${listener} listening on port ${yellow(String(port))}`);
}

export function msToTime(duration: number) {
    const milliseconds = Math.floor((duration % 1000) / 100),
        seconds = Math.floor((duration / 1000) % 60),
        minutes = Math.floor((duration / (1000 * 60)) % 60),
        hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    const hoursS = (hours < 10) ? "0" + hours : hours;
    const minutesS = (minutes < 10) ? "0" + minutes : minutes;
    const secondsS = (seconds < 10) ? "0" + seconds : seconds;

    return hoursS + ":" + minutesS + ":" + secondsS + "." + milliseconds;
}

export const createIfNotExists = async (path: string) => {
    if (await new Promise<boolean>(resolve => exists(path, resolve))) {
        return true;
    }
    return new Promise<boolean>(resolve => mkdir(path, error => resolve(error === null)));
};

export async function Prune(rootDirectory: string): Promise<boolean> {
    const error = await new Promise<Error>(resolve => rimraf(rootDirectory, resolve));
    return error === null;
}

export const Destroy = (mediaPath: string) => new Promise<boolean>(resolve => unlink(mediaPath, error => resolve(error === null)));

export namespace Email {

    const smtpTransport = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: 'brownptcdash@gmail.com',
            pass: 'browngfx1'
        }
    });

    export async function dispatchAll(recipients: string[], subject: string, content: string) {
        const failures: string[] = [];
        await Promise.all(recipients.map(async (recipient: string) => {
            if (!await Email.dispatch(recipient, subject, content)) {
                failures.push(recipient);
            }
        }));
        return failures;
    }

    export async function dispatch(recipient: string, subject: string, content: string): Promise<boolean> {
        const mailOptions = {
            to: recipient,
            from: 'brownptcdash@gmail.com',
            subject,
            text: `Hello ${recipient.split("@")[0]},\n\n${content}`
        } as MailOptions;
        return new Promise<boolean>(resolve => {
            smtpTransport.sendMail(mailOptions, (dispatchError: Error | null) => resolve(dispatchError === null));
        });
    }

}