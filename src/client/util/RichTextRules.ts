import { textblockTypeInputRule, smartQuotes, emDash, ellipsis, InputRule } from "prosemirror-inputrules";
import { schema } from "./RichTextSchema";
import { wrappingInputRule } from "./prosemirrorPatches";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { NumCast, Cast } from "../../new_fields/Types";
import { Doc } from "../../new_fields/Doc";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { Docs } from "../documents/Documents";
import { Id } from "../../new_fields/FieldSymbols";

export const inpRules = {
    rules: [
        ...smartQuotes,
        ellipsis,
        emDash,

        // > blockquote
        wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),

        // 1. ordered list
        wrappingInputRule(
            /^1\.\s$/,
            schema.nodes.ordered_list,
            () => {
                return ({ mapStyle: "decimal", bulletStyle: 1 });
            },
            (match: any, node: any) => {
                return node.childCount + node.attrs.order === +match[1];
            },
            (type: any) => ({ type: type, attrs: { mapStyle: "decimal", bulletStyle: 1 } })
        ),
        // a. alphabbetical list
        wrappingInputRule(
            /^a\.\s$/,
            schema.nodes.ordered_list,
            // match => {
            () => {
                return ({ mapStyle: "alpha", bulletStyle: 1 });
                // return ({ order: +match[1] })
            },
            (match: any, node: any) => {
                return node.childCount + node.attrs.order === +match[1];
            },
            (type: any) => ({ type: type, attrs: { mapStyle: "alpha", bulletStyle: 1 } })
        ),

        // * bullet list
        wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),

        // ``` code block
        textblockTypeInputRule(/^```$/, schema.nodes.code_block),

        // # heading
        textblockTypeInputRule(
            new RegExp(/^(#{1,6})\s$/),
            schema.nodes.heading,
            match => {
                return ({ level: match[1].length });
            }
        ),

        new InputRule(
            new RegExp(/^#([0-9]+)\s$/),
            (state, match, start, end) => {
                let size = Number(match[1]);
                let ruleProvider = FormattedTextBox.InputBoxOverlay!.props.ruleProvider;
                let heading = NumCast(FormattedTextBox.InputBoxOverlay!.props.Document.heading);
                if (ruleProvider && heading) {
                    (Cast(FormattedTextBox.InputBoxOverlay!.props.Document, Doc) as Doc).heading = Number(match[1]);
                    return state.tr.deleteRange(start, end);
                }
                return state.tr.deleteRange(start, end).addStoredMark(schema.marks.pFontSize.create({ fontSize: Number(match[1]) }));
            }),
        new InputRule(
            new RegExp(/^\^\^\s$/),
            (state, match, start, end) => {
                let node = (state.doc.resolve(start) as any).nodeAfter;
                let sm = state.storedMarks || undefined;
                let ruleProvider = FormattedTextBox.InputBoxOverlay!.props.ruleProvider;
                let heading = NumCast(FormattedTextBox.InputBoxOverlay!.props.Document.heading);
                if (ruleProvider && heading) {
                    ruleProvider["ruleAlign_" + heading] = "center";
                    return node ? state.tr.deleteRange(start, end).setStoredMarks([...node.marks, ...(sm ? sm : [])]) : state.tr;
                }
                let replaced = node ? state.tr.replaceRangeWith(start, end, schema.nodes.paragraph.create({ align: "center" })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
            }),
        new InputRule(
            new RegExp(/^\[\[\s$/),
            (state, match, start, end) => {
                let node = (state.doc.resolve(start) as any).nodeAfter;
                let sm = state.storedMarks || undefined;
                let ruleProvider = FormattedTextBox.InputBoxOverlay!.props.ruleProvider;
                let heading = NumCast(FormattedTextBox.InputBoxOverlay!.props.Document.heading);
                if (ruleProvider && heading) {
                    ruleProvider["ruleAlign_" + heading] = "left";
                    return node ? state.tr.deleteRange(start, end).setStoredMarks([...node.marks, ...(sm ? sm : [])]) : state.tr;
                }
                let replaced = node ? state.tr.replaceRangeWith(start, end, schema.nodes.paragraph.create({ align: "left" })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
            }),
        new InputRule(
            new RegExp(/^\]\]\s$/),
            (state, match, start, end) => {
                let node = (state.doc.resolve(start) as any).nodeAfter;
                let sm = state.storedMarks || undefined;
                let ruleProvider = FormattedTextBox.InputBoxOverlay!.props.ruleProvider;
                let heading = NumCast(FormattedTextBox.InputBoxOverlay!.props.Document.heading);
                if (ruleProvider && heading) {
                    ruleProvider["ruleAlign_" + heading] = "right";
                    return node ? state.tr.deleteRange(start, end).setStoredMarks([...node.marks, ...(sm ? sm : [])]) : state.tr;
                }
                let replaced = node ? state.tr.replaceRangeWith(start, end, schema.nodes.paragraph.create({ align: "right" })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
            }),
        new InputRule(
            new RegExp(/##\s$/),
            (state, match, start, end) => {
                let node = (state.doc.resolve(start) as any).nodeAfter;
                let sm = state.storedMarks || undefined;
                let target = Docs.Create.TextDocument({ width: 75, height: 35, autoHeight: true, fontSize: 9, title: "inline comment" });
                let replaced = node ? state.tr.insertText("←", start).replaceRangeWith(start + 1, end + 1, schema.nodes.dashDoc.create({
                    width: 75, height: 35,
                    title: "dashDoc", docid: target[Id],
                    float: "right"
                })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 1)));
            }),
        new InputRule(
            new RegExp(/\(\(/),
            (state, match, start, end) => {
                let node = (state.doc.resolve(start) as any).nodeAfter;
                let sm = state.storedMarks || undefined;
                let mark = state.schema.marks.highlight.create();
                let selected = state.tr.setSelection(new TextSelection(state.doc.resolve(start), state.doc.resolve(end))).addMark(start, end, mark);
                let content = selected.selection.content();
                let replaced = node ? selected.replaceRangeWith(start, start,
                    schema.nodes.star.create({ visibility: true, text: content, textslice: content.toJSON() })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end + 1)));
            }),
        new InputRule(
            new RegExp(/\)\)/),
            (state, match, start, end) => {
                let mark = state.schema.marks.highlight.create();
                return state.tr.removeStoredMark(mark);
            }),
        new InputRule(
            new RegExp(/\^f\s$/),
            (state, match, start, end) => {
                let newNode = schema.nodes.footnote.create({});
                let tr = state.tr;
                tr.deleteRange(start, end).replaceSelectionWith(newNode); // replace insertion with a footnote.
                return tr.setSelection(new NodeSelection( // select the footnote node to open its display
                    tr.doc.resolve(  // get the location of the footnote node by subtracting the nodesize of the footnote from the current insertion point anchor (which will be immediately after the footnote node)
                        tr.selection.anchor - tr.selection.$anchor.nodeBefore!.nodeSize)));
            }),
        // let newNode = schema.nodes.footnote.create({});
        // if (dispatch && state.selection.from === state.selection.to) {
        //     return true;
        // }
    ]
};
