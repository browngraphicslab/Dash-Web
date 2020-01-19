import { chainCommands, exitCode, joinDown, joinUp, lift, selectParentNode, setBlockType, splitBlockKeepMarks, toggleMark, wrapIn } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { Schema } from "prosemirror-model";
import { liftListItem, sinkListItem } from "./prosemirrorPatches.js";
import { splitListItem, wrapInList, } from "prosemirror-schema-list";
import { EditorState, Transaction, TextSelection } from "prosemirror-state";
import { TooltipTextMenu } from "./TooltipTextMenu";
import { SelectionManager } from "./SelectionManager";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";

const mac = typeof navigator !== "undefined" ? /Mac/.test(navigator.platform) : false;

export type KeyMap = { [key: string]: any };

export let updateBullets = (tx2: Transaction, schema: Schema, mapStyle?: string) => {
    let fontSize: number | undefined = undefined;
    tx2.doc.descendants((node: any, offset: any, index: any) => {
        if (node.type === schema.nodes.ordered_list || node.type === schema.nodes.list_item) {
            const path = (tx2.doc.resolve(offset) as any).path;
            let depth = Array.from(path).reduce((p: number, c: any) => p + (c.hasOwnProperty("type") && c.type === schema.nodes.ordered_list ? 1 : 0), 0);
            if (node.type === schema.nodes.ordered_list) depth++;
            fontSize = depth === 1 && node.attrs.setFontSize ? Number(node.attrs.setFontSize) : fontSize;
            const fsize = fontSize && node.type === schema.nodes.ordered_list ? Math.max(6, fontSize - (depth - 1) * 4) : undefined;
            tx2.setNodeMarkup(offset, node.type, { ...node.attrs, mapStyle: mapStyle ? mapStyle : node.attrs.mapStyle, bulletStyle: depth, inheritedFontSize: fsize }, node.marks);
        }
    });
    return tx2;
};
export default function buildKeymap<S extends Schema<any>>(schema: S, mapKeys?: KeyMap): KeyMap {
    const keys: { [key: string]: any } = {};

    function bind(key: string, cmd: any) {
        if (mapKeys) {
            const mapped = mapKeys[key];
            if (mapped === false) return;
            if (mapped) key = mapped;
        }
        keys[key] = cmd;
    }

    bind("Mod-z", undo);
    bind("Shift-Mod-z", redo);
    bind("Backspace", undoInputRule);

    !mac && bind("Mod-y", redo);

    bind("Alt-ArrowUp", joinUp);
    bind("Alt-ArrowDown", joinDown);
    bind("Mod-BracketLeft", lift);
    bind("Escape", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        dispatch(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from, state.selection.from)));
        (document.activeElement as any).blur?.();
        SelectionManager.DeselectAll();
    });

    bind("Mod-b", toggleMark(schema.marks.strong));
    bind("Mod-B", toggleMark(schema.marks.strong));

    bind("Mod-e", toggleMark(schema.marks.em));
    bind("Mod-E", toggleMark(schema.marks.em));

    bind("Mod-u", toggleMark(schema.marks.underline));
    bind("Mod-U", toggleMark(schema.marks.underline));

    bind("Mod-`", toggleMark(schema.marks.code));

    bind("Ctrl-.", wrapInList(schema.nodes.bullet_list));

    bind("Ctrl-n", wrapInList(schema.nodes.ordered_list));

    bind("Ctrl->", wrapIn(schema.nodes.blockquote));

    // bind("^", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
    //     let newNode = schema.nodes.footnote.create({});
    //     if (dispatch && state.selection.from === state.selection.to) {
    //         let tr = state.tr;
    //         tr.replaceSelectionWith(newNode); // replace insertion with a footnote.
    //         dispatch(tr.setSelection(new NodeSelection( // select the footnote node to open its display
    //             tr.doc.resolve(  // get the location of the footnote node by subtracting the nodesize of the footnote from the current insertion point anchor (which will be immediately after the footnote node)
    //                 tr.selection.anchor - tr.selection.$anchor.nodeBefore!.nodeSize))));
    //         return true;
    //     }
    //     return false;
    // });


    const cmd = chainCommands(exitCode, (state, dispatch) => {
        if (dispatch) {
            dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
            return true;
        }
        return false;
    });
    bind("Mod-Enter", cmd);
    bind("Shift-Enter", cmd);
    mac && bind("Ctrl-Enter", cmd);


    bind("Shift-Ctrl-0", setBlockType(schema.nodes.paragraph));

    bind("Shift-Ctrl-\\", setBlockType(schema.nodes.code_block));

    for (let i = 1; i <= 6; i++) {
        bind("Shift-Ctrl-" + i, setBlockType(schema.nodes.heading, { level: i }));
    }

    const hr = schema.nodes.horizontal_rule;
    bind("Mod-_", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
        return true;
    });

    bind("Tab", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        const ref = state.selection;
        const range = ref.$from.blockRange(ref.$to);
        const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        if (!sinkListItem(schema.nodes.list_item)(state, (tx2: Transaction) => {
            const tx3 = updateBullets(tx2, schema);
            marks && tx3.ensureMarks([...marks]);
            marks && tx3.setStoredMarks([...marks]);
            dispatch(tx3);
        })) { // couldn't sink into an existing list, so wrap in a new one
            const newstate = state.applyTransaction(state.tr.setSelection(TextSelection.create(state.doc, range!.start, range!.end)));
            if (!wrapInList(schema.nodes.ordered_list)(newstate.state, (tx2: Transaction) => {
                const tx3 = updateBullets(tx2, schema);
                // when promoting to a list, assume list will format things so don't copy the stored marks.
                marks && tx3.ensureMarks([...marks]);
                marks && tx3.setStoredMarks([...marks]);
                dispatch(tx3);
            })) {
                console.log("bullet promote fail");
            }
        }
    });

    bind("Shift-Tab", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());

        if (!liftListItem(schema.nodes.list_item)(state.tr, (tx2: Transaction) => {
            const tx3 = updateBullets(tx2, schema);
            marks && tx3.ensureMarks([...marks]);
            marks && tx3.setStoredMarks([...marks]);
            dispatch(tx3);
        })) {
            console.log("bullet demote fail");
        }
    });

    const splitMetadata = (marks: any, tx: Transaction) => {
        marks && tx.ensureMarks(marks.filter((val: any) => val.type !== schema.marks.metadata && val.type !== schema.marks.metadataKey && val.type !== schema.marks.metadataVal));
        marks && tx.setStoredMarks(marks.filter((val: any) => val.type !== schema.marks.metadata && val.type !== schema.marks.metadataKey && val.type !== schema.marks.metadataVal));
        return tx;
    };
    bind("Enter", (state: EditorState<S>, dispatch: (tx: Transaction<Schema<any, any>>) => void) => {
        const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        if (!splitListItem(schema.nodes.list_item)(state, dispatch)) {
            if (!splitBlockKeepMarks(state, (tx3: Transaction) => {
                splitMetadata(marks, tx3);
                if (!liftListItem(schema.nodes.list_item)(tx3, dispatch as ((tx: Transaction<Schema<any, any>>) => void))) {
                    dispatch(tx3);
                }
            })) {
                return false;
            }
        }
        return true;
    });
    bind("Space", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        dispatch(splitMetadata(marks, state.tr));
        return false;
    });
    bind(":", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        const range = state.selection.$from.blockRange(state.selection.$to, (node: any) => {
            return !node.marks || !node.marks.find((m: any) => m.type === schema.marks.metadata);
        });
        const path = (state.doc.resolve(state.selection.from - 1) as any).path;
        const spaceSeparator = path[path.length - 3].childCount > 1 ? 0 : -1;
        const textsel = TextSelection.create(state.doc, range!.end - path[path.length - 3].lastChild.nodeSize + spaceSeparator, range!.end);
        const text = range ? state.doc.textBetween(textsel.from, textsel.to) : "";
        let whitespace = text.length - 1;
        for (; whitespace >= 0 && text[whitespace] !== " "; whitespace--) { }
        if (text.endsWith(":")) {
            dispatch(state.tr.addMark(textsel.from + whitespace + 1, textsel.to, schema.marks.metadata.create() as any).
                addMark(textsel.from + whitespace + 1, textsel.to - 2, schema.marks.metadataKey.create() as any));
        }
        return false;
    });


    return keys;
}
