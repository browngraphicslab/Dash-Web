import * as fs from 'fs';
import { ExecOptions } from 'shelljs';
import { exec } from 'child_process';
import * as path from 'path';

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

export async function log_execution(startMessage: string, endMessage: string, contents: () => void | Promise<void>) {
    console.log('\x1b[36m%s\x1b[0m', `${startMessage}...`);
    await contents();
    console.log(endMessage);
}