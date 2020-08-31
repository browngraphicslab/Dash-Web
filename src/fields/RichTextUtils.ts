import { AssertionError } from "assert";
import { docs_v1 } from "googleapis";
import { Fragment, Mark, Node } from "prosemirror-model";
import { sinkListItem } from "prosemirror-schema-list";
import { Utils } from "../Utils";
import { Docs, DocUtils } from "../client/documents/Documents";
import { schema } from "../client/views/nodes/formattedText/schema_rts";
import { GooglePhotos } from "../client/apis/google_docs/GooglePhotosClientUtils";
import { DocServer } from "../client/DocServer";
import { Networking } from "../client/Network";
import { FormattedTextBox } from "../client/views/nodes/formattedText/FormattedTextBox";
import { Doc, Opt } from "./Doc";
import { Id } from "./FieldSymbols";
import { RichTextField } from "./RichTextField";
import { Cast, StrCast } from "./Types";
import Color = require('color');
import { EditorState, TextSelection, Transaction } from "prosemirror-state";
import { GoogleApiClientUtils } from "../client/apis/google_docs/GoogleApiClientUtils";

export namespace RichTextUtils {

    const delimiter = "\n";
    const joiner = "";


    export const Initialize = (initial?: string) => {
        const content: any[] = [];
        const state = {
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
        return new RichTextField(ToProsemirrorState(plainText, oldState), plainText);
    };

    export const ToPlainText = (state: EditorState) => {
        // Because we're working with plain text, just concatenate all paragraphs
        const content = state.doc.content;
        const paragraphs: Node<any>[] = [];
        content.forEach(node => node.type.name === "paragraph" && paragraphs.push(node));

        // Functions to flatten ProseMirror paragraph objects (and their components) to plain text
        // Concatentate paragraphs and string the result together
        const textParagraphs: string[] = paragraphs.map(paragraph => {
            const text: string[] = [];
            paragraph.content.forEach(node => node.text && text.push(node.text));
            return text.join(joiner) + delimiter;
        });
        const plainText = textParagraphs.join(joiner);
        return plainText.substring(0, plainText.length - 1);
    };

    export const ToProsemirrorState = (plainText: string, oldState?: RichTextField) => {
        // Remap the text, creating blocks split on newlines
        const elements = plainText.split(delimiter);

        // Google Docs adds in an extra carriage return automatically, so this counteracts it
        !elements[elements.length - 1].length && elements.pop();

        // Preserve the current state, but re-write the content to be the blocks
        const parsed = JSON.parse(oldState ? oldState.Data : Initialize());
        parsed.doc.content = elements.map(text => {
            const paragraph: any = { type: "paragraph" };
            text.length && (paragraph.content = [{ type: "text", marks: [], text }]); // An empty paragraph gets treated as a line break
            return paragraph;
        });

        // If the new content is shorter than the previous content and selection is unchanged, may throw an out of bounds exception, so we reset it
        parsed.selection = { type: "text", anchor: 1, head: 1 };

        // Export the ProseMirror-compatible state object we've just built
        return JSON.stringify(parsed);
    };

    export namespace GoogleDocs {

        export const Export = async (state: EditorState): Promise<GoogleApiClientUtils.Docs.Content> => {
            const nodes: (Node<any> | null)[] = [];
            const text = ToPlainText(state);
            state.doc.content.forEach(node => {
                if (!node.childCount) {
                    nodes.push(null);
                } else {
                    node.content.forEach(child => nodes.push(child));
                }
            });
            const requests = await marksToStyle(nodes);
            return { text, requests };
        };

        interface ImageTemplate {
            width: number;
            title: string;
            url: string;
            agnostic: string;
        }

        const parseInlineObjects = async (document: docs_v1.Schema$Document): Promise<Map<string, ImageTemplate>> => {
            const inlineObjectMap = new Map<string, ImageTemplate>();
            const inlineObjects = document.inlineObjects;

            if (inlineObjects) {
                const objects = Object.keys(inlineObjects).map(objectId => inlineObjects[objectId]);
                const mediaItems: MediaItem[] = objects.map(object => {
                    const embeddedObject = object.inlineObjectProperties!.embeddedObject!;
                    return { baseUrl: embeddedObject.imageProperties!.contentUri! };
                });

                const uploads = await Networking.PostToServer("/googlePhotosMediaGet", { mediaItems });

                if (uploads.length !== mediaItems.length) {
                    throw new AssertionError({ expected: mediaItems.length, actual: uploads.length, message: "Error with internally uploading inlineObjects!" });
                }

                for (let i = 0; i < objects.length; i++) {
                    const object = objects[i];
                    const { accessPaths } = uploads[i];
                    const { agnostic, _m } = accessPaths;
                    const embeddedObject = object.inlineObjectProperties!.embeddedObject!;
                    const size = embeddedObject.size!;
                    const width = size.width!.magnitude!;

                    inlineObjectMap.set(object.objectId!, {
                        title: embeddedObject.title || `Imported Image from ${document.title}`,
                        width,
                        url: Utils.prepend(_m.client),
                        agnostic: Utils.prepend(agnostic.client)
                    });
                }
            }
            return inlineObjectMap;
        };

        type BulletPosition = { value: number, sinks: number };

        interface MediaItem {
            baseUrl: string;
        }

        export const Import = async (documentId: GoogleApiClientUtils.Docs.DocumentId, textNote: Doc): Promise<Opt<GoogleApiClientUtils.Docs.ImportResult>> => {
            const document = await GoogleApiClientUtils.Docs.retrieve({ documentId });
            if (!document) {
                return undefined;
            }
            const inlineObjectMap = await parseInlineObjects(document);
            const title = document.title!;
            const { text, paragraphs } = GoogleApiClientUtils.Docs.Utils.extractText(document);
            let state = FormattedTextBox.blankState();
            const structured = parseLists(paragraphs);

            let position = 3;
            const lists: ListGroup[] = [];
            const indentMap = new Map<ListGroup, BulletPosition[]>();
            let globalOffset = 0;
            const nodes: Node<any>[] = [];
            for (const element of structured) {
                if (Array.isArray(element)) {
                    lists.push(element);
                    const positions: BulletPosition[] = [];
                    const items = element.map(paragraph => {
                        const item = listItem(state.schema, paragraph.contents);
                        const sinks = paragraph.bullet!;
                        positions.push({
                            value: position + globalOffset,
                            sinks
                        });
                        position += item.nodeSize;
                        globalOffset += 2 * sinks;
                        return item;
                    });
                    indentMap.set(element, positions);
                    nodes.push(list(state.schema, items));
                } else {
                    if (element.contents.some(child => "inlineObjectId" in child)) {
                        const group = element.contents;
                        group.forEach((child, i) => {
                            let node: Opt<Node<any>>;
                            if ("inlineObjectId" in child) {
                                node = imageNode(state.schema, inlineObjectMap.get(child.inlineObjectId!)!, textNote);
                            } else if ("content" in child && (i !== group.length - 1 || child.content!.removeTrailingNewlines().length)) {
                                node = paragraphNode(state.schema, [child]);
                            }
                            if (node) {
                                position += node.nodeSize;
                                nodes.push(node);
                            }
                        });
                    } else {
                        const paragraph = paragraphNode(state.schema, element.contents);
                        nodes.push(paragraph);
                        position += paragraph.nodeSize;
                    }
                }
            }
            state = state.apply(state.tr.replaceWith(0, 2, nodes));

            const sink = sinkListItem(state.schema.nodes.list_item);
            const dispatcher = (tr: Transaction) => state = state.apply(tr);
            for (const list of lists) {
                for (const pos of indentMap.get(list)!) {
                    const resolved = state.doc.resolve(pos.value);
                    state = state.apply(state.tr.setSelection(new TextSelection(resolved)));
                    for (let i = 0; i < pos.sinks; i++) {
                        sink(state, dispatcher);
                    }
                }
            }

            return { title, text, state };
        };

        type Paragraph = GoogleApiClientUtils.Docs.Utils.DeconstructedParagraph;
        type ListGroup = Paragraph[];
        type PreparedParagraphs = (ListGroup | Paragraph)[];

        const parseLists = (paragraphs: ListGroup) => {
            const groups: PreparedParagraphs = [];
            let group: ListGroup = [];
            for (const paragraph of paragraphs) {
                if (paragraph.bullet !== undefined) {
                    group.push(paragraph);
                } else {
                    if (group.length) {
                        groups.push(group);
                        group = [];
                    }
                    groups.push(paragraph);
                }
            }
            group.length && groups.push(group);
            return groups;
        };

        const listItem = (schema: any, runs: docs_v1.Schema$TextRun[]): Node => {
            return schema.node("list_item", null, paragraphNode(schema, runs));
        };

        const list = (schema: any, items: Node[]): Node => {
            return schema.node("ordered_list", { mapStyle: "bullet" }, items);
        };

        const paragraphNode = (schema: any, runs: docs_v1.Schema$TextRun[]): Node => {
            const children = runs.map(run => textNode(schema, run)).filter(child => child !== undefined);
            const fragment = children.length ? Fragment.from(children) : undefined;
            return schema.node("paragraph", null, fragment);
        };

        const imageNode = (schema: any, image: ImageTemplate, textNote: Doc) => {
            const { url: src, width, agnostic } = image;
            let docid: string;
            const guid = Utils.GenerateDeterministicGuid(agnostic);
            const backingDocId = StrCast(textNote[guid]);
            if (!backingDocId) {
                const backingDoc = Docs.Create.ImageDocument(agnostic, { _width: 300, _height: 300 });
                DocUtils.makeCustomViewClicked(backingDoc, Docs.Create.FreeformDocument);
                docid = backingDoc[Id];
                textNote[guid] = docid;
            } else {
                docid = backingDocId;
            }
            return schema.node("image", { src, agnostic, width, docid, float: null, location: "add:right" });
        };

        const textNode = (schema: any, run: docs_v1.Schema$TextRun) => {
            const text = run.content!.removeTrailingNewlines();
            return text.length ? schema.text(text, styleToMarks(schema, run.textStyle)) : undefined;
        };

        const StyleToMark = new Map<keyof docs_v1.Schema$TextStyle, keyof typeof schema.marks>([
            ["bold", "strong"],
            ["italic", "em"],
            ["foregroundColor", "pFontColor"],
            ["fontSize", "pFontSize"]
        ]);

        const styleToMarks = (schema: any, textStyle?: docs_v1.Schema$TextStyle) => {
            if (!textStyle) {
                return undefined;
            }
            const marks: Mark[] = [];
            Object.keys(textStyle).forEach(key => {
                let value: any;
                const targeted = key as keyof docs_v1.Schema$TextStyle;
                if (value = textStyle[targeted]) {
                    const attributes: any = {};
                    let converted = StyleToMark.get(targeted) || targeted;

                    value.url && (attributes.href = value.url);
                    if (value.color) {
                        const object = value.color.rgbColor;
                        attributes.color = Color.rgb(["red", "green", "blue"].map(color => object[color] * 255 || 0)).hex();
                    }
                    if (value.magnitude) {
                        attributes.fontSize = value.magnitude;
                    }

                    if (converted === "weightedFontFamily") {
                        converted = ImportFontFamilyMapping.get(value.fontFamily) || "timesNewRoman";
                    }

                    const mapped = schema.marks[converted];
                    if (!mapped) {
                        alert(`No mapping found for ${converted}!`);
                        return;
                    }

                    const mark = schema.mark(mapped, attributes);
                    mark && marks.push(mark);
                }
            });
            return marks;
        };

        const MarkToStyle = new Map<keyof typeof schema.marks, keyof docs_v1.Schema$TextStyle>([
            ["strong", "bold"],
            ["em", "italic"],
            ["pFontColor", "foregroundColor"],
            ["pFontSize", "fontSize"],
            ["timesNewRoman", "weightedFontFamily"],
            ["georgia", "weightedFontFamily"],
            ["comicSans", "weightedFontFamily"],
            ["tahoma", "weightedFontFamily"],
            ["impact", "weightedFontFamily"]
        ]);

        const ExportFontFamilyMapping = new Map<string, string>([
            ["timesNewRoman", "Times New Roman"],
            ["arial", "Arial"],
            ["georgia", "Georgia"],
            ["comicSans", "Comic Sans MS"],
            ["tahoma", "Tahoma"],
            ["impact", "Impact"]
        ]);

        const ImportFontFamilyMapping = new Map<string, string>([
            ["Times New Roman", "timesNewRoman"],
            ["Arial", "arial"],
            ["Georgia", "georgia"],
            ["Comic Sans MS", "comicSans"],
            ["Tahoma", "tahoma"],
            ["Impact", "impact"]
        ]);

        const ignored = ["user_mark"];

        const marksToStyle = async (nodes: (Node<any> | null)[]): Promise<docs_v1.Schema$Request[]> => {
            const requests: docs_v1.Schema$Request[] = [];
            let position = 1;
            for (const node of nodes) {
                if (node === null) {
                    position += 2;
                    continue;
                }
                const { marks, attrs, nodeSize } = node;
                const textStyle: docs_v1.Schema$TextStyle = {};
                const information: LinkInformation = {
                    startIndex: position,
                    endIndex: position + nodeSize,
                    textStyle
                };
                let mark: Mark<any>;
                const markMap = BuildMarkMap(marks);
                for (const markName of Object.keys(schema.marks)) {
                    if (ignored.includes(markName) || !(mark = markMap[markName])) {
                        continue;
                    }
                    let converted = MarkToStyle.get(markName) || markName as keyof docs_v1.Schema$TextStyle;
                    let value: any = true;
                    if (!converted) {
                        continue;
                    }
                    const { attrs } = mark;
                    switch (converted) {
                        case "link":
                            let url = attrs.allLinks.length ? attrs.allLinks[0].href : "";
                            const delimiter = "/doc/";
                            const alreadyShared = "?sharing=true";
                            if (new RegExp(window.location.origin + delimiter).test(url) && !url.endsWith(alreadyShared)) {
                                const linkDoc = await DocServer.GetRefField(url.split(delimiter)[1]);
                                if (linkDoc instanceof Doc) {
                                    let exported = (await Cast(linkDoc.anchor2, Doc))!;
                                    if (!exported.customLayout) {
                                        exported = Doc.MakeAlias(exported);
                                        DocUtils.makeCustomViewClicked(exported, Docs.Create.FreeformDocument);
                                        linkDoc.anchor2 = exported;
                                    }
                                    url = Utils.shareUrl(exported[Id]);
                                }
                            }
                            value = { url };
                            textStyle.foregroundColor = fromRgb.blue;
                            textStyle.bold = true;
                            break;
                        case "fontSize":
                            value = { magnitude: attrs.fontSize, unit: "PT" };
                            break;
                        case "foregroundColor":
                            value = fromHex(attrs.color);
                            break;
                        case "weightedFontFamily":
                            value = { fontFamily: ExportFontFamilyMapping.get(markName) };
                    }
                    let matches: RegExpExecArray | null;
                    if ((matches = /p(\d+)/g.exec(markName)) !== null) {
                        converted = "fontSize";
                        value = { magnitude: parseInt(matches[1].replace("px", "")), unit: "PT" };
                    }
                    textStyle[converted] = value;
                }
                if (Object.keys(textStyle).length) {
                    requests.push(EncodeStyleUpdate(information));
                }
                if (node.type.name === "image") {
                    const width = attrs.width;
                    requests.push(await EncodeImage({
                        startIndex: position + nodeSize - 1,
                        uri: attrs.agnostic,
                        width: Number(typeof width === "string" ? width.replace("px", "") : width)
                    }));
                }
                position += nodeSize;
            }
            return requests;
        };

        const BuildMarkMap = (marks: Mark<any>[]) => {
            const markMap: { [type: string]: Mark<any> } = {};
            marks.forEach(mark => markMap[mark.type.name] = mark);
            return markMap;
        };

        interface LinkInformation {
            startIndex: number;
            endIndex: number;
            textStyle: docs_v1.Schema$TextStyle;
        }

        interface ImageInformation {
            startIndex: number;
            width: number;
            uri: string;
        }

        namespace fromRgb {

            export const convert = (red: number, green: number, blue: number): docs_v1.Schema$OptionalColor => {
                return {
                    color: {
                        rgbColor: {
                            red: red / 255,
                            green: green / 255,
                            blue: blue / 255
                        }
                    }
                };
            };

            export const red = convert(255, 0, 0);
            export const green = convert(0, 255, 0);
            export const blue = convert(0, 0, 255);

        }

        const fromHex = (color: string): docs_v1.Schema$OptionalColor => {
            const c = Color(color);
            return fromRgb.convert(c.red(), c.green(), c.blue());
        };

        const EncodeStyleUpdate = (information: LinkInformation): docs_v1.Schema$Request => {
            const { startIndex, endIndex, textStyle } = information;
            return {
                updateTextStyle: {
                    fields: "*",
                    range: { startIndex, endIndex },
                    textStyle
                } as docs_v1.Schema$UpdateTextStyleRequest
            };
        };

        const EncodeImage = async ({ uri, width, startIndex }: ImageInformation) => {
            if (!uri) {
                return {};
            }
            const source = [Docs.Create.ImageDocument(uri)];
            const baseUrls = await GooglePhotos.Transactions.UploadThenFetch(source);
            if (baseUrls) {
                return {
                    insertInlineImage: {
                        uri: baseUrls[0],
                        objectSize: { width: { magnitude: width, unit: "PT" } },
                        location: { index: startIndex }
                    }
                };
            }
            return {};
        };
    }

}