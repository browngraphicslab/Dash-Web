import { UndoManager } from "../util/UndoManager";
import { SelectionManager } from "../util/SelectionManager";
import { CollectionDockingView } from "./collections/CollectionDockingView";
import { MainView } from "./MainView";
import { DragManager } from "../util/DragManager";
import { action, runInAction } from "mobx";
import { Doc } from "../../new_fields/Doc";
import { DictationManager } from "../util/DictationManager";
import SharingManager from "../util/SharingManager";
import { Cast, PromiseValue, NumCast } from "../../new_fields/Types";
import { ScriptField } from "../../new_fields/ScriptField";
import { InkingControl } from "./InkingControl";
import { InkTool } from "../../new_fields/InkField";
import { DocumentView } from "./nodes/DocumentView";
import GoogleAuthenticationManager from "../apis/GoogleAuthenticationManager";

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
            case "escape":
                const main = MainView.Instance;
                InkingControl.Instance.switchTool(InkTool.None);
                if (main.isPointerDown) {
                    DragManager.AbortDrag();
                } else {
                    if (CollectionDockingView.Instance.HasFullScreen()) {
                        CollectionDockingView.Instance.CloseFullScreen();
                    } else {
                        SelectionManager.DeselectAll();
                    }
                }
                SelectionManager.DeselectAll();
                DictationManager.Controls.stop();
                // RecommendationsBox.Instance.closeMenu();
                GoogleAuthenticationManager.Instance.cancel();
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
            case "x":
            case "c":
                stopPropagation = false;
                preventDefault = false;
                break;
        }

        return {
            stopPropagation: stopPropagation,
            preventDefault: preventDefault
        };
    });

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