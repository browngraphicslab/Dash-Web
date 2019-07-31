import { string } from "prop-types";
import { observable, action } from "mobx";
import { SelectionManager } from "./SelectionManager";
import { DocumentView } from "../views/nodes/DocumentView";
import { UndoManager } from "./UndoManager";
import * as converter from "words-to-numbers";

namespace CORE {
    export interface IWindow extends Window {
        webkitSpeechRecognition: any;
    }
}

const { webkitSpeechRecognition }: CORE.IWindow = window as CORE.IWindow;
export type Action = (target: DocumentView) => any | Promise<any>;
export type DynamicAction = (target: DocumentView, matches: RegExpExecArray) => any | Promise<any>;
export type RegexEntry = { key: RegExp, value: DynamicAction };

export default class DictationManager {
    public static Instance = new DictationManager();
    private registeredCommands = new Map<string, Action>();
    private registeredRegexes: RegexEntry[] = [];
    private isListening = false;
    private recognizer: any;

    constructor() {
        this.recognizer = new webkitSpeechRecognition();
        this.recognizer.interimResults = false;
        this.recognizer.continuous = true;
    }

    @observable public current = "";

    @action
    finish = (handler: any, data: any) => {
        this.current = data;
        handler(data);
        this.stop();
    }

    stop = () => {
        this.isListening = false;
        this.recognizer.stop();
    }

    listen = () => {
        if (this.isListening) {
            return undefined;
        }
        this.isListening = true;
        this.recognizer.start();
        return new Promise<string>((resolve, reject) => {
            this.recognizer.onresult = (e: any) => this.finish(resolve, e.results[0][0].transcript);
            this.recognizer.onerror = (e: any) => this.finish(reject, e);
        });

    }

    private sanitize = (title: string) => {
        return title.replace("...", "").toLowerCase().trim();
    }

    public registerStatic = (keys: Array<string>, action: Action, overwrite = false) => {
        let success = true;
        keys.forEach(key => {
            key = this.sanitize(key);
            let existing = this.registeredCommands.get(key);
            if (!existing || overwrite) {
                this.registeredCommands.set(key, action);
            } else {
                success = false;
            }
        });
        return success;
    }

    public interpretNumber = (number: string) => {
        let initial = parseInt(number);
        if (!isNaN(initial)) {
            return initial;
        }
        let converted = converter.wordsToNumbers(number, { fuzzy: true });
        if (converted === null) {
            return NaN;
        }
        return typeof converted === "string" ? parseInt(converted) : converted;
    }

    public registerDynamic = (dynamicKey: RegExp, action: DynamicAction) => {
        this.registeredRegexes.push({
            key: dynamicKey,
            value: action
        });
    }

    public execute = async (phrase: string) => {
        let target = SelectionManager.SelectedDocuments()[0];
        if (!target) {
            return;
        }
        let batch = UndoManager.StartBatch("Dictation Action");
        phrase = this.sanitize(phrase);

        let registeredAction = this.registeredCommands.get(phrase);
        if (registeredAction) {
            await registeredAction(target);
            return true;
        }

        let success = false;
        for (let entry of this.registeredRegexes) {
            let regex = entry.key;
            let registeredDynamicAction = entry.value;
            let matches = regex.exec(phrase);
            regex.lastIndex = 0;
            if (matches !== null) {
                await registeredDynamicAction(target, matches);
                success = true;
                break;
            }
        }
        batch.end();

        return success;
    }

}