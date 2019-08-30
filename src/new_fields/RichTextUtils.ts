import { EditorState } from "prosemirror-state";
import { Node, Fragment, Mark } from "prosemirror-model";
import { RichTextField } from "./RichTextField";
import { docs_v1 } from "googleapis";
import { GoogleApiClientUtils } from "../client/apis/google_docs/GoogleApiClientUtils";
import { FormattedTextBox } from "../client/views/nodes/FormattedTextBox";
import { Opt } from "./Doc";

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
            let Docs = GoogleApiClientUtils.Docs;
            let document = await Docs.retrieve({ documentId });

            if (!document) {
                return undefined;
            }

            let title = document.title!;

            let { text, runs } = Docs.Utils.extractText(document);
            let segments = runs[Symbol.iterator]();

            let state = FormattedTextBox.blankState();
            let breaks: number[] = [];
            let from = 0;
            let result = segments.next();
            while (!result.done) {
                let run = result.value;
                let fragment = run.content!;
                if (fragment.hasNewline()) {
                    let trimmed = fragment.removeTrailingNewlines();
                    if (fragment.length === 1) {
                        breaks.push(from);
                    } else {
                        let content = Fragment.from(state.schema.text(trimmed, styleToMarks(state.schema, run.textStyle)));
                        let node = state.schema.node("paragraph", null, content);
                        state = state.apply(state.tr.insert(from, node));
                        from += node.nodeSize;
                    }
                    result = segments.next();
                } else {
                    let nodes: Node[] = [];
                    nodes.push(state.schema.text(fragment, styleToMarks(state.schema, run.textStyle)));
                    result = segments.next();
                    while (!result.done) {
                        run = result.value;
                        fragment = run.content!;
                        let trimmed = fragment.removeTrailingNewlines();
                        nodes.push(state.schema.text(trimmed, styleToMarks(state.schema, run.textStyle)));
                        if (fragment.hasNewline()) {
                            let node = state.schema.node("paragraph", null, Fragment.fromArray(nodes));
                            state = state.apply(state.tr.insert(from, node));
                            from += node.nodeSize;
                            result = segments.next();
                            break;
                        }
                        result = segments.next();
                    }
                    if (result.done) {
                        break;
                    }
                }
            }
            breaks.forEach(position => state = state.apply(state.tr.insert(position, state.schema.node("paragraph"))));
            let data = new RichTextField(JSON.stringify(state.toJSON()));
            return { title, text, data };
        };

        const styleToMarks = (schema: any, textStyle?: docs_v1.Schema$TextStyle) => {
            if (!textStyle) {
                return undefined;
            }
            let marks: Mark[] = [];
            if (textStyle.link) {
                let href = textStyle.link.url;
                marks.push(schema.mark(schema.marks.link, { href }));
            }
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