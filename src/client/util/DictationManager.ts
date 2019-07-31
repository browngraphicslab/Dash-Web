import { string } from "prop-types";
import { observable, action, autorun } from "mobx";
import { SelectionManager } from "./SelectionManager";
import { DocumentView } from "../views/nodes/DocumentView";
import { UndoManager } from "./UndoManager";
import * as converter from "words-to-numbers";
import { Doc, Field } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import { Docs } from "../documents/Documents";
import { CollectionViewType } from "../views/collections/CollectionBaseView";
import { MainView } from "../views/MainView";
import { listSpec } from "../../new_fields/Schema";
import { Cast, ToConstructor, ListSpec, CastCtor } from "../../new_fields/Types";
import { ImageField } from "../../new_fields/URLField";

namespace CORE {
    export interface IWindow extends Window {
        webkitSpeechRecognition: any;
    }
}

const { webkitSpeechRecognition }: CORE.IWindow = window as CORE.IWindow;
export type IndependentAction = (target: DocumentView) => any | Promise<any>;
export type DependentAction = (target: DocumentView, matches: RegExpExecArray) => any | Promise<any>;
export type RegexEntry = { key: RegExp, value: DependentAction };
export type RegistrationUnit<T extends IndependentAction | DependentAction> = { filter: Predicate, action: T };

export default class DictationManager {
    public static Instance = new DictationManager();
    private recognizer: any;
    private isListening = false;

    constructor() {
        this.recognizer = new webkitSpeechRecognition();
        this.recognizer.interimResults = false;
        this.recognizer.continuous = true;
    }

    finish = (handler: any, data: any) => {
        handler(data);
        this.stop();
    }

    stop = () => {
        this.recognizer.stop();
        this.isListening = false;
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

    public registerStatic = (keys: Array<string>, action: IndependentAction, filter: Predicate, overwrite = false) => {
        let success = true;
        keys.forEach(key => {
            key = this.sanitize(key);
            let existing = RegisteredCommands.Independent.get(key);
            if (!existing || overwrite) {
                let unit = {
                    filter: filter,
                    action: action
                };
                RegisteredCommands.Independent.set(key, unit);
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

    public registerDynamic = (dynamicKey: RegExp, action: DependentAction) => {
        RegisteredCommands.Dependent.push({
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

        let unit = RegisteredCommands.Independent.get(phrase);
        if (unit && unit.filter(target)) {
            await unit.action(target);
            batch.end();
            return true;
        }

        let success = false;
        for (let entry of RegisteredCommands.Dependent) {
            let regex = entry.key;
            let dependentAction = entry.value;
            let matches = regex.exec(phrase);
            regex.lastIndex = 0;
            if (matches !== null) {
                await dependentAction(target, matches);
                success = true;
                break;
            }
        }
        batch.end();

        return success;
    }

}

export namespace RegisteredCommands {

    export const Independent = new Map<string, RegistrationUnit<IndependentAction>>([

        ["clear", {
            action: (target: DocumentView) => {
                Doc.GetProto(target.props.Document).data = new List();
            },
            filter: Filters.isCollectionView
        }],

        ["open fields", {
            action: (target: DocumentView) => {
                let kvp = Docs.Create.KVPDocument(target.props.Document, { width: 300, height: 300 });
                target.props.addDocTab(kvp, target.dataDoc, "onRight");
            },
            filter: Filters.isImageView
        }]

    ]);

    export const Dependent = new Array<RegexEntry>(

        {
            key: /create (\w+) documents of type (image|nested collection)/g,
            value: (target: DocumentView, matches: RegExpExecArray) => {
                let count = DictationManager.Instance.interpretNumber(matches[1]);
                let what = matches[2];
                if (!("viewType" in target.props.Document)) {
                    return;
                }
                let dataDoc = Doc.GetProto(target.props.Document);
                let fieldKey = "data";
                for (let i = 0; i < count; i++) {
                    let created: Doc | undefined;
                    switch (what) {
                        case "image":
                            created = Docs.Create.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg");
                            break;
                        case "nested collection":
                            created = Docs.Create.FreeformDocument([], {});
                            break;
                    }
                    created && Doc.AddDocToList(dataDoc, fieldKey, created);
                }
            }
        },

        {
            key: /view as (freeform|stacking|masonry|schema|tree)/g,
            value: (target: DocumentView, matches: RegExpExecArray) => {
                let mode = CollectionViewType.ValueOf(matches[1]);
                mode && (target.props.Document.viewType = mode);
            }
        }

    );

}

export type Predicate = (target: DocumentView) => boolean;

export namespace Filters {

    const tryCast = <T extends CastCtor>(view: DocumentView, ctor: T) => Cast(Doc.GetProto(view.props.Document).data, ctor);

    export const isCollectionView: Predicate = (target: DocumentView) => tryCast(target, listSpec(Doc)) !== undefined;

    export const isImageView: Predicate = (target: DocumentView) => tryCast(target, ImageField) !== undefined;


}