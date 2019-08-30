import { EditorState } from "prosemirror-state";
import { Node, Fragment, Mark } from "prosemirror-model";
import { RichTextField } from "./RichTextField";
import { docs_v1 } from "googleapis";
import { GoogleApiClientUtils } from "../client/apis/google_docs/GoogleApiClientUtils";
import { FormattedTextBox } from "../client/views/nodes/FormattedTextBox";
import { Opt } from "./Doc";
import * as Color from "color";

export namespace RichTextUtils {

    const delimiter = "\n";
    const joiner = "";


    export const Initialize = (initial?: string) => {
        let content: any[] = [];
        let state = {
            doc: {
                type: "doc",
                content,
            },
            selection: {
                type: "text",
                anchor: 0,
                head: 0
            }
        };
        if (initial && initial.length) {
            content.push({
                type: "paragraph",
                content: {
                    type: "text",
                    text: initial
                }
            });
            state.selection.anchor = state.selection.head = initial.length + 1;
        }
        return JSON.stringify(state);
    };

    export const Synthesize = (plainText: string, oldState?: RichTextField) => {
        return new RichTextField(ToProsemirrorState(plainText, oldState));
    };

    export const ToPlainText = (state: EditorState) => {
        // Because we're working with plain text, just concatenate all paragraphs
        let content = state.doc.content;
        let paragraphs: Node<any>[] = [];
        content.forEach(node => node.type.name === "paragraph" && paragraphs.push(node));

        // Functions to flatten ProseMirror paragraph objects (and their components) to plain text
        // Concatentate paragraphs and string the result together
        let textParagraphs: string[] = paragraphs.map(paragraph => {
            let text: string[] = [];
            paragraph.content.forEach(node => node.text && text.push(node.text));
            return text.join(joiner) + delimiter;
        });
        let plainText = textParagraphs.join(joiner);
        return plainText.substring(0, plainText.length - 1);
    };

    export const ToProsemirrorState = (plainText: string, oldState?: RichTextField) => {
        // Remap the text, creating blocks split on newlines
        let elements = plainText.split(delimiter);

        // Google Docs adds in an extra carriage return automatically, so this counteracts it
        !elements[elements.length - 1].length && elements.pop();

        // Preserve the current state, but re-write the content to be the blocks
        let parsed = JSON.parse(oldState ? oldState.Data : Initialize());
        parsed.doc.content = elements.map(text => {
            let paragraph: any = { type: "paragraph" };
            text.length && (paragraph.content = [{ type: "text", marks: [], text }]); // An empty paragraph gets treated as a line break
            return paragraph;
        });

        // If the new content is shorter than the previous content and selection is unchanged, may throw an out of bounds exception, so we reset it
        parsed.selection = { type: "text", anchor: 1, head: 1 };

        // Export the ProseMirror-compatible state object we've just built
        return JSON.stringify(parsed);
    };

    export namespace GoogleDocs {

        export const Export = (state: EditorState): GoogleApiClientUtils.Docs.Content => {
            let textNodes: Node<any>[] = [];
            let text = ToPlainText(state);
            let content = state.doc.content;
            content.forEach(node => node.content.forEach(node => node.type.name === "text" && textNodes.push(node)));
            let linkRequests = ExtractLinks(textNodes);
            return {
                text,
                requests: [...linkRequests]
            };
        };

        export const Import = async (documentId: GoogleApiClientUtils.Docs.DocumentId): Promise<Opt<GoogleApiClientUtils.Docs.ImportResult>> => {
            const document = await GoogleApiClientUtils.Docs.retrieve({ documentId });
            if (!document) {
                return undefined;
            }

            const title = document.title!;
            const { text, paragraphs } = GoogleApiClientUtils.Docs.Utils.extractText(document);
            let state = FormattedTextBox.blankState();

            const nodes = paragraphs.map(paragraph => paragraphNode(state.schema, paragraph));
            state = state.apply(state.tr.replaceWith(0, 2, nodes));

            return { title, text, state };
        };

        const paragraphNode = (schema: any, content: GoogleApiClientUtils.Docs.Utils.DeconstructedParagraph) => {
            let children = content.runs.map(run => textNode(schema, run));
            let complete = children.every(child => child !== undefined);
            let fragment = complete ? Fragment.from(children) : undefined;
            return schema.node("paragraph", null, fragment);
        };

        const textNode = (schema: any, run: docs_v1.Schema$TextRun) => {
            let text = run.content!.removeTrailingNewlines();
            return text.length ? schema.text(text, styleToMarks(schema, run.textStyle)) : undefined;
        };

        const MarkMapping = new Map<keyof docs_v1.Schema$TextStyle, string>([
            ["bold", "strong"],
            ["italic", "em"],
            ["foregroundColor", "pFontColor"]
        ]);

        const styleToMarks = (schema: any, textStyle?: docs_v1.Schema$TextStyle) => {
            if (!textStyle) {
                return undefined;
            }
            let marks: Mark[] = [];
            Object.keys(textStyle).forEach(key => {
                let value: any;
                let targeted = key as keyof docs_v1.Schema$TextStyle;
                if (value = textStyle[targeted]) {
                    let attributes: any = {};
                    let converted = MarkMapping.get(targeted) || targeted;

                    value.url && (attributes.href = value.url);
                    if (value.color) {
                        let object: { [key: string]: number } = value.color.rgbColor;
                        attributes.color = Color.rgb(Object.values(object).map(value => value * 255)).hex();
                    }

                    let mark = schema.mark(schema.marks[converted], attributes);
                    mark && marks.push(mark);
                }
            });
            return marks;
        };

        interface LinkInformation {
            startIndex: number;
            endIndex: number;
            bold: boolean;
            url: string;
        }

        const ExtractLinks = (nodes: Node<any>[]) => {
            let links: docs_v1.Schema$Request[] = [];
            let position = 1;
            for (let node of nodes) {
                let link, length = node.nodeSize;
                let marks = node.marks;
                if (marks.length && (link = marks.find(mark => mark.type.name === "link"))) {
                    links.push(Encode({
                        startIndex: position,
                        endIndex: position + length,
                        url: link.attrs.href,
                        bold: false
                    }));
                }
                position += length;
            }
            return links;
        };

        const Encode = (information: LinkInformation) => {
            return {
                updateTextStyle: {
                    fields: "*",
                    range: {
                        startIndex: information.startIndex,
                        endIndex: information.endIndex
                    },
                    textStyle: {
                        bold: true,
                        link: { url: information.url },
                        foregroundColor: { color: { rgbColor: { red: 0.0, green: 0.0, blue: 1.0 } } }
                    }
                }
            };
        };
    }

}