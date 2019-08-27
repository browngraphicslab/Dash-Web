import { chainCommands, exitCode, joinDown, joinUp, lift, selectParentNode, setBlockType, splitBlockKeepMarks, toggleMark, wrapIn } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { Schema } from "prosemirror-model";
import { liftListItem, splitListItem, wrapInList, sinkListItem } from "prosemirror-schema-list";
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


    let levelMark = (depth: number) => {
        let p10 = schema.marks.pFontSize.create({ fontSize: 10 });
        let p14 = schema.marks.pFontSize.create({ fontSize: 14 });
        let p18 = schema.marks.pFontSize.create({ fontSize: 18 });
        let p24 = schema.marks.pFontSize.create({ fontSize: 24 });
        return depth == 0 ? p24 : depth == 2 ? p18 : depth == 4 ? p14 : p10;
    }
    let bulletFunc = (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        var ref = state.selection;
        var range = ref.$from.blockRange(ref.$to);
        var marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        let depth = range && range.depth ? range.depth : 0;
        let nodeType = depth == 2 ? schema.nodes.cap_alphabet_list : depth == 4 ? schema.nodes.roman_list : depth == 6 ? schema.nodes.alphabet_list : schema.nodes.ordered_list;
        let nodeTypeMark = schema.marks.mbulletType.create({ bulletType: depth == 2 ? "upper-alpha" : depth == 4 ? "lower-roman" : depth == 6 ? "lower-alpha" : "decimal" });
        let created = levelMark(depth);
        if (!sinkListItem(schema.nodes.list_item)(state, (tx2: Transaction) => {
            const resolvedPos = tx2.doc.resolve(range!.start);

            let path = (resolvedPos as any).path as any;
            for (let i = path.length - 1; i > 0; i--) {
                if (path[i].type === schema.nodes.ordered_list) {
                    path[i].attrs.bulletStyle = (nodeTypeMark as any).attrs.bulletType;
                    break;
                }
            }
            let ns = new NodeSelection(resolvedPos);
            let tx3 = tx2.removeMark(ns.from - 1, ns.to, created).addMark(ns.from - 1, ns.to, created).setSelection(TextSelection.create(tx2.doc, ns.to - (depth == 0 ? 3 : 1)));
            marks && tx3.ensureMarks([...marks.filter(m => m.type !== schema.marks.pFontSize), created]);
            marks && tx3.setStoredMarks([...marks.filter(m => m.type !== schema.marks.pFontSize), created]);
            dispatch(tx3);
        })) {
            let sxf = state.tr.setSelection(TextSelection.create(state.doc, range!.start, range!.end));
            let newstate = state.applyTransaction(sxf);
            if (!wrapInList(nodeType)(newstate.state, (tx2: Transaction) => {
                const resolvedPos = tx2.doc.resolve(range!.start);
                let ns = new TextSelection(resolvedPos, tx2.doc.resolve(range!.end + 1)); // new NodeSelection(resolvedPos);
                let tx3 = tx2.setSelection(ns).removeMark(ns.from, ns.to, created).addMark(ns.from, ns.to, created).setSelection(TextSelection.create(tx2.doc, ns.to));
                let tx4 = depth > 0 ? tx3.insertText(" ").setSelection(TextSelection.create(tx2.doc, ns.to - 2, ns.to + 2)).deleteSelection() : tx3;
                marks && tx4.ensureMarks([...marks.filter(m => m.type !== schema.marks.pFontSize), created]);
                marks && tx4.setStoredMarks([...marks.filter(m => m.type !== schema.marks.pFontSize), created]);

                dispatch(tx4);
            })) {
                console.log("bullet fail");
            }
        }
    }
    bind("Tab", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => bulletFunc(state, dispatch));

    bind("Shift-Tab", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        var ref = state.selection;
        var range = ref.$from.blockRange(ref.$to);
        var marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        let depth = range && range.depth > 3 ? range.depth - 4 : 0;
        let nodeTypeMark = schema.marks.mbulletType.create({ bulletType: depth == 2 ? "upper-alpha" : depth == 4 ? "lower-roman" : depth == 6 ? "lower-alpha" : "decimal" });
        let created = levelMark(range && range.depth ? range.depth - 4 : 0);
        liftListItem(schema.nodes.list_item)(state, (tx2: Transaction) => {
            try {
                const resolvedPos = tx2.doc.resolve(Math.round((range!.start + range!.end) / 2));
                let nodeIndex = resolvedPos.pos - (resolvedPos.nodeBefore && resolvedPos.nodeBefore.type.name === "text" ? resolvedPos.nodeBefore!.nodeSize : 0);

                let path = (resolvedPos as any).path as any;
                for (let i = path.length - 1; i > 0; i--) {
                    if (path[i].type === schema.nodes.ordered_list) {
                        path[i].attrs.bulletStyle = (nodeTypeMark as any).attrs.bulletType;
                        break;
                    }
                }

                let ns = new NodeSelection(tx2.doc.resolve(nodeIndex));
                if (resolvedPos.nodeAfter && resolvedPos.nodeAfter.type.name === "list_item")
                    ns = new NodeSelection(tx2.doc.resolve(nodeIndex + 1));
                let tx3 = tx2.setSelection(ns).removeMark(ns.from - 1, ns.to, created).addMark(ns.from - 1, ns.to, created).setSelection(TextSelection.create(tx2.doc, ns.to));

                marks && tx3.ensureMarks([...marks.filter(m => m.type !== schema.marks.pFontSize), created]);
                marks && tx3.setStoredMarks([...marks.filter(m => m.type !== schema.marks.pFontSize), created]);
                dispatch(tx3);
            } catch (e) {
                dispatch(tx2);
            }
        });
    });

    bind("Enter", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        var marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        if (!splitListItem(schema.nodes.list_item)(state, (tx3: Transaction) => {
            marks && tx3.ensureMarks(marks);
            marks && tx3.setStoredMarks(marks);
            dispatch(tx3);
        })) {
            if (!splitBlockKeepMarks(state, (tx3: Transaction) => {
                marks && tx3.ensureMarks(marks);
                marks && tx3.setStoredMarks(marks);
                if (!liftListItem(schema.nodes.list_item)(state, (tx4: Transaction) => dispatch(tx4))) {
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
