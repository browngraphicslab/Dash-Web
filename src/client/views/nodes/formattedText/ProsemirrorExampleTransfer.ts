import { chainCommands, exitCode, joinDown, joinUp, lift, deleteSelection, joinBackward, selectNodeBackward, setBlockType, splitBlockKeepMarks, toggleMark, wrapIn, newlineInCode } from "prosemirror-commands";
import { liftTarget } from "prosemirror-transform";
import { redo, undo } from "prosemirror-history";
import { Schema } from "prosemirror-model";
import { liftListItem, sinkListItem } from "./prosemirrorPatches.js";
import { splitListItem, wrapInList, } from "prosemirror-schema-list";
import { EditorState, Transaction, TextSelection } from "prosemirror-state";
import { SelectionManager } from "../../../util/SelectionManager";
import { NumCast, BoolCast, Cast, StrCast } from "../../../../fields/Types";
import { Doc, DataSym } from "../../../../fields/Doc";
import { FormattedTextBox } from "./FormattedTextBox";
import { Id } from "../../../../fields/FieldSymbols";
import { Docs } from "../../../documents/Documents";
import { Utils } from "../../../../Utils";

const mac = typeof navigator !== "undefined" ? /Mac/.test(navigator.platform) : false;

export type KeyMap = { [key: string]: any };

export let updateBullets = (tx2: Transaction, schema: Schema, assignedMapStyle?: string, from?: number, to?: number) => {
    let mapStyle = assignedMapStyle;
    tx2.doc.descendants((node: any, offset: any, index: any) => {
        if ((from === undefined || to === undefined || (from <= offset + node.nodeSize && to >= offset)) && (node.type === schema.nodes.ordered_list || node.type === schema.nodes.list_item)) {
            const path = (tx2.doc.resolve(offset) as any).path;
            let depth = Array.from(path).reduce((p: number, c: any) => p + (c.hasOwnProperty("type") && c.type === schema.nodes.ordered_list ? 1 : 0), 0);
            if (node.type === schema.nodes.ordered_list) {
                if (depth === 0 && !assignedMapStyle) mapStyle = node.attrs.mapStyle;
                depth++;
            }
            tx2.setNodeMarkup(offset, node.type, { ...node.attrs, mapStyle, bulletStyle: depth, }, node.marks);
        }
    });
    return tx2;
};

