import { action } from "mobx";
import { DateField } from "../../fields/DateField";
import { Doc, DocListCast } from "../../fields/Doc";
import { Id } from "../../fields/FieldSymbols";
import { InkTool } from "../../fields/InkField";
import { List } from "../../fields/List";
import { ScriptField } from "../../fields/ScriptField";
import { Cast, PromiseValue } from "../../fields/Types";
import GoogleAuthenticationManager from "../apis/GoogleAuthenticationManager";
import HypothesisAuthenticationManager from "../apis/HypothesisAuthenticationManager";
import { DocServer } from "../DocServer";
import { DocumentType } from "../documents/DocumentTypes";
import { DictationManager } from "../util/DictationManager";
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import SharingManager from "../util/SharingManager";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { CollectionDockingView } from "./collections/CollectionDockingView";
import { DocumentDecorations } from "./DocumentDecorations";
import { MainView } from "./MainView";
import { DocumentView } from "./nodes/DocumentView";
import { DocumentLinksButton } from "./nodes/DocumentLinksButton";
import PDFMenu from "./pdf/PDFMenu";
import { ContextMenu } from "./ContextMenu";

const modifiers = ["control", "meta", "shift", "alt"];
type KeyHandler = (keycode: string, e: KeyboardEvent) => KeyControlInfo | Promise<KeyControlInfo>;
type KeyControlInfo = {
    preventDefault: boolean,
    stopPropagation: boolean
};

export default class KeyManager {
    public static Instance: KeyManager = new KeyManager();
    private router = new Map<string, KeyHandler>();

    constructor() {
        const isMac = navigator.platform.toLowerCase().indexOf("mac") >= 0;

        // SHIFT CONTROL ALT META
        this.router.set("0000", this.unmodified);
        this.router.set(isMac ? "0001" : "0100", this.ctrl);
        this.router.set(isMac ? "0100" : "0010", this.alt);
        this.router.set(isMac ? "1001" : "1100", this.ctrl_shift);
        this.router.set("1000", this.shift);
    }

    public handle = async (e: KeyboardEvent) => {
        const keyname = e.key && e.key.toLowerCase();
        this.handleGreedy(keyname);

        if (modifiers.includes(keyname)) {
            return;
        }

        const bit = (value: boolean) => value ? "1" : "0";
        const modifierIndex = bit(e.shiftKey) + bit(e.ctrlKey) + bit(e.altKey) + bit(e.metaKey);

        const handleConstrained = this.router.get(modifierIndex);
        if (!handleConstrained) {
            return;
        }

        const control = await handleConstrained(keyname, e);

        control.stopPropagation && e.stopPropagation();
        control.preventDefault && e.preventDefault();
    }

    private handleGreedy = action((keyname: string) => {
        switch (keyname) {
        }
    });

