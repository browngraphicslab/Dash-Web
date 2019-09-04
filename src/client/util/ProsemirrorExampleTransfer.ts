import { chainCommands, exitCode, joinDown, joinUp, lift, selectParentNode, setBlockType, splitBlockKeepMarks, toggleMark, wrapIn } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { Schema } from "prosemirror-model";
import { liftListItem, } from "./prosemirrorPatches.js";
import { splitListItem, wrapInList, sinkListItem } from "prosemirror-schema-list";
import { EditorState, Transaction, TextSelection, NodeSelection } from "prosemirror-state";
import { TooltipTextMenu } from "./TooltipTextMenu";

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

    !mac && bind("Mod-y", redo);

    bind("Alt-ArrowUp", joinUp);
    bind("Alt-ArrowDown", joinDown);
    bind("Mod-BracketLeft", lift);
    bind("Escape", selectParentNode);

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

    bind("^", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        let newNode = schema.nodes.footnote.create({});
        if (dispatch && state.selection.from === state.selection.to) {
            let tr = state.tr;
            tr.replaceSelectionWith(newNode); // replace insertion with a footnote.
            dispatch(tr.setSelection(new NodeSelection( // select the footnote node to open its display
                tr.doc.resolve(  // get the location of the footnote node by subtracting the nodesize of the footnote from the current insertion point anchor (which will be immediately after the footnote node)
                    tr.selection.anchor - tr.selection.$anchor.nodeBefore!.nodeSize))));
            return true;
        }
        return false;
    })


    let cmd = chainCommands(exitCode, (state, dispatch) => {
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

    let hr = schema.nodes.horizontal_rule;
    bind("Mod-_", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
        return true;
    });

    bind("Mod-s", TooltipTextMenu.insertStar);

    let updateOrderedList = (start: number, rangeStart: any, delta: number, tx2: Transaction, forward: boolean) => {
        let bs = rangeStart.attrs.bulletStyle;
        bs + delta > 0 && tx2.setNodeMarkup(start, rangeStart.type, { mapStyle: rangeStart.attrs.mapStyle, bulletStyle: rangeStart.attrs.bulletStyle + delta }, rangeStart.marks);

        let brk = false;
        rangeStart.descendants((node: any, offset: any, index: any) => {
            if (node.type === schema.nodes.ordered_list || node.type === schema.nodes.list_item) {
                if (!brk && (bs !== node.attrs.bulletStyle || delta > 0 || (forward && bs > 1))) {
                    tx2.setNodeMarkup(start + offset + 1, node.type, { mapStyle: node.attrs.mapStyle, bulletStyle: node.attrs.bulletStyle + delta }, node.marks);
                } else {
                    brk = true;
                }
            }
        });
    }

    let updateBullets = (tx2: Transaction, refStart: number, delta: number) => {
        let i = refStart;
        for (let i = refStart; i >= 0; i--) {
            let testPos = tx2.doc.nodeAt(i);
            if (!testPos) {
                for (let i = refStart + 1; i <= tx2.doc.nodeSize; i++) {
                    try {
                        let testPos = tx2.doc.nodeAt(i);
                        if (testPos && testPos.type === schema.nodes.ordered_list) {
                            updateOrderedList(i, testPos, delta, tx2, true);
                            break;
                        }
                    } catch (e) {
                        break;
                    }
                }
                break;
            }
            if ((testPos.type === schema.nodes.list_item || testPos.type === schema.nodes.ordered_list)) {
                let start = i;
                let preve = i > 0 && tx2.doc.nodeAt(start - 1);
                if (preve && preve.type === schema.nodes.ordered_list) {
                    start = start - 1;
                }
                let rangeStart = tx2.doc.nodeAt(start);
                if (rangeStart) {
                    updateOrderedList(start, rangeStart, delta, tx2, false);
                }
                break;
            }
        }
    }


    bind("Tab", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        var ref = state.selection;
        var range = ref.$from.blockRange(ref.$to);
        var marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        if (!sinkListItem(schema.nodes.list_item)(state, (tx2: Transaction) => {
            var range = state.selection.$from.blockRange(state.selection.$to);
            updateBullets(tx2, range!.start - 1, 1);
            marks && tx2.ensureMarks([...marks]);
            marks && tx2.setStoredMarks([...marks]);
            dispatch(tx2);
        })) { // couldn't sink into an existing list, so wrap in a new one
            let sxf = state.tr.setSelection(TextSelection.create(state.doc, range!.start, range!.end));
            let newstate = state.applyTransaction(sxf);
            if (!wrapInList(schema.nodes.ordered_list)(newstate.state, (tx2: Transaction) => {
                updateBullets(tx2, range!.start, 1);
                // when promoting to a list, assume list will format things so don't copy the stored marks.
                marks && tx2.ensureMarks([...marks]);
                marks && tx2.setStoredMarks([...marks]);
                dispatch(tx2);
            })) {
                console.log("bullet promote fail");
            }
        }
    });

    bind("Shift-Tab", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        var range = state.selection.$from.blockRange(state.selection.$to);
        var marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());

        let tr = state.tr;

        if (!liftListItem(schema.nodes.list_item)(tr, (tx2: Transaction) => {
            var range = tx2.selection.$from.blockRange(tx2.selection.$to);
            updateBullets(tx2, range!.start, -1);
            marks && tx2.ensureMarks([...marks]);
            marks && tx2.setStoredMarks([...marks]);
            dispatch(tx2);
        })) {
            console.log("bullet demote fail");
        }
    });

    bind("Enter", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        var marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        if (!splitListItem(schema.nodes.list_item)(state, (tx3: Transaction) => {
            // marks && tx3.ensureMarks(marks);
            // marks && tx3.setStoredMarks(marks);
            dispatch(tx3);
        })) {
            if (!splitBlockKeepMarks(state, (tx3: Transaction) => {
                marks && tx3.ensureMarks(marks);
                marks && tx3.setStoredMarks(marks);
                if (!liftListItem(schema.nodes.list_item)(tx3, dispatch as ((tx: Transaction<Schema<any, any>>) => void))) {
                    dispatch(tx3);
                }
            })) {
                return false;
            }
        }
        return true;
    });


    return keys;
}
