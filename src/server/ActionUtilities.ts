import * as fs from 'fs';
import { ExecOptions } from 'shelljs';
import { exec } from 'child_process';
import * as path from 'path';
import * as rimraf from "rimraf";
import { yellow } from 'colors';

export const command_line = (command: string, fromDirectory?: string) => {
    return new Promise<string>((resolve, reject) => {
        const options: ExecOptions = {};
        if (fromDirectory) {
            options.cwd = path.resolve(__dirname, fromDirectory);
        }
        exec(command, options, (err, stdout) => err ? reject(err) : resolve(stdout));
    });
};

export const read_text_file = (relativePath: string) => {
    const target = path.resolve(__dirname, relativePath);
    return new Promise<string>((resolve, reject) => {
        fs.readFile(target, (err, data) => err ? reject(err) : resolve(data.toString()));
    });
};

export const write_text_file = (relativePath: string, contents: any) => {
    const target = path.resolve(__dirname, relativePath);
    return new Promise<void>((resolve, reject) => {
        fs.writeFile(target, contents, (err) => err ? reject(err) : resolve());
    });
};

export interface LogData {
    startMessage: string;
    endMessage: string;
    action: () => void | Promise<void>;
}

let current = Math.ceil(Math.random() * 20);
export async function log_execution({ startMessage, endMessage, action }: LogData) {
    const color = `\x1b[${31 + current++ % 6}m%s\x1b[0m`;
    console.log(color, `${startMessage}...`);
    await action();
    console.log(color, endMessage);
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
    if (await new Promise<boolean>(resolve => fs.exists(path, resolve))) {
        return true;
    }
    return new Promise<boolean>(resolve => fs.mkdir(path, error => resolve(error === null)));
};

export async function Prune(rootDirectory: string): Promise<boolean> {
    const error = await new Promise<Error>(resolve => rimraf(rootDirectory, resolve));
    return error === null;
}

export const Destroy = (mediaPath: string) => new Promise<boolean>(resolve => fs.unlink(mediaPath, error => resolve(error === null)));

export function addBeforeExitHandler(handler: NodeJS.BeforeExitListener) {
    // process.on("beforeExit", handler);
}
