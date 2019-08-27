import { EditorState } from "prosemirror-state";
import { Node } from "prosemirror-model";
import { RichTextField } from "./RichTextField";
import { docs_v1 } from "googleapis";
import { GoogleApiClientUtils } from "../client/apis/google_docs/GoogleApiClientUtils";

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

        export const Convert = (state: EditorState): GoogleApiClientUtils.Content => {
            let textNodes: Node<any>[] = [];
            let text = ToPlainText(state);
            let content = state.doc.content;
            content.forEach(node => node.content.forEach(node => node.type.name === "text" && textNodes.push(node)));
            let links: docs_v1.Schema$Request[] = [];
            let position = 1;
            for (let node of textNodes) {
                let link, length = node.nodeSize;
                let marks = node.marks;
                if (marks.length && (link = marks.find(mark => mark.type.name === "link"))) {
                    links.push(encode({
                        startIndex: position,
                        endIndex: position + length,
                        url: link.attrs.href,
                    }));
                }
                position += length;
            }
            return { text, links };
        };

        interface LinkInformation {
            startIndex: number;
            endIndex: number;
            url: string;
        }
        const encode = (information: LinkInformation) => {
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