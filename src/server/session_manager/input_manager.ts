import { createInterface, Interface } from "readline";
import { red } from "colors";

export interface Configuration {
    identifier: string;
    onInvalid?: (culprit?: string) => string | string;
    isCaseSensitive?: boolean;
}

export interface Registration {
    argPattern: RegExp[];
    action: (parsedArgs: IterableIterator<string>) => any | Promise<any>;
}

export default class InputManager {
    private identifier: string;
    private onInvalid: ((culprit?: string) => string) | string;
    private isCaseSensitive: boolean;
    private commandMap = new Map<string, Registration[]>();
    public interface: Interface;
    private busy = false;
    private keys: string | undefined;

    constructor({ identifier: prompt, onInvalid, isCaseSensitive }: Configuration) {
        this.identifier = prompt;
        this.onInvalid = onInvalid || this.usage;
        this.isCaseSensitive = isCaseSensitive ?? true;
        this.interface = createInterface(process.stdin, process.stdout).on('line', this.considerInput);
    }

    private usage = () => {
        const resolved = this.keys;
        if (resolved) {
            return resolved;
        }
        const members: string[] = [];
        const keys = this.commandMap.keys();
        let next: IteratorResult<string>;
        while (!(next = keys.next()).done) {
            members.push(next.value);
        }
        return `${this.identifier} commands: { ${members.sort().join(", ")} }`;
    }

    public registerCommand = (basename: string, argPattern: RegExp[], action: any | Promise<any>) => {
        const existing = this.commandMap.get(basename);
        const registration = { argPattern, action };
        if (existing) {
            existing.push(registration);
        } else {
            this.commandMap.set(basename, [registration]);
        }
    }

    private invalid = (culprit?: string) => {
        console.log(red(typeof this.onInvalid === "string" ? this.onInvalid : this.onInvalid(culprit)));
        this.busy = false;
    }

    private considerInput = async (line: string) => {
        if (this.busy) {
            console.log(red("Busy"));
            return;
        }
        this.busy = true;
        line = line.trim();
        if (this.isCaseSensitive) {
            line = line.toLowerCase();
        }
        const [command, ...args] = line.split(/\s+/g);
        if (!command) {
            return this.invalid();
        }
        const registered = this.commandMap.get(command);
        if (registered) {
            const { length } = args;
            const candidates = registered.filter(({ argPattern: { length: count } }) => count === length);
            for (const { argPattern, action } of candidates) {
                const parsed: string[] = [];
                let matched = false;
                if (length) {
                    for (let i = 0; i < length; i++) {
                        let matches: RegExpExecArray | null;
                        if ((matches = argPattern[i].exec(args[i])) === null) {
                            break;
                        }
                        parsed.push(matches[0]);
                    }
                    matched = true;
                }
                if (!length || matched) {
                    await action(parsed[Symbol.iterator]());
                    this.busy = false;
                    return;
                }
            }
        }
        this.invalid(command);
    }

}