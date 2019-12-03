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
                const size = Number(match[1]);
                const ruleProvider = FormattedTextBox.InputBoxOverlay!.props.ruleProvider;
                const heading = NumCast(FormattedTextBox.InputBoxOverlay!.props.Document.heading);
                if (ruleProvider && heading) {
                    (Cast(FormattedTextBox.InputBoxOverlay!.props.Document, Doc) as Doc).heading = size;
                    return state.tr.deleteRange(start, end);
                }
                return state.tr.deleteRange(start, end).addStoredMark(schema.marks.pFontSize.create({ fontSize: size }));
            }),
        new InputRule(
            new RegExp(/t/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from) return null;
                const node = (state.doc.resolve(start) as any).nodeAfter;
                return node ? state.tr.addMark(start, end, schema.marks.user_tag.create({ userid: Doc.CurrentUserEmail, tag: "todo", modified: Math.round(Date.now() / 1000 / 60) })) : state.tr;
            }),
        new InputRule(
            new RegExp(/i/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from) return null;
                const node = (state.doc.resolve(start) as any).nodeAfter;
                return node ? state.tr.addMark(start, end, schema.marks.user_tag.create({ userid: Doc.CurrentUserEmail, tag: "ignore", modified: Math.round(Date.now() / 1000 / 60) })) : state.tr;
            }),
        new InputRule(
            new RegExp(/\!/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from) return null;
                const node = (state.doc.resolve(start) as any).nodeAfter;
                return node ? state.tr.addMark(start, end, schema.marks.user_tag.create({ userid: Doc.CurrentUserEmail, tag: "important", modified: Math.round(Date.now() / 1000 / 60) })) : state.tr;
            }),
        new InputRule(
            new RegExp(/\x/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from) return null;
                const node = (state.doc.resolve(start) as any).nodeAfter;
                return node ? state.tr.addMark(start, end, schema.marks.user_tag.create({ userid: Doc.CurrentUserEmail, tag: "disagree", modified: Math.round(Date.now() / 1000 / 60) })) : state.tr;
            }),
        new InputRule(
            new RegExp(/^\^\^\s$/),
            (state, match, start, end) => {
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const sm = state.storedMarks || undefined;
                const ruleProvider = FormattedTextBox.InputBoxOverlay!.props.ruleProvider;
                const heading = NumCast(FormattedTextBox.InputBoxOverlay!.props.Document.heading);
                if (ruleProvider && heading) {
                    ruleProvider["ruleAlign_" + heading] = "center";
                    return node ? state.tr.deleteRange(start, end).setStoredMarks([...node.marks, ...(sm ? sm : [])]) : state.tr;
                }
                const replaced = node ? state.tr.replaceRangeWith(start, end, schema.nodes.paragraph.create({ align: "center" })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
            }),
        new InputRule(
            new RegExp(/^\[\[\s$/),
            (state, match, start, end) => {
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const sm = state.storedMarks || undefined;
                const ruleProvider = FormattedTextBox.InputBoxOverlay!.props.ruleProvider;
                const heading = NumCast(FormattedTextBox.InputBoxOverlay!.props.Document.heading);
                if (ruleProvider && heading) {
                    ruleProvider["ruleAlign_" + heading] = "left";
                    return node ? state.tr.deleteRange(start, end).setStoredMarks([...node.marks, ...(sm ? sm : [])]) : state.tr;
                }
                const replaced = node ? state.tr.replaceRangeWith(start, end, schema.nodes.paragraph.create({ align: "left" })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
            }),
        new InputRule(
            new RegExp(/^\]\]\s$/),
            (state, match, start, end) => {
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const sm = state.storedMarks || undefined;
                const ruleProvider = FormattedTextBox.InputBoxOverlay!.props.ruleProvider;
                const heading = NumCast(FormattedTextBox.InputBoxOverlay!.props.Document.heading);
                if (ruleProvider && heading) {
                    ruleProvider["ruleAlign_" + heading] = "right";
                    return node ? state.tr.deleteRange(start, end).setStoredMarks([...node.marks, ...(sm ? sm : [])]) : state.tr;
                }
                const replaced = node ? state.tr.replaceRangeWith(start, end, schema.nodes.paragraph.create({ align: "right" })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
            }),
        new InputRule(
            new RegExp(/##\s$/),
            (state, match, start, end) => {
                const target = Docs.Create.TextDocument({ width: 75, height: 35, backgroundColor: "yellow", autoHeight: true, fontSize: 9, title: "inline comment" });
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const newNode = schema.nodes.dashComment.create({ docid: target[Id] });
                const dashDoc = schema.nodes.dashDoc.create({ width: 75, height: 35, title: "dashDoc", docid: target[Id], float: "right" });
                const sm = state.storedMarks || undefined;
                const replaced = node ? state.tr.insert(start, newNode).replaceRangeWith(start + 1, end + 1, dashDoc).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced;//.setSelection(new NodeSelection(replaced.doc.resolve(end)));
            }),
        new InputRule(
            new RegExp(/\(\(/),
            (state, match, start, end) => {
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const sm = state.storedMarks || undefined;
                const mark = state.schema.marks.highlight.create();
                const selected = state.tr.setSelection(new TextSelection(state.doc.resolve(start), state.doc.resolve(end))).addMark(start, end, mark);
                const content = selected.selection.content();
                const replaced = node ? selected.replaceRangeWith(start, start,
                    schema.nodes.star.create({ visibility: true, text: content, textslice: content.toJSON() })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end + 1)));
            }),
        new InputRule(
            new RegExp(/\)\)/),
            (state, match, start, end) => {
                const mark = state.schema.marks.highlight.create();
                return state.tr.removeStoredMark(mark);
            }),
        new InputRule(
            new RegExp(/\^f\s$/),
            (state, match, start, end) => {
                const newNode = schema.nodes.footnote.create({});
                const tr = state.tr;
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
