import { createInterface, Interface } from "readline";
import { red, green, white } from "colors";

export interface Configuration {
    identifier: () => string | string;
    onInvalid?: (command: string, validCommand: boolean) => string | string;
    onValid?: (success?: string) => string | string;
    isCaseSensitive?: boolean;
}

export type ReplAction = (parsedArgs: Array<string>) => any | Promise<any>;
export interface Registration {
    argPatterns: RegExp[];
    action: ReplAction;
}

export default class Repl {
    private identifier: () => string | string;
    private onInvalid: ((command: string, validCommand: boolean) => string) | string;
    private onValid: ((success: string) => string) | string;
    private isCaseSensitive: boolean;
    private commandMap = new Map<string, Registration[]>();
    public interface: Interface;
    private busy = false;
    private keys: string | undefined;

    constructor({ identifier: prompt, onInvalid, onValid, isCaseSensitive }: Configuration) {
        this.identifier = prompt;
        this.onInvalid = onInvalid || this.usage;
        this.onValid = onValid || this.success;
        this.isCaseSensitive = isCaseSensitive ?? true;
        this.interface = createInterface(process.stdin, process.stdout).on('line', this.considerInput);
    }

    private resolvedIdentifier = () => typeof this.identifier === "string" ? this.identifier : this.identifier();

    private usage = (command: string, validCommand: boolean) => {
        if (validCommand) {
            const formatted = white(command);
            const patterns = green(this.commandMap.get(command)!.map(({ argPatterns }) => `${formatted}  ${argPatterns.join("  ")}`).join('\n'));
            return `${this.resolvedIdentifier()}\nthe given arguments do not match any registered patterns for ${formatted}\nthe list of valid argument patterns is given by:\n${patterns}`;
        } else {
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
            return `${this.resolvedIdentifier()} commands: { ${members.sort().join(", ")} }`;
        }
    }

    private success = (command: string) => `${this.resolvedIdentifier()} completed execution of ${white(command)}`;

    public registerCommand = (basename: string, argPatterns: (RegExp | string)[], action: ReplAction) => {
        const existing = this.commandMap.get(basename);
        const converted = argPatterns.map(input => input instanceof RegExp ? input : new RegExp(input));
        const registration = { argPatterns: converted, action };
        if (existing) {
            existing.push(registration);
        } else {
            this.commandMap.set(basename, [registration]);
        }
    }

    private invalid = (command: string, validCommand: boolean) => {
        console.log(red(typeof this.onInvalid === "string" ? this.onInvalid : this.onInvalid(command, validCommand)));
        this.busy = false;
    }

    private valid = (command: string) => {
        console.log(green(typeof this.onValid === "string" ? this.onValid : this.onValid(command)));
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
            return this.invalid(command, false);
        }
        const registered = this.commandMap.get(command);
        if (registered) {
            const { length } = args;
            const candidates = registered.filter(({ argPatterns: { length: count } }) => count === length);
            for (const { argPatterns, action } of candidates) {
                const parsed: string[] = [];
                let matched = false;
                if (length) {
                    for (let i = 0; i < length; i++) {
                        let matches: RegExpExecArray | null;
                        if ((matches = argPatterns[i].exec(args[i])) === null) {
                            break;
                        }
                        parsed.push(matches[0]);
                    }
                    matched = true;
                }
                if (!length || matched) {
                    await action(parsed);
                    this.valid(`${command} ${parsed.join(" ")}`);
                    return;
                }
            }
            this.invalid(command, true);
        } else {
            this.invalid(command, false);
        }
    }

}