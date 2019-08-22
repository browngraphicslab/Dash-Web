import { SelectionManager } from "./SelectionManager";
import { DocumentView } from "../views/nodes/DocumentView";
import { UndoManager } from "./UndoManager";
import * as interpreter from "words-to-numbers";
import { DocumentType } from "../documents/DocumentTypes";
import { Doc } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import { Docs } from "../documents/Documents";
import { CollectionViewType } from "../views/collections/CollectionBaseView";
import { Cast, CastCtor } from "../../new_fields/Types";
import { listSpec } from "../../new_fields/Schema";
import { AudioField, ImageField } from "../../new_fields/URLField";
import { HistogramField } from "../northstar/dash-fields/HistogramField";
import { MainView } from "../views/MainView";
import { Utils } from "../../Utils";
import { RichTextField } from "../../new_fields/RichTextField";

/**
 * This namespace provides a singleton instance of a manager that
 * handles the listening and text-conversion of user speech.
 * 
 * The basic manager functionality can be attained by the DictationManager.Controls namespace, which provide
 * a simple recording operation that returns the interpreted text as a string.
 * 
 * Additionally, however, the DictationManager also exposes the ability to execute voice commands within Dash.
 * It stores a default library of registered commands that can be triggered by listen()'ing for a phrase and then
 * passing the results into the execute() function.
 * 
 * In addition to compile-time default commands, you can invoke DictationManager.Commands.Register(Independent|Dependent)
 * to add new commands as classes or components are constructed.
 */
export namespace DictationManager {

    /**
     * Some type maneuvering to access Webkit's built-in
     * speech recognizer.
     */
    namespace CORE {
        export interface IWindow extends Window {
            webkitSpeechRecognition: any;
        }
    }
    const { webkitSpeechRecognition }: CORE.IWindow = window as CORE.IWindow;
    export const placeholder = "Listening...";

    export namespace Controls {

        export const Infringed = "unable to process: dictation manager still involved in previous session";
        const intraSession = ". ";
        const interSession = " ... ";

        let isListening = false;
        let isManuallyStopped = false;

        let current: string | undefined = undefined;
        let sessionResults: string[] = [];

        const recognizer: SpeechRecognition = new webkitSpeechRecognition() || new SpeechRecognition();
        recognizer.onstart = () => console.log("initiating speech recognition session...");

        export type InterimResultHandler = (results: string) => any;
        export type ContinuityArgs = { indefinite: boolean } | false;
        export type DelimiterArgs = { inter: string, intra: string };
        export type ListeningUIStatus = { interim: boolean } | false;

        export interface ListeningOptions {
            useOverlay: boolean;
            language: string;
            continuous: ContinuityArgs;
            delimiters: DelimiterArgs;
            interimHandler: InterimResultHandler;
            tryExecute: boolean;
            terminators: string[];
        }

        export const listen = async (options?: Partial<ListeningOptions>) => {
            let results: string | undefined;
            let main = MainView.Instance;

            let overlay = options !== undefined && options.useOverlay;
            if (overlay) {
                main.dictationOverlayVisible = true;
                main.isListening = { interim: false };
            }

            try {
                results = await listenImpl(options);
                if (results) {
                    Utils.CopyText(results);
                    if (overlay) {
                        main.isListening = false;
                        let execute = options && options.tryExecute;
                        main.dictatedPhrase = execute ? results.toLowerCase() : results;
                        main.dictationSuccess = execute ? await DictationManager.Commands.execute(results) : true;
                    }
                    options && options.tryExecute && await DictationManager.Commands.execute(results);
                }
            } catch (e) {
                if (overlay) {
                    main.isListening = false;
                    main.dictatedPhrase = results = `dictation error: ${"error" in e ? e.error : "unknown error"}`;
                    main.dictationSuccess = false;
                }
            } finally {
                overlay && main.initiateDictationFade();
            }

            return results;
        };

