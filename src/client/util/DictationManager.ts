import { SelectionManager } from "./SelectionManager";
import { DocumentView } from "../views/nodes/DocumentView";
import { UndoManager } from "./UndoManager";
import * as interpreter from "words-to-numbers";
import { DocumentType } from "../documents/DocumentTypes";
import { Doc, Opt } from "../../fields/Doc";
import { List } from "../../fields/List";
import { Docs } from "../documents/Documents";
import { Cast, CastCtor } from "../../fields/Types";
import { listSpec } from "../../fields/Schema";
import { AudioField, ImageField } from "../../fields/URLField";
import { Utils } from "../../Utils";
import { RichTextField } from "../../fields/RichTextField";
import { DictationOverlay } from "../views/DictationOverlay";

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
    const { webkitSpeechRecognition }: CORE.IWindow = window as any as CORE.IWindow;
    export const placeholder = "Listening...";

    export namespace Controls {

        export const Infringed = "unable to process: dictation manager still involved in previous session";
        const browser = (() => {
            const identifier = navigator.userAgent.toLowerCase();
            if (identifier.indexOf("safari") >= 0) {
                return "Safari";
            }
            if (identifier.indexOf("chrome") >= 0) {
                return "Chrome";
            }
            if (identifier.indexOf("firefox") >= 0) {
                return "Firefox";
            }
            return "Unidentified Browser";
        })();
        const unsupported = `listening is not supported in ${browser}`;
        const intraSession = ". ";
        const interSession = " ... ";

        export let isListening = false;
        let isManuallyStopped = false;

        let current: string | undefined = undefined;
        let sessionResults: string[] = [];

        const recognizer: Opt<SpeechRecognition> = webkitSpeechRecognition ? new webkitSpeechRecognition() : undefined;

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

            const overlay = options?.useOverlay;
            if (overlay) {
                DictationOverlay.Instance.dictationOverlayVisible = true;
                DictationOverlay.Instance.isListening = { interim: false };
            }

            try {
                results = await listenImpl(options);
                if (results) {
                    Utils.CopyText(results);
                    if (overlay) {
                        DictationOverlay.Instance.isListening = false;
                        const execute = options?.tryExecute;
                        DictationOverlay.Instance.dictatedPhrase = execute ? results.toLowerCase() : results;
                        DictationOverlay.Instance.dictationSuccess = execute ? await DictationManager.Commands.execute(results) : true;
                    }
                    options?.tryExecute && await DictationManager.Commands.execute(results);
                }
            } catch (e) {
                if (overlay) {
                    DictationOverlay.Instance.isListening = false;
                    DictationOverlay.Instance.dictatedPhrase = results = `dictation error: ${"error" in e ? e.error : "unknown error"}`;
                    DictationOverlay.Instance.dictationSuccess = false;
                }
            } finally {
                overlay && DictationOverlay.Instance.initiateDictationFade();
            }

            return results;
        };

        const listenImpl = (options?: Partial<ListeningOptions>) => {
            if (!recognizer) {
                console.log("DictationManager:" + unsupported);
                return unsupported;
            }
            if (isListening) {
                return Infringed;
            }
            isListening = true;

            const handler = options?.interimHandler;
            const continuous = options?.continuous;
            const indefinite = continuous && continuous.indefinite;
            const language = options?.language;
            const intra = options?.delimiters?.intra;
            const inter = options?.delimiters?.inter;

            recognizer.onstart = () => console.log("initiating speech recognition session...");
            recognizer.interimResults = handler !== undefined;
            recognizer.continuous = continuous === undefined ? false : continuous !== false;
            recognizer.lang = language === undefined ? "en-US" : language;

            recognizer.start();

            return new Promise<string>((resolve, reject) => {
                recognizer.onerror = (e: any) => { // e is SpeechRecognitionError but where is that defined? 
                    if (!(indefinite && e.error === "no-speech")) {
                        recognizer.stop();
                        reject(e);
                    }
                };

                recognizer.onresult = (e: SpeechRecognitionEvent) => {
                    current = synthesize(e, intra);
                    let matchedTerminator: string | undefined;
                    if (options?.terminators && (matchedTerminator = options.terminators.find(end => current ? current.trim().toLowerCase().endsWith(end.toLowerCase()) : false))) {
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

                const complete = () => {
                    if (indefinite) {
                        current && sessionResults.push(current);
                        sessionResults.length && resolve(sessionResults.join(inter || interSession));
                    } else {
                        resolve(current);
                    }
                    current = undefined;
                    sessionResults = [];
                    isListening = false;
                    isManuallyStopped = false;
                    recognizer.onresult = null;
                    recognizer.onerror = null;
                    recognizer.onend = null;
                };

            });
        };

        export const stop = (salvageSession = true) => {
            if (!isListening || !recognizer) {
                return;
            }
            isListening = false;
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
            const results = e.results;
            const transcripts: string[] = [];
            for (let i = 0; i < results.length; i++) {
                transcripts.push(results.item(i).item(0).transcript.trim());
            }
            return transcripts.join(delimiter || intraSession);
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
                const targets = SelectionManager.SelectedDocuments();
                if (!targets || !targets.length) {
                    return;
                }

                phrase = phrase.toLowerCase();
                const entry = Independent.get(phrase);

                if (entry) {
                    let success = false;
                    const restrictTo = entry.restrictTo;
                    for (const target of targets) {
                        if (!restrictTo || validate(target, restrictTo)) {
                            await entry.action(target);
                            success = true;
                        }
                    }
                    return success;
                }

                for (const entry of Dependent) {
                    const regex = entry.expression;
                    const matches = regex.exec(phrase);
                    regex.lastIndex = 0;
                    if (matches !== null) {
                        let success = false;
                        const restrictTo = entry.restrictTo;
                        for (const target of targets) {
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
            [DocumentType.IMPORT, listSpec(Doc)],
            [DocumentType.RTF, "string"]
        ]);

        const tryCast = (view: DocumentView, type: DocumentType) => {
            const ctor = ConstructorMap.get(type);
            if (!ctor) {
                return false;
            }
            return Cast(Doc.GetProto(view.props.Document).data, ctor) !== undefined;
        };

        const validate = (target: DocumentView, types: DocumentType[]) => {
            for (const type of types) {
                if (tryCast(target, type)) {
                    return true;
                }
            }
            return false;
        };

        const interpretNumber = (number: string) => {
            const initial = parseInt(number);
            if (!isNaN(initial)) {
                return initial;
            }
            const converted = interpreter.wordsToNumbers(number, { fuzzy: true });
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
                    const kvp = Docs.Create.KVPDocument(target.props.Document, { _width: 300, _height: 300 });
                    target.props.addDocTab(kvp, "add:right");
                }
            }],

            ["new outline", {
                action: (target: DocumentView) => {
                    const newBox = Docs.Create.TextDocument("", { _width: 400, _height: 200, title: "My Outline", _autoHeight: true });
                    const proto = newBox.proto!;
                    const prompt = "Press alt + r to start dictating here...";
                    const head = 3;
                    const anchor = head + prompt.length;
                    const proseMirrorState = `{"doc":{"type":"doc","content":[{"type":"ordered_list","content":[{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"${prompt}"}]}]}]}]},"selection":{"type":"text","anchor":${anchor},"head":${head}}}`;
                    proto.data = new RichTextField(proseMirrorState);
                    proto.backgroundColor = "#eeffff";
                    target.props.addDocTab(newBox, "add:right");
                }
            }]

        ]);

        const Dependent = new Array<DependentEntry>(

            {
                expression: /create (\w+) documents of type (image|nested collection)/g,
                action: (target: DocumentView, matches: RegExpExecArray) => {
                    const count = interpretNumber(matches[1]);
                    const what = matches[2];
                    const dataDoc = Doc.GetProto(target.props.Document);
                    const fieldKey = "data";
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
                    const mode = matches[1];
                    mode && (target.props.Document._viewType = mode);
                },
                restrictTo: [DocumentType.COL]
            }

        );

    }

}