import { SelectionManager } from "./SelectionManager";
import { DocumentView } from "../views/nodes/DocumentView";
import { undoBatch } from "./UndoManager";
import * as converter from "words-to-numbers";
import { Doc } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import { Docs, DocumentType } from "../documents/Documents";
import { CollectionViewType } from "../views/collections/CollectionBaseView";
import { Cast, CastCtor } from "../../new_fields/Types";
import { listSpec } from "../../new_fields/Schema";
import { AudioField, ImageField } from "../../new_fields/URLField";
import { HistogramField } from "../northstar/dash-fields/HistogramField";

namespace CORE {
    export interface IWindow extends Window {
        webkitSpeechRecognition: any;
    }
}

const ConstructorMap = new Map<DocumentType, CastCtor>([
    [DocumentType.COL, listSpec(Doc)],
    [DocumentType.AUDIO, AudioField],
    [DocumentType.IMG, ImageField],
    [DocumentType.HIST, HistogramField],
    [DocumentType.IMPORT, listSpec(Doc)]
]);

const tryCast = (view: DocumentView, type: DocumentType) => {
    let ctor = ConstructorMap.get(type);
    if (!ctor) {
        return false;
    }
    return Cast(Doc.GetProto(view.props.Document).data, ctor) !== undefined;
};

const validate = (target: DocumentView, types: DocumentType[]) => {
    for (let type of types) {
        if (tryCast(target, type)) {
            return true;
        }
    }
    return false;
};

const { webkitSpeechRecognition }: CORE.IWindow = window as CORE.IWindow;
export type IndependentAction = (target: DocumentView) => any | Promise<any>;
export type DependentAction = (target: DocumentView, matches: RegExpExecArray) => any | Promise<any>;
export type RegistrationEntry = { action: IndependentAction, restrictTo?: DocumentType[] };
export type ActionPredicate = (target: DocumentView) => boolean;
export type RegexEntry = { expression: RegExp, action: DependentAction, restrictTo?: DocumentType[] };

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

    @undoBatch
    public execute = async (phrase: string) => {
        let targets = SelectionManager.SelectedDocuments();
        if (!targets || !targets.length) {
            return;
        }

        let entry = RegisteredCommands.Independent.get(phrase);
        if (entry) {
            let success = false;
            for (let target of targets) {
                if (!entry.restrictTo || validate(target, entry.restrictTo)) {
                    await entry.action(target);
                    success = true;
                }
            }
            return success;
        }

        for (let entry of RegisteredCommands.Dependent) {
            let regex = entry.expression;
            let matches = regex.exec(phrase);
            regex.lastIndex = 0;
            if (matches !== null) {
                let success = false;
                for (let target of targets) {
                    if (!entry.restrictTo || validate(target, entry.restrictTo)) {
                        await entry.action(target, matches);
                        success = true;
                    }
                }
                return success;
            }
        }

        return false;
    }

}

export namespace RegisteredCommands {

    export const Independent = new Map<string, RegistrationEntry>([

        ["clear", {
            action: (target: DocumentView) => {
                Doc.GetProto(target.props.Document).data = new List();
            },
            restrictTo: [DocumentType.COL]
        }],

        ["open fields", {
            action: (target: DocumentView) => {
                let kvp = Docs.Create.KVPDocument(target.props.Document, { width: 300, height: 300 });
                target.props.addDocTab(kvp, target.dataDoc, "onRight");
            }
        }]

    ]);

    export const Dependent = new Array<RegexEntry>(

        {
            expression: /create (\w+) documents of type (image|nested collection)/g,
            action: (target: DocumentView, matches: RegExpExecArray) => {
                let count = DictationManager.Instance.interpretNumber(matches[1]);
                let what = matches[2];
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
            },
            restrictTo: [DocumentType.COL]
        },

        {
            expression: /view as (freeform|stacking|masonry|schema|tree)/g,
            action: (target: DocumentView, matches: RegExpExecArray) => {
                let mode = CollectionViewType.ValueOf(matches[1]);
                mode && (target.props.Document.viewType = mode);
            },
            restrictTo: [DocumentType.COL]
        }

    );

}