        const listenImpl = (options?: Partial<ListeningOptions>) => {
            if (isListening) {
                return Infringed;
            }
            isListening = true;

            let handler = options ? options.interimHandler : undefined;
            let continuous = options ? options.continuous : undefined;
            let indefinite = continuous && continuous.indefinite;
            let language = options ? options.language : undefined;
            let intra = options && options.delimiters ? options.delimiters.intra : undefined;
            let inter = options && options.delimiters ? options.delimiters.inter : undefined;

            recognizer.interimResults = handler !== undefined;
            recognizer.continuous = continuous === undefined ? false : continuous !== false;
            recognizer.lang = language === undefined ? "en-US" : language;

            recognizer.start();

            return new Promise<string>((resolve, reject) => {

                recognizer.onerror = (e: SpeechRecognitionError) => {
                    if (!(indefinite && e.error === "no-speech")) {
                        recognizer.stop();
                        reject(e);
                    }
                };

                recognizer.onresult = (e: SpeechRecognitionEvent) => {
                    current = synthesize(e, intra);
                    let matchedTerminator: string | undefined;
                    if (options && options.terminators && (matchedTerminator = options.terminators.find(end => current ? current.trim().toLowerCase().endsWith(end.toLowerCase()) : false))) {
                        current = matchedTerminator;
                        recognizer.abort();
                        return complete();
                    }
                    handler && handler(current);
                    isManuallyStopped && complete();
                };

                recognizer.onend = (e: Event) => {
                    if (!indefinite || isManuallyStopped) {
                        return complete();
                    }

                    if (current) {
                        sessionResults.push(current);
                        current = undefined;
                    }
                    recognizer.start();
                };

                let complete = () => {
                    if (indefinite) {
                        current && sessionResults.push(current);
                        sessionResults.length && resolve(sessionResults.join(inter || interSession));
                    } else {
                        resolve(current);
                    }
                    reset();
                };

            });
        };

        export const stop = (salvageSession = true) => {
            if (!isListening) {
                return;
            }
            isManuallyStopped = true;
            salvageSession ? recognizer.stop() : recognizer.abort();
            // let main = MainView.Instance;
            // if (main.dictationOverlayVisible) {
            // main.cancelDictationFade();
            // main.dictationOverlayVisible = false;
            // main.dictationSuccess = undefined;
            // setTimeout(() => main.dictatedPhrase = placeholder, 500);
            // }
        };

        const synthesize = (e: SpeechRecognitionEvent, delimiter?: string) => {
            let results = e.results;
            let transcripts: string[] = [];
            for (let i = 0; i < results.length; i++) {
                transcripts.push(results.item(i).item(0).transcript.trim());
            }
            return transcripts.join(delimiter || intraSession);
        };

        const reset = () => {
            current = undefined;
            sessionResults = [];
            isListening = false;
            isManuallyStopped = false;
            recognizer.onresult = null;
            recognizer.onerror = null;
            recognizer.onend = null;
        };

    }

    export namespace Commands {

        export const dictationFadeDuration = 2000;

        export type IndependentAction = (target: DocumentView) => any | Promise<any>;
        export type IndependentEntry = { action: IndependentAction, restrictTo?: DocumentType[] };

        export type DependentAction = (target: DocumentView, matches: RegExpExecArray) => any | Promise<any>;
        export type DependentEntry = { expression: RegExp, action: DependentAction, restrictTo?: DocumentType[] };

        export const RegisterIndependent = (key: string, value: IndependentEntry) => Independent.set(key, value);
        export const RegisterDependent = (entry: DependentEntry) => Dependent.push(entry);

        export const execute = async (phrase: string) => {
            return UndoManager.RunInBatch(async () => {
                let targets = SelectionManager.SelectedDocuments();
                if (!targets || !targets.length) {
                    return;
                }

                phrase = phrase.toLowerCase();
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
            }, "Execute Command");
        };

        const ConstructorMap = new Map<DocumentType, CastCtor>([
            [DocumentType.COL, listSpec(Doc)],
            [DocumentType.AUDIO, AudioField],
            [DocumentType.IMG, ImageField],
            [DocumentType.HIST, HistogramField],
            [DocumentType.IMPORT, listSpec(Doc)],
            [DocumentType.TEXT, "string"]
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
            let converted = interpreter.wordsToNumbers(number, { fuzzy: true });
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
            }],

            ["new outline", {
                action: (target: DocumentView) => {
                    let newBox = Docs.Create.TextDocument({ width: 400, height: 200, title: "My Outline" });
                    newBox.autoHeight = true;
                    let proto = newBox.proto!;
                    proto.page = -1;
                    let prompt = "Press alt + r to start dictating here...";
                    let head = 3;
                    let anchor = head + prompt.length;
                    let proseMirrorState = `{"doc":{"type":"doc","content":[{"type":"bullet_list","content":[{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"${prompt}"}]}]}]}]},"selection":{"type":"text","anchor":${anchor},"head":${head}}}`;
                    proto.data = new RichTextField(proseMirrorState);
                    proto.backgroundColor = "#eeffff";
                    target.props.addDocTab(newBox, proto, "onRight");
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
                    if (isNaN(count)) {
                        return;
                    }
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