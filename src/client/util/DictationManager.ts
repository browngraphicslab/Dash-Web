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

export namespace DictationManager {

    namespace CORE {
        export interface IWindow extends Window {
            webkitSpeechRecognition: any;
        }
    }

    const { webkitSpeechRecognition }: CORE.IWindow = window as CORE.IWindow;

    let isListening = false;
    const recognizer = (() => {
        let initialized = new webkitSpeechRecognition();
        initialized.interimResults = false;
        initialized.continuous = true;
        return initialized;
    })();

    export namespace Controls {

        export const listen = () => {
            if (isListening) {
                return undefined;
            }
            isListening = true;
            recognizer.start();
            return new Promise<string>((resolve, reject) => {
                recognizer.onresult = (e: any) => {
                    resolve(e.results[0][0].transcript);
                    stop();
                };
                recognizer.onerror = (e: any) => {
                    reject(e);
                    stop();
                };
            });
        };

        export const stop = () => {
            recognizer.stop();
            isListening = false;
        };

    }

    export namespace Commands {

        export type IndependentAction = (target: DocumentView) => any | Promise<any>;
        export type IndependentEntry = { action: IndependentAction, restrictTo?: DocumentType[] };

        export type DependentAction = (target: DocumentView, matches: RegExpExecArray) => any | Promise<any>;
        export type DependentEntry = { expression: RegExp, action: DependentAction, restrictTo?: DocumentType[] };

        export const RegisterIndependent = (key: string, value: IndependentEntry) => Independent.set(key, value);
        export const RegisterDependent = (entry: DependentEntry) => Dependent.push(entry);

        export const execute = async (phrase: string) => {
            let targets = SelectionManager.SelectedDocuments();
            if (!targets || !targets.length) {
                return;
            }

            let entry = Independent.get(phrase);
            if (entry) {
                let success = false;
                let restrictTo = entry.restrictTo;
                for (let target of targets) {
                    if (!restrictTo || validate(target, restrictTo)) {
                        await entry.action(target);
                        success = true;
                    }
                }
                return success;
            }

            for (let entry of Dependent) {
                let regex = entry.expression;
                let matches = regex.exec(phrase);
                regex.lastIndex = 0;
                if (matches !== null) {
                    let success = false;
                    let restrictTo = entry.restrictTo;
                    for (let target of targets) {
                        if (!restrictTo || validate(target, restrictTo)) {
                            await entry.action(target, matches);
                            success = true;
                        }
                    }
                    return success;
                }
            }

            return false;
        };

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

        const interpretNumber = (number: string) => {
            let initial = parseInt(number);
            if (!isNaN(initial)) {
                return initial;
            }
            let converted = converter.wordsToNumbers(number, { fuzzy: true });
            if (converted === null) {
                return NaN;
            }
            return typeof converted === "string" ? parseInt(converted) : converted;
        };

        const Independent = new Map<string, IndependentEntry>([

            ["clear", {
                action: (target: DocumentView) => Doc.GetProto(target.props.Document).data = new List(),
                restrictTo: [DocumentType.COL]
            }],

            ["open fields", {
                action: (target: DocumentView) => {
                    let kvp = Docs.Create.KVPDocument(target.props.Document, { width: 300, height: 300 });
                    target.props.addDocTab(kvp, target.dataDoc, "onRight");
                }
            }]

        ]);

        const Dependent = new Array<DependentEntry>(

            {
                expression: /create (\w+) documents of type (image|nested collection)/g,
                action: (target: DocumentView, matches: RegExpExecArray) => {
                    let count = interpretNumber(matches[1]);
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
                    let mode = CollectionViewType.valueOf(matches[1]);
                    mode && (target.props.Document.viewType = mode);
                },
                restrictTo: [DocumentType.COL]
            }

        );

    }

}