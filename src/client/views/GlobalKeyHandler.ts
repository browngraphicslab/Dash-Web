import { UndoManager } from "../util/UndoManager";
import { SelectionManager } from "../util/SelectionManager";
import { CollectionDockingView } from "./collections/CollectionDockingView";
import { MainView } from "./MainView";
import { DragManager } from "../util/DragManager";
import { action } from "mobx";

const modifiers = ["Control", "Meta", "Shift", "Alt"];
type KeyHandler = (keycode: string) => KeyControlInfo;
type KeyControlInfo = {
    preventDefault: boolean,
    stopPropagation: boolean
};

export default class KeyManager {
    public static Handler: KeyManager;
    private mainView: MainView;
    private router = new Map<string, KeyHandler>();

    constructor(mainView: MainView) {
        this.mainView = mainView;
        this.router.set("0000", this.unmodified);
        this.router.set("0100", this.ctrl);
        this.router.set("0010", this.alt);
        this.router.set("1100", this.ctrl_shift);
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
                if (CollectionDockingView.Instance.HasFullScreen()) {
                    CollectionDockingView.Instance.CloseFullScreen();
                } else {
                    SelectionManager.DeselectAll();
                }
                DragManager.AbortDrag();
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
                let toggle = this.mainView.addMenuToggle.current!;
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
                this.mainView.mainFreeform && CollectionDockingView.Instance.AddRightSplit(this.mainView.mainFreeform, undefined);
                break;
            case "arrowleft":
                this.mainView.mainFreeform && CollectionDockingView.Instance.CloseRightSplit(this.mainView.mainFreeform);
                break;
            case "f":
                this.mainView.isSearchVisible = !this.mainView.isSearchVisible;
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