import { textblockTypeInputRule, smartQuotes, emDash, ellipsis, InputRule } from "prosemirror-inputrules";
import { schema } from "./RichTextSchema";
import { wrappingInputRule } from "./prosemirrorPatches";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { StrCast, Cast, NumCast } from "../../new_fields/Types";
import { Doc, DataSym } from "../../new_fields/Doc";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { Docs, DocUtils } from "../documents/Documents";
import { Id } from "../../new_fields/FieldSymbols";
import { DocServer } from "../DocServer";
import { returnFalse, Utils } from "../../Utils";
import RichTextMenu from "./RichTextMenu";
import { RichTextField } from "../../new_fields/RichTextField";

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

        // set the font size using #<font-size> 
        new InputRule(
            new RegExp(/%([0-9]+)\s$/),
            (state, match, start, end) => {
                const size = Number(match[1]);
                return state.tr.deleteRange(start, end).addStoredMark(schema.marks.pFontSize.create({ fontSize: size }));
            }),

        // create a text display of a metadata field
        new InputRule(
            new RegExp(/\[\[([a-zA-Z_ \-0-9]+)\]\]$/),
            (state, match, start, end) => {
                const fieldView = state.schema.nodes.dashField.create({ fieldKey: match[1] });
                return state.tr.deleteRange(start, end).insert(start, fieldView);
            }),
        // create a text display of a metadata field on another document
        new InputRule(
            new RegExp(/\[\[([a-zA-Z_ \-0-9]+):([a-zA-Z_ \-0-9]+)\]\]$/),
            (state, match, start, end) => {
                const fieldView = state.schema.nodes.dashField.create({ fieldKey: match[2], docid: match[1] });
                return state.tr.deleteRange(start, end).insert(start, fieldView);
            }),
        // create a hyperlink portal
        new InputRule(
            new RegExp(/@@([a-zA-Z_ \-0-9]+)@@$/),
            (state, match, start, end) => {
                const docId = match[1];
                DocServer.GetRefField(docId).then(docx => {
                    const target = ((docx instanceof Doc) && docx) || Docs.Create.FreeformDocument([], { title: docId, _width: 500, _height: 500, }, docId);
                    DocUtils.Publish(target, docId, returnFalse, returnFalse);
                    DocUtils.MakeLink({ doc: (schema as any).Document }, { doc: target }, "portal link", "");
                });
                const link = state.schema.marks.link.create({ href: Utils.prepend("/doc/" + docId), location: "onRight", title: docId, targetId: docId });
                return state.tr.deleteRange(end - 1, end).deleteRange(start, start + 2).addMark(start, end - 3, link);
            }),
        // stop using active style
        new InputRule(
            new RegExp(/%%$/),
            (state, match, start, end) => {
                const tr = state.tr.deleteRange(start, end);
                const marks = state.tr.selection.$anchor.nodeBefore?.marks;
                return marks ? Array.from(marks).filter(m => m !== state.schema.marks.user_mark).reduce((tr, m) => tr.removeStoredMark(m), tr) : tr;
            }),

        // set the Todo user-tag on the current selection (assumes % was used to initiate an EnteringStyle mode)
        new InputRule(
            new RegExp(/[ti!x]$/),
            (state, match, start, end) => {
                if (state.selection.to === state.selection.from || !(schema as any).EnteringStyle) return null;
                const tag = match[0] === "t" ? "todo" : match[0] === "i" ? "ignore" : match[0] === "x" ? "disagree" : match[0] === "!" ? "important" : "??";
                const node = (state.doc.resolve(start) as any).nodeAfter;
                if (node?.marks.findIndex((m: any) => m.type === schema.marks.user_tag) !== -1) return state.tr.removeMark(start, end, schema.marks.user_tag);
                return node ? state.tr.addMark(start, end, schema.marks.user_tag.create({ userid: Doc.CurrentUserEmail, tag: tag, modified: Math.round(Date.now() / 1000 / 60) })) : state.tr;
            }),

        // set the First-line indent node type for the selection's paragraph (assumes % was used to initiate an EnteringStyle mode)
        new InputRule(
            new RegExp(/(%d|d)$/),
            (state, match, start, end) => {
                if (!match[0].startsWith("%") && !(schema as any).EnteringStyle) return null;
                const pos = (state.doc.resolve(start) as any);
                for (let depth = pos.path.length / 3 - 1; depth >= 0; depth--) {
                    const node = pos.node(depth);
                    if (node.type === schema.nodes.paragraph) {
                        const replaced = state.tr.setNodeMarkup(pos.pos - pos.parentOffset - 1, node.type, { ...node.attrs, indent: node.attrs.indent === 25 ? undefined : 25 });
                        const result = replaced.setSelection(new TextSelection(replaced.doc.resolve(start)));
                        return match[0].startsWith("%") ? result.deleteRange(start, end) : result;
                    }
                }
                return null;
            }),

        // set the Hanging indent node type for the current selection's paragraph (assumes % was used to initiate an EnteringStyle mode)
        new InputRule(
            new RegExp(/(%h|h)$/),
            (state, match, start, end) => {
                if (!match[0].startsWith("%") && !(schema as any).EnteringStyle) return null;
                const pos = (state.doc.resolve(start) as any);
                for (let depth = pos.path.length / 3 - 1; depth >= 0; depth--) {
                    const node = pos.node(depth);
                    if (node.type === schema.nodes.paragraph) {
                        const replaced = state.tr.setNodeMarkup(pos.pos - pos.parentOffset - 1, node.type, { ...node.attrs, indent: node.attrs.indent === -25 ? undefined : -25 });
                        const result = replaced.setSelection(new TextSelection(replaced.doc.resolve(start)));
                        return match[0].startsWith("%") ? result.deleteRange(start, end) : result;
                    }
                }
                return null;
            }),
        // set the Quoted indent node type for the current selection's paragraph (assumes % was used to initiate an EnteringStyle mode)
        new InputRule(
            new RegExp(/(%q|q)$/),
            (state, match, start, end) => {
                if (!match[0].startsWith("%") && !(schema as any).EnteringStyle) return null;
                const pos = (state.doc.resolve(start) as any);
                if (state.selection instanceof NodeSelection && state.selection.node.type === schema.nodes.ordered_list) {
                    const node = state.selection.node;
                    return state.tr.setNodeMarkup(pos.pos, node.type, { ...node.attrs, indent: node.attrs.indent === 30 ? undefined : 30 });
                }
                for (let depth = pos.path.length / 3 - 1; depth >= 0; depth--) {
                    const node = pos.node(depth);
                    if (node.type === schema.nodes.paragraph) {
                        const replaced = state.tr.setNodeMarkup(pos.pos - pos.parentOffset - 1, node.type, { ...node.attrs, inset: node.attrs.inset === 30 ? undefined : 30 });
                        const result = replaced.setSelection(new TextSelection(replaced.doc.resolve(start)));
                        return match[0].startsWith("%") ? result.deleteRange(start, end) : result;
                    }
                }
                return null;
            }),


        // center justify text
        new InputRule(
            new RegExp(/%\^$/),
            (state, match, start, end) => {
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const sm = state.storedMarks || undefined;
                const replaced = node ? state.tr.replaceRangeWith(start, end, schema.nodes.paragraph.create({ align: "center" })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
            }),
        // left justify text
        new InputRule(
            new RegExp(/%\[$/),
            (state, match, start, end) => {
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const sm = state.storedMarks || undefined;
                const replaced = node ? state.tr.replaceRangeWith(start, end, schema.nodes.paragraph.create({ align: "left" })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
            }),
        // right justify text
        new InputRule(
            new RegExp(/%\]$/),
            (state, match, start, end) => {
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const sm = state.storedMarks || undefined;
                const replaced = node ? state.tr.replaceRangeWith(start, end, schema.nodes.paragraph.create({ align: "right" })).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end - 2)));
            }),
        new InputRule(
            new RegExp(/##$/),
            (state, match, start, end) => {
                const textDoc = Doc.GetProto(Cast((schema as any).Document[DataSym], Doc, null)!);
                const numInlines = NumCast(textDoc.inlineTextCount);
                textDoc.inlineTextCount = numInlines + 1;
                const inlineFieldKey = "inline" + numInlines; // which field on the text document this annotation will write to
                const inlineLayoutKey = "layout_" + inlineFieldKey; // the field holding the layout string that will render the inline annotation
                const textDocInline = Docs.Create.TextDocument("", { layoutKey: inlineLayoutKey, _width: 75, _height: 35, annotationOn: textDoc, _autoHeight: true, fontSize: 9, title: "inline comment" });
                textDocInline.title = inlineFieldKey; // give the annotation its own title
                textDocInline.customTitle = true; // And make sure that it's 'custom' so that editing text doesn't change the title of the containing doc
                textDocInline.isTemplateForField = inlineFieldKey; // this is needed in case the containing text doc is converted to a template at some point
                textDocInline.proto = textDoc;  // make the annotation inherit from the outer text doc so that it can resolve any nested field references, e.g., [[field]]
                textDoc[inlineLayoutKey] = FormattedTextBox.LayoutString(inlineFieldKey); // create a layout string for the layout key that will render the annotation text
                textDoc[inlineFieldKey] = ""; // set a default value for the annotation
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const newNode = schema.nodes.dashComment.create({ docid: textDocInline[Id] });
                const dashDoc = schema.nodes.dashDoc.create({ width: 75, height: 35, title: "dashDoc", docid: textDocInline[Id], float: "right" });
                const sm = state.storedMarks || undefined;
                const replaced = node ? state.tr.insert(start, newNode).replaceRangeWith(start + 1, end + 1, dashDoc).insertText(" ", start + 2).setStoredMarks([...node.marks, ...(sm ? sm : [])]) :
                    state.tr;
                return replaced;
            }),
        new InputRule(
            new RegExp(/%\(/),
            (state, match, start, end) => {
                const node = (state.doc.resolve(start) as any).nodeAfter;
                const sm = state.storedMarks || [];
                const mark = state.schema.marks.summarizeInclusive.create();
                sm.push(mark);
                const selected = state.tr.setSelection(new TextSelection(state.doc.resolve(start), state.doc.resolve(end))).addMark(start, end, mark);
                const content = selected.selection.content();
                const replaced = node ? selected.replaceRangeWith(start, end,
                    schema.nodes.summary.create({ visibility: true, text: content, textslice: content.toJSON() })) :
                    state.tr;
                return replaced.setSelection(new TextSelection(replaced.doc.resolve(end + 1))).setStoredMarks([...node.marks, ...sm]);
            }),
        new InputRule(
            new RegExp(/%\)/),
            (state, match, start, end) => {
                return state.tr.deleteRange(start, end).removeStoredMark(state.schema.marks.summarizeInclusive.create());
            }),
        new InputRule(
            new RegExp(/%f$/),
            (state, match, start, end) => {
                const newNode = schema.nodes.footnote.create({});
                const tr = state.tr;
                tr.deleteRange(start, end).replaceSelectionWith(newNode); // replace insertion with a footnote.
                return tr.setSelection(new NodeSelection( // select the footnote node to open its display
                    tr.doc.resolve(  // get the location of the footnote node by subtracting the nodesize of the footnote from the current insertion point anchor (which will be immediately after the footnote node)
                        tr.selection.anchor - tr.selection.$anchor.nodeBefore!.nodeSize)));
            }),

        // activate a style by name using prefix '%'
        new InputRule(
            new RegExp(/%[a-z]+$/),
            (state, match, start, end) => {
                const color = match[0].substring(1, match[0].length);
                const marks = RichTextMenu.Instance._brushMap.get(color);
                if (marks) {
                    const tr = state.tr.deleteRange(start, end);
                    return marks ? Array.from(marks).reduce((tr, m) => tr.addStoredMark(m), tr) : tr;
                }
                const isValidColor = (strColor: string) => {
                    const s = new Option().style;
                    s.color = strColor;
                    return s.color === strColor.toLowerCase(); // 'false' if color wasn't assigned
                };
                if (isValidColor(color)) {
                    return state.tr.deleteRange(start, end).addStoredMark(schema.marks.pFontColor.create({ color: color }));
                }
                return null;
            }),
    ]
};
