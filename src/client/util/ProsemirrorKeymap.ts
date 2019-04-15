import { Schema } from "prosemirror-model";
import {
    wrapIn, setBlockType, chainCommands, toggleMark, exitCode,
    joinUp, joinDown, lift, selectParentNode
} from "prosemirror-commands";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { undo, redo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { Transaction, EditorState } from "prosemirror-state";

const mac = typeof navigator !== "undefined" ? /Mac/.test(navigator.platform) : false;

export type KeyMap = { [key: string]: any };

export default function buildKeymap<S extends Schema<any>>(schema: S, mapKeys?: KeyMap): KeyMap {
    let keys: { [key: string]: any } = {}, type;

    function bind(key: string, cmd: any) {
        if (mapKeys) {
            let mapped = mapKeys[key];
            if (mapped === false) return;
            if (mapped) key = mapped;
        }
        keys[key] = cmd;
    }

    bind("Mod-z", undo);
    bind("Shift-Mod-z", redo);
    bind("Backspace", undoInputRule);

    if (!mac) {
        bind("Mod-y", redo);
    }

    bind("Alt-ArrowUp", joinUp);
    bind("Alt-ArrowDown", joinDown);
    bind("Mod-BracketLeft", lift);
    bind("Escape", selectParentNode);

    if (type = schema.marks.strong) {
        bind("Mod-b", toggleMark(type));
        bind("Mod-B", toggleMark(type));
    }
    if (type = schema.marks.em) {
        bind("Mod-i", toggleMark(type));
        bind("Mod-I", toggleMark(type));
    }
    if (type = schema.marks.code) {
        bind("Mod-`", toggleMark(type));
    }

    if (type = schema.nodes.bullet_list) {
        bind("Ctrl-b", wrapInList(type));
    }
    if (type = schema.nodes.ordered_list) {
        bind("Ctrl-n", wrapInList(type));
    }
    if (type = schema.nodes.blockquote) {
        bind("Ctrl->", wrapIn(type));
    }
    if (type = schema.nodes.hard_break) {
        let br = type, cmd = chainCommands(exitCode, (state, dispatch) => {
            if (dispatch) {
                dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
                return true;
            }
            return false;
        });
        bind("Mod-Enter", cmd);
        bind("Shift-Enter", cmd);
        if (mac) {
            bind("Ctrl-Enter", cmd);
        }
    }
    if (type = schema.nodes.list_item) {
        bind("Enter", splitListItem(type));
        bind("Shift-Tab", liftListItem(type));
        bind("Tab", sinkListItem(type));
    }
    if (type = schema.nodes.paragraph) {
        bind("Shift-Ctrl-0", setBlockType(type));
    }
    if (type = schema.nodes.code_block) {
        bind("Shift-Ctrl-\\", setBlockType(type));
    }
    if (type = schema.nodes.heading) {
        for (let i = 1; i <= 6; i++) {
            bind("Shift-Ctrl-" + i, setBlockType(type, { level: i }));
        }
    }
    if (type = schema.nodes.horizontal_rule) {
        let hr = type;
        bind("Mod-_", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
            dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
            return true;
        });
    }

    return keys;
}