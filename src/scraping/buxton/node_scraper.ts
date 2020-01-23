import { readdirSync } from "fs";
import { resolve } from "path";

const StreamZip = require('node-stream-zip');

export async function open(path: string) {
    const zip = new StreamZip({
        file: path,
        storeEntries: true
    });
    return new Promise<string>((resolve, reject) => {
        zip.on('ready', () => {
            console.log("READY!", zip.entriesCount);
            for (const entry of Object.values(zip.entries()) as any[]) {
                const desc = entry.isDirectory ? 'directory' : `${entry.size} bytes`;
                console.log(`Entry ${entry.name}: ${desc}`);
            }
            let body = "";
            zip.stream("word/document.xml", (error: any, stream: any) => {
                if (error) {
                    reject(error);
                }
                stream.on('data', (chunk: any) => body += chunk.toString());
                stream.on('end', () => {
                    resolve(body);
                    zip.close();
                });
            });
        });
    });
}

export async function extract(path: string) {
    const contents = await open(path);
    let body = "";
    const components = contents.toString().split('<w:t');
    for (const component of components) {
        const tags = component.split('>');
        console.log(tags[1]);
        const content = tags[1].replace(/<.*$/, "");
        body += content;
    }
    return body;
}

async function parse(): Promise<string[]> {
    const sourceDirectory = resolve(`${__dirname}/source`);
    const candidates = readdirSync(sourceDirectory).filter(file => file.endsWith(".doc") || file.endsWith(".docx")).map(file => `${sourceDirectory}/${file}`);
    await extract(candidates[0]);
    try {
        return Promise.all(candidates.map(extract));
    } catch {
        return [];
    }
}

parse();