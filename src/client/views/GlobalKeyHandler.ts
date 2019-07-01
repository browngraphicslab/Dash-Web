import { UndoManager, undoBatch } from "../util/UndoManager";
import { SelectionManager } from "../util/SelectionManager";
import { CollectionDockingView } from "./collections/CollectionDockingView";
import { MainView } from "./MainView";
import { DragManager } from "../util/DragManager";
import { action } from "mobx";

const modifiers = ["control", "meta", "shift", "alt"];
type KeyHandler = (keycode: string) => KeyControlInfo;
type KeyControlInfo = {
    preventDefault: boolean,
    stopPropagation: boolean
};

export default class KeyManager {
    public static Instance: KeyManager = new KeyManager();
    private router = new Map<string, KeyHandler>();

    constructor() {
        let isMac = navigator.platform.toLowerCase().indexOf("mac") >= 0;

        // SHIFT CONTROL ALT META
        this.router.set("0000", this.unmodified);
        this.router.set(isMac ? "0001" : "0100", this.ctrl);
        this.router.set(isMac ? "0100" : "0010", this.alt);
        this.router.set(isMac ? "1001" : "1100", this.ctrl_shift);
    }

    public handle = (e: KeyboardEvent) => {
        let keyname = e.key.toLowerCase();
        this.handleGreedy(keyname);

        if (modifiers.includes(keyname)) {
            return;
        }

        let bit = (value: boolean) => value ? "1" : "0";
        let modifierIndex = bit(e.shiftKey) + bit(e.ctrlKey) + bit(e.altKey) + bit(e.metaKey);

        let handleConstrained = this.router.get(modifierIndex);
        if (!handleConstrained) {
            return;
        }

        let control = handleConstrained(keyname);

        control.stopPropagation && e.stopPropagation();
        control.preventDefault && e.preventDefault();
    }

    private handleGreedy = action((keyname: string) => {
        switch (keyname) {
        }
    });

    private unmodified = action((keyname: string) => {
        switch (keyname) {
            case "escape":
                if (MainView.Instance.isPointerDown) {
                    DragManager.AbortDrag();
                } else {
                    if (CollectionDockingView.Instance.HasFullScreen()) {
                        CollectionDockingView.Instance.CloseFullScreen();
                    } else {
                        SelectionManager.DeselectAll();
                    }
                }
                break;
        }

        return {
            stopPropagation: false,
            preventDefault: false
        };
    });

    private alt = action((keyname: string) => {
        let stopPropagation = true;
        let preventDefault = true;

        switch (keyname) {
            case "n":
                let toggle = MainView.Instance.addMenuToggle.current!;
                toggle.checked = !toggle.checked;
                break;
        }

        return {
            stopPropagation: stopPropagation,
            preventDefault: preventDefault
        };
    });

    private ctrl = action((keyname: string) => {
        let stopPropagation = true;
        let preventDefault = true;

        switch (keyname) {
            case "arrowright":
                MainView.Instance.mainFreeform && CollectionDockingView.Instance.AddRightSplit(MainView.Instance.mainFreeform, undefined);
                break;
            case "arrowleft":
                MainView.Instance.mainFreeform && CollectionDockingView.Instance.CloseRightSplit(MainView.Instance.mainFreeform)
                break;
            case "f":
                MainView.Instance.isSearchVisible = !MainView.Instance.isSearchVisible;
                break;
            case "o":
                let target = SelectionManager.SelectedDocuments()[0];
                target && target.fullScreenClicked();
                break;
            case "r":
                preventDefault = false;
                break;
            case "y":
                UndoManager.Redo();
                break;
            case "z":
                UndoManager.Undo();
                break;
            case "a":
            case "c":
            case "v":
            case "x":
                stopPropagation = false;
                preventDefault = false;
                break;
        }

        return {
            stopPropagation: stopPropagation,
            preventDefault: preventDefault
        };
    });

    private ctrl_shift = action((keyname: string) => {
        let stopPropagation = true;
        let preventDefault = true;

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