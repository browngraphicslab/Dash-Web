import { random } from "lodash";
import { action, observable } from "mobx";
import { DateField } from "../../fields/DateField";
import { Doc, DocListCast } from "../../fields/Doc";
import { Id } from "../../fields/FieldSymbols";
import { InkTool } from "../../fields/InkField";
import { List } from "../../fields/List";
import { ScriptField } from "../../fields/ScriptField";
import { Cast, PromiseValue } from "../../fields/Types";
import { GoogleAuthenticationManager } from "../apis/GoogleAuthenticationManager";
import { DocServer } from "../DocServer";
import { DocumentType } from "../documents/DocumentTypes";
import { DictationManager } from "../util/DictationManager";
import { DragManager } from "../util/DragManager";
import { GroupManager } from "../util/GroupManager";
import { SelectionManager } from "../util/SelectionManager";
import { SharingManager } from "../util/SharingManager";
import { SnappingManager } from "../util/SnappingManager";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { CollectionDockingView } from "./collections/CollectionDockingView";
import { CollectionFreeFormViewChrome } from "./collections/CollectionMenu";
import { CollectionStackedTimeline } from "./collections/CollectionStackedTimeline";
import { ContextMenu } from "./ContextMenu";
import { DocumentDecorations } from "./DocumentDecorations";
import { InkStrokeProperties } from "./InkStrokeProperties";
import { LightboxView } from "./LightboxView";
import { MainView } from "./MainView";
import { DocumentLinksButton } from "./nodes/DocumentLinksButton";
import { AnchorMenu } from "./pdf/AnchorMenu";
import { SearchBox } from "./search/SearchBox";

const modifiers = ["control", "meta", "shift", "alt"];
type KeyHandler = (keycode: string, e: KeyboardEvent) => KeyControlInfo | Promise<KeyControlInfo>;
type KeyControlInfo = {
    preventDefault: boolean,
    stopPropagation: boolean
};

export class KeyManager {
    public static Instance: KeyManager = new KeyManager();
    private router = new Map<string, KeyHandler>();
    @observable ShiftPressed = false;

    constructor() {
        const isMac = navigator.platform.toLowerCase().indexOf("mac") >= 0;

        // SHIFT CONTROL ALT META
        this.router.set("0000", this.unmodified);
        this.router.set(isMac ? "0001" : "0100", this.ctrl);
        this.router.set(isMac ? "0100" : "0010", this.alt);
        this.router.set(isMac ? "1001" : "1100", this.ctrl_shift);
        this.router.set("1000", this.shift);
    }

    public unhandle = action((e: KeyboardEvent) => {
        if (e.key?.toLowerCase() === "shift") KeyManager.Instance.ShiftPressed = false;
    });

    public handle = action(async (e: KeyboardEvent) => {
        if (e.key?.toLowerCase() === "shift" && e.ctrlKey && e.altKey) KeyManager.Instance.ShiftPressed = true;
        //if (!Doc.UserDoc().noviceMode && e.key.toLocaleLowerCase() === "shift") DocServer.UPDATE_SERVER_CACHE(true);
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
    });

    private handleGreedy = action((keyname: string) => {
        switch (keyname) {
        }
    });

