import * as fs from 'fs';
import { ExecOptions } from 'shelljs';
import { exec } from 'child_process';
import * as path from 'path';
import * as rimraf from "rimraf";

export const command_line = (command: string, fromDirectory?: string) => {
    return new Promise<string>((resolve, reject) => {
        let options: ExecOptions = {};
        if (fromDirectory) {
            options.cwd = path.join(__dirname, fromDirectory);
        }
        exec(command, options, (err, stdout) => err ? reject(err) : resolve(stdout));
    });
};

export const read_text_file = (relativePath: string) => {
    let target = path.join(__dirname, relativePath);
    return new Promise<string>((resolve, reject) => {
        fs.readFile(target, (err, data) => err ? reject(err) : resolve(data.toString()));
    });
};

export const write_text_file = (relativePath: string, contents: any) => {
    let target = path.join(__dirname, relativePath);
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

export enum ConsoleColors {
    Black = `\x1b[30m%s\x1b[0m`,
    Red = `\x1b[31m%s\x1b[0m`,
    Green = `\x1b[32m%s\x1b[0m`,
    Yellow = `\x1b[33m%s\x1b[0m`,
    Blue = `\x1b[34m%s\x1b[0m`,
    Magenta = `\x1b[35m%s\x1b[0m`,
    Cyan = `\x1b[36m%s\x1b[0m`,
    White = `\x1b[37m%s\x1b[0m`
}

export function logPort(listener: string, port: number) {
    process.stdout.write(`${listener} listening on port `);
    console.log(ConsoleColors.Yellow, port);
}

export function msToTime(duration: number) {
    let milliseconds = Math.floor((duration % 1000) / 100),
        seconds = Math.floor((duration / 1000) % 60),
        minutes = Math.floor((duration / (1000 * 60)) % 60),
        hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    let hoursS = (hours < 10) ? "0" + hours : hours;
    let minutesS = (minutes < 10) ? "0" + minutes : minutes;
    let secondsS = (seconds < 10) ? "0" + seconds : seconds;

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