export function buildKeymap<S extends Schema<any>>(schema: S, props: any, mapKeys?: KeyMap): KeyMap {
    const keys: { [key: string]: any } = {};

    function bind(key: string, cmd: any) {
        if (mapKeys) {
            const mapped = mapKeys[key];
            if (mapped === false) return;
            if (mapped) key = mapped;
        }
        keys[key] = cmd;
    }

    //History commands
    bind("Mod-z", undo);
    bind("Shift-Mod-z", redo);
    !mac && bind("Mod-y", redo);

    //Commands to modify Mark
    bind("Mod-b", toggleMark(schema.marks.strong));
    bind("Mod-B", toggleMark(schema.marks.strong));

    bind("Mod-e", toggleMark(schema.marks.em));
    bind("Mod-E", toggleMark(schema.marks.em));

    bind("Mod-*", toggleMark(schema.marks.code));

    bind("Mod-u", toggleMark(schema.marks.underline));
    bind("Mod-U", toggleMark(schema.marks.underline));

    //Commands for lists
    bind("Ctrl-i", wrapInList(schema.nodes.ordered_list));

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

    //Command to create a new Tab with a PDF of all the command shortcuts
    bind("Mod-/", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        const newDoc = Docs.Create.PdfDocument(Utils.prepend("/assets/cheat-sheet.pdf"), { _fitWidth: true, _width: 300, _height: 300 });
        props.addDocTab(newDoc, "onRight");
    });

    //Commands to modify BlockType
    bind("Ctrl->", wrapIn(schema.nodes.blockquote));
    bind("Alt-\\", setBlockType(schema.nodes.paragraph));
    bind("Shift-Ctrl-\\", setBlockType(schema.nodes.code_block));

    for (let i = 1; i <= 6; i++) {
        bind("Shift-Ctrl-" + i, setBlockType(schema.nodes.heading, { level: i }));
    }

    //Command to create a horizontal break line
    const hr = schema.nodes.horizontal_rule;
    bind("Mod-_", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
        return true;
    });

    //Command to unselect all
    bind("Escape", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        dispatch(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from, state.selection.from)));
        (document.activeElement as any).blur?.();
        SelectionManager.DeselectAll();
    });

    const splitMetadata = (marks: any, tx: Transaction) => {
        marks && tx.ensureMarks(marks.filter((val: any) => val.type !== schema.marks.metadata && val.type !== schema.marks.metadataKey && val.type !== schema.marks.metadataVal));
        marks && tx.setStoredMarks(marks.filter((val: any) => val.type !== schema.marks.metadata && val.type !== schema.marks.metadataKey && val.type !== schema.marks.metadataVal));
        return tx;
    };

    const addTextOnRight = (force: boolean) => {
        const layoutDoc = props.Document;
        const originalDoc = layoutDoc.rootDocument || layoutDoc;
        if (force || props.Document._singleLine) {
            const layoutKey = StrCast(originalDoc.layoutKey);
            const newDoc = Doc.MakeCopy(originalDoc, true);
            newDoc[DataSym][Doc.LayoutFieldKey(newDoc)] = undefined;
            newDoc.y = NumCast(originalDoc.y) + NumCast(originalDoc._height) + 10;
            if (layoutKey !== "layout" && originalDoc[layoutKey] instanceof Doc) {
                newDoc[layoutKey] = originalDoc[layoutKey];
            }
            Doc.GetProto(newDoc).text = undefined;
            FormattedTextBox.SelectOnLoad = newDoc[Id];
            props.addDocument(newDoc);
            return true;
        }
        return false;
    };

    //Command to create a text document to the right of the selected textbox
    bind("Alt-Enter", (state: EditorState<S>, dispatch: (tx: Transaction<Schema<any, any>>) => void) => {
        return addTextOnRight(true);
    });

    //Command to create a text document to the bottom of the selected textbox
    bind("Ctrl-Enter", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        const layoutDoc = props.Document;
        const originalDoc = layoutDoc.rootDocument || layoutDoc;
        if (originalDoc instanceof Doc) {
            const layoutKey = StrCast(originalDoc.layoutKey);
            const newDoc = Doc.MakeCopy(originalDoc, true);
            newDoc[DataSym][Doc.LayoutFieldKey(newDoc)] = undefined;
            newDoc.x = NumCast(originalDoc.x) + NumCast(originalDoc._width) + 10;
            if (layoutKey !== "layout" && originalDoc[layoutKey] instanceof Doc) {
                newDoc[layoutKey] = originalDoc[layoutKey];
            }
            Doc.GetProto(newDoc).text = undefined;
            FormattedTextBox.SelectOnLoad = newDoc[Id];
            props.addDocument(newDoc);
        }
    });

    // backspace = chainCommands(deleteSelection, joinBackward, selectNodeBackward);
    bind("Backspace", (state: EditorState<S>, dispatch: (tx: Transaction<Schema<any, any>>) => void) => {
        if (!deleteSelection(state, (tx: Transaction<Schema<any, any>>) => {
            dispatch(updateBullets(tx, schema));
        })) {
            if (!joinBackward(state, (tx: Transaction<Schema<any, any>>) => {
                dispatch(updateBullets(tx, schema));
            })) {
                if (!selectNodeBackward(state, (tx: Transaction<Schema<any, any>>) => {
                    dispatch(updateBullets(tx, schema));
                })) {
                    return false;
                }
            }
        }
        return true;
    });

    //newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock
    //command to break line
    bind("Enter", (state: EditorState<S>, dispatch: (tx: Transaction<Schema<any, any>>) => void) => {
        if (addTextOnRight(false)) return true;
        const trange = state.selection.$from.blockRange(state.selection.$to);
        const path = (state.selection.$from as any).path;
        const depth = trange ? liftTarget(trange) : undefined;
        const split = path.length > 5 && !path[path.length - 3].textContent && path[path.length - 6].type !== schema.nodes.list_item;
        if (split && trange && depth !== undefined && depth !== null) {
            dispatch(state.tr.lift(trange, depth));
            return true;
        }

        const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        const cr = state.selection.$from.node().textContent.endsWith("\n");
        if (cr || !newlineInCode(state, dispatch)) {
            if (!splitListItem(schema.nodes.list_item)(state, (tx2: Transaction) => {
                const tx3 = updateBullets(tx2, schema);
                marks && tx3.ensureMarks([...marks]);
                marks && tx3.setStoredMarks([...marks]);
                dispatch(tx3);
            })) {
                const fromattrs = state.selection.$from.node().attrs;
                if (!splitBlockKeepMarks(state, (tx3: Transaction) => {
                    const tonode = tx3.selection.$to.node();
                    const tx4 = tx3.setNodeMarkup(tx3.selection.to - 1, tonode.type, fromattrs, tonode.marks);
                    splitMetadata(marks, tx4);
                    if (!liftListItem(schema.nodes.list_item)(tx4, dispatch as ((tx: Transaction<Schema<any, any>>) => void))) {
                        dispatch(tx4);
                    }
                })) {
                    return false;
                }
            }
        }
        return true;
    });

    //Command to create a blank space
    bind("Space", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        dispatch(splitMetadata(marks, state.tr));
        return false;
    });

    bind("Alt-ArrowUp", joinUp);
    bind("Alt-ArrowDown", joinDown);
    bind("Mod-BracketLeft", lift);

    const cmd = chainCommands(exitCode, (state, dispatch) => {
        if (dispatch) {
            dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
            return true;
        }
        return false;
    });

    // mac && bind("Ctrl-Enter", cmd);
    // bind("Mod-Enter", cmd);
    bind("Shift-Enter", cmd);


    bind(":", (state: EditorState<S>, dispatch: (tx: Transaction<S>) => void) => {
        const range = state.selection.$from.blockRange(state.selection.$to, (node: any) => {
            return !node.marks || !node.marks.find((m: any) => m.type === schema.marks.metadata);
        });

        const path = (state.doc.resolve(state.selection.from - 1) as any).path;

        const spaceSeparator = path[path.length - 3].childCount > 1 ? 0 : -1;

        const anchor = range!.end - path[path.length - 3].lastChild.nodeSize + spaceSeparator;

        if (anchor >= 0) {

            const textsel = TextSelection.create(state.doc, anchor, range!.end);

            const text = range ? state.doc.textBetween(textsel.from, textsel.to) : "";

            let whitespace = text.length - 1;

            for (; whitespace >= 0 && text[whitespace] !== " "; whitespace--) { }
            if (text.endsWith(":")) {
                dispatch(state.tr.addMark(textsel.from + whitespace + 1, textsel.to, schema.marks.metadata.create() as any).
                    addMark(textsel.from + whitespace + 1, textsel.to - 2, schema.marks.metadataKey.create() as any));
            }
        }

        return false;
    });

    return keys;
}