    private unmodified = action((keyname: string, e: KeyboardEvent) => {
        switch (keyname) {
            case "a": SnappingManager.GetIsDragging() && (DragManager.CanEmbed = true);
                break;
            case "u":
                if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
                    return { stopPropagation: false, preventDefault: false };
                }

                const ungroupings = SelectionManager.Views().slice();
                UndoManager.RunInBatch(() => ungroupings.map(dv => dv.layoutDoc.group = undefined), "ungroup");
                SelectionManager.DeselectAll();
                break;
            case "g":
                if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
                    return { stopPropagation: false, preventDefault: false };
                }

                const groupings = SelectionManager.Views().slice();
                const randomGroup = random(0, 1000);
                UndoManager.RunInBatch(() => groupings.map(dv => dv.layoutDoc.group = randomGroup), "group");
                SelectionManager.DeselectAll();
                break;
            case " ":
                // MarqueeView.DragMarquee = !MarqueeView.DragMarquee; // bcz: this needs a better disclosure UI
                break;
            case "escape":
                DocumentLinksButton.StartLink = undefined;
                DocumentLinksButton.StartLinkView = undefined;
                InkStrokeProperties.Instance && (InkStrokeProperties.Instance._controlBtn = false);

                Doc.SetSelectedTool(InkTool.None);
                var doDeselect = true;
                if (SnappingManager.GetIsDragging()) {
                    DragManager.AbortDrag();
                } else if (CollectionDockingView.Instance.HasFullScreen) {
                    CollectionDockingView.Instance.CloseFullScreen();
                } else if (CollectionStackedTimeline.SelectingRegion) {
                    CollectionStackedTimeline.SelectingRegion = undefined;
                    doDeselect = false;
                } else {
                    doDeselect = !ContextMenu.Instance.closeMenu();
                }
                if (doDeselect) {
                    SelectionManager.DeselectAll();
                    LightboxView.SetLightboxDoc(undefined);
                }
                DictationManager.Controls.stop();
                GoogleAuthenticationManager.Instance.cancel();
                SharingManager.Instance.close();
                GroupManager.Instance.close();
                CollectionFreeFormViewChrome.Instance?.clearKeepPrimitiveMode();
                window.getSelection()?.empty();
                document.body.focus();
                break;
            case "delete":
            case "backspace":
                if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
                    const selected = SelectionManager.Views().slice();
                    UndoManager.RunInBatch(() => {
                        SelectionManager.DeselectAll();
                        selected.map(dv => !dv.props.Document._stayInCollection && dv.props.removeDocument?.(dv.props.Document));
                    }, "delete");
                    return { stopPropagation: true, preventDefault: true };
                }
                break;
            case "arrowleft": UndoManager.RunInBatch(() => SelectionManager.Views().map(dv => dv.props.CollectionFreeFormDocumentView?.().nudge(-1, 0)), "nudge left"); break;
            case "arrowright": UndoManager.RunInBatch(() => SelectionManager.Views().map(dv => dv.props.CollectionFreeFormDocumentView?.().nudge?.(1, 0)), "nudge right"); break;
            case "arrowup": UndoManager.RunInBatch(() => SelectionManager.Views().map(dv => dv.props.CollectionFreeFormDocumentView?.().nudge?.(0, -1)), "nudge up"); break;
            case "arrowdown": UndoManager.RunInBatch(() => SelectionManager.Views().map(dv => dv.props.CollectionFreeFormDocumentView?.().nudge?.(0, 1)), "nudge down"); break;
        }

        return {
            stopPropagation: false,
            preventDefault: false
        };
    });

    private shift = action(async (keyname: string) => {
        const stopPropagation = false;
        const preventDefault = false;

        switch (keyname) {
            case "arrowleft": UndoManager.RunInBatch(() => SelectionManager.Views().map(dv => dv.props.CollectionFreeFormDocumentView?.().nudge?.(-10, 0)), "nudge left"); break;
            case "arrowright": UndoManager.RunInBatch(() => SelectionManager.Views().map(dv => dv.props.CollectionFreeFormDocumentView?.().nudge?.(10, 0)), "nudge right"); break;
            case "arrowup": UndoManager.RunInBatch(() => SelectionManager.Views().map(dv => dv.props.CollectionFreeFormDocumentView?.().nudge?.(0, -10)), "nudge up"); break;
            case "arrowdown": UndoManager.RunInBatch(() => SelectionManager.Views().map(dv => dv.props.CollectionFreeFormDocumentView?.().nudge?.(0, 10)), "nudge down"); break;
        }

        return {
            stopPropagation: stopPropagation,
            preventDefault: preventDefault
        };
    });

    private alt = action((keyname: string) => {
        const stopPropagation = true;
        const preventDefault = true;

        switch (keyname) {
            case "ƒ":
            case "f":
                const dv = SelectionManager.Views()?.[0];
                UndoManager.RunInBatch(() => dv.props.CollectionFreeFormDocumentView?.().float(), "float");
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
                if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
                    return { stopPropagation: false, preventDefault: false };
                }
                MainView.Instance.mainFreeform && CollectionDockingView.AddSplit(MainView.Instance.mainFreeform, "right");
                break;
            case "arrowleft":
                if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
                    return { stopPropagation: false, preventDefault: false };
                }
                MainView.Instance.mainFreeform && CollectionDockingView.CloseSplit(MainView.Instance.mainFreeform);
                break;
            case "backspace":
                if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
                    return { stopPropagation: false, preventDefault: false };
                }
                break;
            case "t":
                PromiseValue(Cast(Doc.UserDoc()["tabs-button-tools"], Doc)).then(pv => pv && (pv.onClick as ScriptField).script.run({ this: pv }));
                break;
            case "f":
                SearchBox.Instance._searchFullDB = "My Stuff";
                SearchBox.Instance.enter(undefined);
                break;
            case "o":
                const target = SelectionManager.Views()[0];
                target && CollectionDockingView.OpenFullScreen(target.props.Document);
                break;
            case "r":
                preventDefault = false;
                break;
            case "y":
                SelectionManager.DeselectAll();
                UndoManager.Redo();
                stopPropagation = false;
                break;
            case "z":
                SelectionManager.DeselectAll();
                UndoManager.Undo();
                stopPropagation = false;
                break;
            case "a":
                if (e.target !== document.body) {
                    stopPropagation = false;
                    preventDefault = false;
                }
                break;
            case "v":
                stopPropagation = false;
                preventDefault = false;
                break;
            case "x":
                if (SelectionManager.Views().length) {
                    const bds = DocumentDecorations.Instance.Bounds;
                    const pt = SelectionManager.Views()[0].props.ScreenToLocalTransform().transformPoint(bds.x + (bds.r - bds.x) / 2, bds.y + (bds.b - bds.y) / 2);
                    const text = `__DashDocId(${pt?.[0] || 0},${pt?.[1] || 0}):` + SelectionManager.Views().map(dv => dv.Document[Id]).join(":");
                    SelectionManager.Views().length && navigator.clipboard.writeText(text);
                    DocumentDecorations.Instance.onCloseClick(undefined);
                    stopPropagation = false;
                    preventDefault = false;
                }
                break;
            case "c":
                if (!AnchorMenu.Instance.Active && DocumentDecorations.Instance.Bounds.r - DocumentDecorations.Instance.Bounds.x > 2) {
                    const bds = DocumentDecorations.Instance.Bounds;
                    const pt = SelectionManager.Views()[0].props.ScreenToLocalTransform().transformPoint(bds.x + (bds.r - bds.x) / 2, bds.y + (bds.b - bds.y) / 2);
                    const text = `__DashCloneId(${pt?.[0] || 0},${pt?.[1] || 0}):` + SelectionManager.Views().map(dv => dv.Document[Id]).join(":");
                    SelectionManager.Views().length && navigator.clipboard.writeText(text);
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
            const first = SelectionManager.Views().length ? SelectionManager.Views()[0] : undefined;
            if (first?.props.Document.type === DocumentType.COL) {
                const docids = plain.split(":");
                let count = 1;
                const list: Doc[] = [];
                const targetDataDoc = Doc.GetProto(first.props.Document);
                const fieldKey = first.LayoutFieldKey;
                const docList = DocListCast(targetDataDoc[fieldKey]);
                docids.map((did, i) => i && DocServer.GetRefField(did).then(async doc => {
                    count++;
                    if (doc instanceof Doc) {
                        list.push(doc);
                    }
                    if (count === docids.length) {
                        const added = await Promise.all(list.filter(d => !docList.includes(d)).map(async d => clone ? (await Doc.MakeClone(d)).clone : d));
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