    private unmodified = action((keyname: string, e: KeyboardEvent) => {
        switch (keyname) {
            case "a": DragManager.CanEmbed = true;
                break;
            case " ":
                // MarqueeView.DragMarquee = !MarqueeView.DragMarquee; // bcz: this needs a better disclosure UI
                break;
            case "escape":
                // if (DocumentLinksButton.StartLink) {
                //     if (DocumentLinksButton.StartLink.Document) {
                //         action((e: React.PointerEvent<HTMLDivElement>) => {
                //             Doc.UnBrushDoc(DocumentLinksButton.StartLink?.Document as Doc);
                //         });
                //     }
                // }
                DocumentLinksButton.StartLink = undefined;

                const main = MainView.Instance;
                Doc.SetSelectedTool(InkTool.None);
                var doDeselect = true;
                if (main.isPointerDown) {
                    DragManager.AbortDrag();
                } else {
                    if (CollectionDockingView.Instance.HasFullScreen()) {
                        CollectionDockingView.Instance.CloseFullScreen();
                    } else {
                        doDeselect = !ContextMenu.Instance.closeMenu();
                    }
                }
                doDeselect && SelectionManager.DeselectAll();
                DictationManager.Controls.stop();
                // RecommendationsBox.Instance.closeMenu();
                GoogleAuthenticationManager.Instance.cancel();
                HypothesisAuthenticationManager.Instance.cancel();
                SharingManager.Instance.close();
                break;
            case "delete":
            case "backspace":
                if (document.activeElement) {
                    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
                        return { stopPropagation: false, preventDefault: false };
                    }
                }
                UndoManager.RunInBatch(() =>
                    SelectionManager.SelectedDocuments().map(dv => dv.props.removeDocument?.(dv.props.Document)), "delete");
                SelectionManager.DeselectAll();
                break;
            case "arrowleft":
                UndoManager.RunInBatch(() => SelectionManager.SelectedDocuments().map(dv => dv.props.nudge?.(-1, 0)), "nudge left");
                break;
            case "arrowright":
                UndoManager.RunInBatch(() => SelectionManager.SelectedDocuments().map(dv => dv.props.nudge?.(1, 0)), "nudge right");
                break;
            case "arrowup":
                UndoManager.RunInBatch(() => SelectionManager.SelectedDocuments().map(dv => dv.props.nudge?.(0, -1)), "nudge up");
                break;
            case "arrowdown":
                UndoManager.RunInBatch(() => SelectionManager.SelectedDocuments().map(dv => dv.props.nudge?.(0, 1)), "nudge down");
                break;
        }

        return {
            stopPropagation: false,
            preventDefault: false
        };
    });

    private shift = async (keyname: string) => {
        const stopPropagation = false;
        const preventDefault = false;

        switch (keyname) {
            // case "~":
            //     DictationManager.Controls.listen({ useOverlay: true, tryExecute: true });
            //     stopPropagation = true;
            //     preventDefault = true;
            case "arrowleft":
                UndoManager.RunInBatch(() => SelectionManager.SelectedDocuments().map(dv => dv.props.nudge?.(-10, 0)), "nudge left");
                break;
            case "arrowright":
                UndoManager.RunInBatch(() => SelectionManager.SelectedDocuments().map(dv => dv.props.nudge?.(10, 0)), "nudge right");
                break;
            case "arrowup":
                UndoManager.RunInBatch(() => SelectionManager.SelectedDocuments().map(dv => dv.props.nudge?.(0, -10)), "nudge up");
                break;
            case "arrowdown":
                UndoManager.RunInBatch(() => SelectionManager.SelectedDocuments().map(dv => dv.props.nudge?.(0, 10)), "nudge down");
                break;
        }

        return {
            stopPropagation: stopPropagation,
            preventDefault: preventDefault
        };
    }

    private alt = action((keyname: string) => {
        const stopPropagation = true;
        const preventDefault = true;

        switch (keyname) {
            case "f":
                const dv = SelectionManager.SelectedDocuments()?.[0];
                if (dv) {
                    const ex = dv.props.ScreenToLocalTransform().inverse().transformPoint(0, 0)[0];
                    const ey = dv.props.ScreenToLocalTransform().inverse().transformPoint(0, 0)[1];
                    DocumentView.FloatDoc(dv, ex, ey);
                }
            // case "n":
            //     let toggle = MainView.Instance.addMenuToggle.current!;
            //     toggle.checked = !toggle.checked;
            //     break;
        }

        return {
            stopPropagation: stopPropagation,
            preventDefault: preventDefault
        };
    });

    private ctrl = action((keyname: string, e: KeyboardEvent) => {
        let stopPropagation = true;
        let preventDefault = true;

        switch (keyname) {
            case "arrowright":
                if (document.activeElement) {
                    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
                        return { stopPropagation: false, preventDefault: false };
                    }
                }
                MainView.Instance.mainFreeform && CollectionDockingView.AddRightSplit(MainView.Instance.mainFreeform);
                break;
            case "arrowleft":
                if (document.activeElement) {
                    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
                        return { stopPropagation: false, preventDefault: false };
                    }
                }
                MainView.Instance.mainFreeform && CollectionDockingView.CloseRightSplit(MainView.Instance.mainFreeform);
                break;
            case "backspace":
                if (document.activeElement) {
                    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
                        return { stopPropagation: false, preventDefault: false };
                    }
                }
                break;
            case "t":
                PromiseValue(Cast(Doc.UserDoc()["tabs-button-tools"], Doc)).then(pv => pv && (pv.onClick as ScriptField).script.run({ this: pv }));
                if (MainView.Instance.flyoutWidth === 240) {
                    MainView.Instance.flyoutWidth = 0;
                } else {
                    MainView.Instance.flyoutWidth = 240;
                }
                break;
            case "l":
                PromiseValue(Cast(Doc.UserDoc()["tabs-button-library"], Doc)).then(pv => pv && (pv.onClick as ScriptField).script.run({ this: pv }));
                if (MainView.Instance.flyoutWidth === 250) {
                    MainView.Instance.flyoutWidth = 0;
                } else {
                    MainView.Instance.flyoutWidth = 250;
                }
                break;
            case "f":
                PromiseValue(Cast(Doc.UserDoc()["tabs-button-search"], Doc)).then(pv => pv && (pv.onClick as ScriptField).script.run({ this: pv }));
                if (MainView.Instance.flyoutWidth === 400) {
                    MainView.Instance.flyoutWidth = 0;
                } else {
                    MainView.Instance.flyoutWidth = 400;
                }
                break;
            case "o":
                const target = SelectionManager.SelectedDocuments()[0];
                target && CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(target);
                break;
            case "r":
                preventDefault = false;
                break;
            case "y":
                UndoManager.Redo();
                stopPropagation = false;
                break;
            case "z":
                UndoManager.Undo();
                stopPropagation = false;
                break;
            case "a":
            case "v":
                stopPropagation = false;
                preventDefault = false;
                break;
            case "x":
                if (SelectionManager.SelectedDocuments().length) {
                    const bds = DocumentDecorations.Instance.Bounds;
                    const pt = SelectionManager.SelectedDocuments()[0].props.ScreenToLocalTransform().transformPoint(bds.x + (bds.r - bds.x) / 2, bds.y + (bds.b - bds.y) / 2);
                    const text = `__DashDocId(${pt?.[0] || 0},${pt?.[1] || 0}):` + SelectionManager.SelectedDocuments().map(dv => dv.Document[Id]).join(":");
                    SelectionManager.SelectedDocuments().length && navigator.clipboard.writeText(text);
                    DocumentDecorations.Instance.onCloseClick(undefined);
                    stopPropagation = false;
                    preventDefault = false;
                }
                break;
            case "c":
                if (!PDFMenu.Instance.Active && DocumentDecorations.Instance.Bounds.r - DocumentDecorations.Instance.Bounds.x > 2) {
                    const bds = DocumentDecorations.Instance.Bounds;
                    const pt = SelectionManager.SelectedDocuments()[0].props.ScreenToLocalTransform().transformPoint(bds.x + (bds.r - bds.x) / 2, bds.y + (bds.b - bds.y) / 2);
                    const text = `__DashCloneId(${pt?.[0] || 0},${pt?.[1] || 0}):` + SelectionManager.SelectedDocuments().map(dv => dv.Document[Id]).join(":");
                    SelectionManager.SelectedDocuments().length && navigator.clipboard.writeText(text);
                    stopPropagation = false;
                }
                preventDefault = false;
                break;
        }

        return {
            stopPropagation: stopPropagation,
            preventDefault: preventDefault
        };
    });

    public paste(e: ClipboardEvent) {
        const plain = e.clipboardData?.getData("text/plain");
        const clone = plain?.startsWith("__DashCloneId(");
        if (plain && (plain.startsWith("__DashDocId(") || clone)) {
            const first = SelectionManager.SelectedDocuments().length ? SelectionManager.SelectedDocuments()[0] : undefined;
            if (first?.props.Document.type === DocumentType.COL) {
                const docids = plain.split(":");
                let count = 1;
                const list: Doc[] = [];
                const targetDataDoc = Doc.GetProto(first.props.Document);
                const fieldKey = Doc.LayoutFieldKey(first.props.Document);
                const docList = DocListCast(targetDataDoc[fieldKey]);
                docids.map((did, i) => i && DocServer.GetRefField(did).then(doc => {
                    count++;
                    if (doc instanceof Doc) {
                        list.push(doc);
                    }
                    if (count === docids.length) {
                        const added = list.filter(d => !docList.includes(d)).map(d => clone ? Doc.MakeClone(d) : d);
                        if (added.length) {
                            added.map(doc => doc.context = targetDataDoc);
                            undoBatch(() => {
                                targetDataDoc[fieldKey] = new List<Doc>([...docList, ...added]);
                                targetDataDoc[fieldKey + "-lastModified"] = new DateField(new Date(Date.now()));
                            })();
                        }
                    }
                }));
            }
        }
    }

    async printClipboard() {
        const text: string = await navigator.clipboard.readText();
    }

    private ctrl_shift = action((keyname: string) => {
        const stopPropagation = true;
        const preventDefault = true;

        switch (keyname) {
            case "z":
                UndoManager.Redo();
                break;
        }

        return {
            stopPropagation: stopPropagation,
            preventDefault: preventDefault
        };
    });

}
