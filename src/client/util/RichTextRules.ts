import { textblockTypeInputRule, smartQuotes, emDash, ellipsis, InputRule } from "prosemirror-inputrules";
import { schema } from "./RichTextSchema";
import { wrappingInputRule } from "./prosemirrorPatches";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { NumCast, Cast } from "../../new_fields/Types";
import { Doc } from "../../new_fields/Doc";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { TooltipTextMenuManager } from "../util/TooltipTextMenu";
import { Docs, DocUtils } from "../documents/Documents";
import { Id } from "../../new_fields/FieldSymbols";
import { DocServer } from "../DocServer";
import { returnFalse, Utils } from "../../Utils";

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
                const ruleProvider = FormattedTextBox.FocusedBox!.props.ruleProvider;
                const heading = NumCast(FormattedTextBox.FocusedBox!.props.Document.heading);
                if (ruleProvider && heading) {
                    (Cast(FormattedTextBox.FocusedBox!.props.Document, Doc) as Doc).heading = size;
                    return state.tr.deleteRange(start, end);
                }
                return state.tr.deleteRange(start, end).addStoredMark(schema.marks.pFontSize.create({ fontSize: size }));
            }),
        new InputRule(
            new RegExp(/%[a-z]+$/),
            (state, match, start, end) => {
                const color = match[0].substring(1, match[0].length);
                let marks = TooltipTextMenuManager.Instance._brushMap.get(color);
                if (marks) {
                    let tr = state.tr.deleteRange(start, end);
                    return marks ? Array.from(marks).reduce((tr, m) => tr.addStoredMark(m), tr) : tr;
                }
                let isValidColor = (strColor: string) => {
                    var s = new Option().style;
                    s.color = strColor;
                    return s.color == strColor.toLowerCase(); // 'false' if color wasn't assigned
                }
                if (isValidColor(color)) {
                    return state.tr.deleteRange(start, end).addStoredMark(schema.marks.pFontColor.create({ color: color }));
                }
                return null;
            }),
        new InputRule(
            new RegExp(/%%$/),
            (state, match, start, end) => {
                let tr = state.tr.deleteRange(start, end);
                let marks = state.tr.selection.$anchor.nodeBefore?.marks;
                return marks ? Array.from(marks).filter(m => m !== state.schema.marks.user_mark).reduce((tr, m) => tr.removeStoredMark(m), tr) : tr;
            }),
        new InputRule(
            new RegExp(/t$/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from && !(state as any).EnteringStyle) return null;
                const node = (state.doc.resolve(start) as any).nodeAfter;
                if (node?.marks.findIndex((m: any) => m.type === schema.marks.user_tag) !== -1) return state.tr.removeMark(start, end, schema.marks.user_tag);
                return node ? state.tr.addMark(start, end, schema.marks.user_tag.create({ userid: Doc.CurrentUserEmail, tag: "todo", modified: Math.round(Date.now() / 1000 / 60) })) : state.tr;
            }),
        new InputRule(
            new RegExp(/i$/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from && !(state as any).EnteringStyle) return null;
                const node = (state.doc.resolve(start) as any).nodeAfter;
                if (node?.marks.findIndex((m: any) => m.type === schema.marks.user_tag) !== -1) return state.tr.removeMark(start, end, schema.marks.user_tag);
                return node ? state.tr.addMark(start, end, schema.marks.user_tag.create({ userid: Doc.CurrentUserEmail, tag: "ignore", modified: Math.round(Date.now() / 1000 / 60) })) : state.tr;
            }),
        new InputRule(
            new RegExp(/d$/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from) return null;
                const pos = (state.doc.resolve(start) as any);
                let depth = pos.path.length / 3 - 1;
                for (; depth >= 0; depth--) {
                    if (pos.node(depth).type === schema.nodes.paragraph) {
                        const replaced = state.tr.setNodeMarkup(pos.pos - pos.parentOffset - 1, pos.node(depth).type, { ...pos.node(depth).attrs, indent: 25 });
                        return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
                    }
                }
                return null;
            }),
        new InputRule(
            new RegExp(/h$/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from) return null;
                const pos = (state.doc.resolve(start) as any);
                let depth = pos.path.length / 3 - 1;
                for (; depth >= 0; depth--) {
                    if (pos.node(depth).type === schema.nodes.paragraph) {
                        const replaced = state.tr.setNodeMarkup(pos.pos - pos.parentOffset - 1, pos.node(depth).type, { ...pos.node(depth).attrs, indent: -25 });
                        return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
                    }
                }
                return null;
            }),
        new InputRule(
            new RegExp(/q$/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from) return null;
                const pos = (state.doc.resolve(start) as any);
                if (state.selection instanceof NodeSelection && (state.selection as NodeSelection).node.type === schema.nodes.ordered_list) {
                    let node = (state.selection as NodeSelection).node;
                    return state.tr.setNodeMarkup(pos.pos, node.type, { ...node.attrs, indent: 30 });
                }
                let depth = pos.path.length / 3 - 1;
                for (; depth >= 0; depth--) {
                    if (pos.node(depth).type === schema.nodes.paragraph) {
                        const replaced = state.tr.setNodeMarkup(pos.pos - pos.parentOffset - 1, pos.node(depth).type, { ...pos.node(depth).attrs, inset: 30 });
                        return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
                    }
                }
                return null;
            }),
        new InputRule(
            new RegExp(/!$/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from && !(state as any).EnteringStyle) return null;
                const node = (state.doc.resolve(start) as any).nodeAfter;
                if (node?.marks.findIndex((m: any) => m.type === schema.marks.user_tag) !== -1) return state.tr.removeMark(start, end, schema.marks.user_tag);
                return node ? state.tr.addMark(start, end, schema.marks.user_tag.create({ userid: Doc.CurrentUserEmail, tag: "important", modified: Math.round(Date.now() / 1000 / 60) })) : state.tr;
            }),
        new InputRule(
            new RegExp(/x$/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from && !(state as any).EnteringStyle) return null;
                const node = (state.doc.resolve(start) as any).nodeAfter;
                if (node?.marks.findIndex((m: any) => m.type === schema.marks.user_tag) !== -1) return state.tr.removeMark(start, end, schema.marks.user_tag);
                return node ? state.tr.addMark(start, end, schema.marks.user_tag.create({ userid: Doc.CurrentUserEmail, tag: "disagree", modified: Math.round(Date.now() / 1000 / 60) })) : state.tr;
            }),
        new InputRule(
            new RegExp(/@$/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from) return null;

                const value = state.doc.textBetween(start, end);
                if (value) {
                    DocServer.GetRefField(value).then(docx => {
                        let doc = ((docx instanceof Doc) && docx) || Docs.Create.FreeformDocument([], { title: value, width: 500, height: 500 }, value);
                        DocUtils.Publish(doc, value, returnFalse, returnFalse);
                    });
                    const link = state.schema.marks.link.create({ href: Utils.prepend("/doc/" + value), location: "onRight", title: value });
                    return state.tr.addMark(start, end, link);
                }
                return state.tr;
            }),
        new InputRule(
            new RegExp(/^\^\^\s$/),
            (state, match, start, end) => {
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const sm = state.storedMarks || undefined;
                const ruleProvider = FormattedTextBox.FocusedBox!.props.ruleProvider;
                const heading = NumCast(FormattedTextBox.FocusedBox!.props.Document.heading);
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
                const ruleProvider = FormattedTextBox.FocusedBox!.props.ruleProvider;
                const heading = NumCast(FormattedTextBox.FocusedBox!.props.Document.heading);
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
                const ruleProvider = FormattedTextBox.FocusedBox!.props.ruleProvider;
                const heading = NumCast(FormattedTextBox.FocusedBox!.props.Document.heading);
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
                const replaced = node ? state.tr.insert(start, newNode).replaceRangeWith(start + 1, end + 1, dashDoc).insertText(" ", start + 2).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
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
