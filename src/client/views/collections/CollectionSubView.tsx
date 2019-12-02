import { action, computed, IReactionDisposer, reaction } from "mobx";
import * as rp from 'request-promise';
import CursorField from "../../../new_fields/CursorField";
import { Doc, DocListCast, Opt } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Cast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { DocumentType } from "../../documents/DocumentTypes";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocComponent } from "../DocComponent";
import { FieldViewProps } from "../nodes/FieldView";
import { FormattedTextBox, GoogleRef } from "../nodes/FormattedTextBox";
import { CollectionView } from "./CollectionView";
import React = require("react");
var path = require('path');
import { GooglePhotos } from "../../apis/google_docs/GooglePhotosClientUtils";
import { ImageUtils } from "../../util/Import & Export/ImageUtils";
import { Networking } from "../../Network";

export interface CollectionViewProps extends FieldViewProps {
    addDocument: (document: Doc) => boolean;
    removeDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    PanelWidth: () => number;
    PanelHeight: () => number;
    VisibleHeight?: () => number;
    chromeCollapsed: boolean;
    setPreviewCursor?: (func: (x: number, y: number, drag: boolean) => void) => void;
    fieldKey: string;
}

export interface SubCollectionViewProps extends CollectionViewProps {
    CollectionView: Opt<CollectionView>;
    ruleProvider: Doc | undefined;
    children?: never | (() => JSX.Element[]) | React.ReactNode;
    isAnnotationOverlay?: boolean;
    annotationsKey: string;
}

export function CollectionSubView<T>(schemaCtor: (doc: Doc) => T) {
    class CollectionSubView extends DocComponent<SubCollectionViewProps, T>(schemaCtor) {
        private dropDisposer?: DragManager.DragDropDisposer;
        private _childLayoutDisposer?: IReactionDisposer;
        protected createDropTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
            this.dropDisposer && this.dropDisposer();
            if (ele) {
                this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
            }
        }
        protected CreateDropTarget(ele: HTMLDivElement) { //used in schema view
            this.createDropTarget(ele);
        }

        componentDidMount() {
            this._childLayoutDisposer = reaction(() => [this.childDocs, Cast(this.props.Document.childLayout, Doc)],
                async (args) => {
                    if (args[1] instanceof Doc) {
                        this.childDocs.map(async doc => !Doc.AreProtosEqual(args[1] as Doc, (await doc).layout as Doc) && Doc.ApplyTemplateTo(args[1] as Doc, (await doc), "layoutFromParent"));
                    }
                    else if (!(args[1] instanceof Promise)) {
                        this.childDocs.filter(d => !d.isTemplateField).map(async doc => doc.layoutKey === "layoutFromParent" && (doc.layoutKey = "layout"));
                    }
                });

        }
        componentWillUnmount() {
            this._childLayoutDisposer && this._childLayoutDisposer();
        }

        @computed get dataDoc() { return this.props.DataDoc && this.props.Document.isTemplateField ? Doc.GetProto(this.props.DataDoc) : Doc.GetProto(this.props.Document); }
        @computed get extensionDoc() { return Doc.fieldExtensionDoc(this.dataDoc, this.props.fieldKey); }

        // The data field for rendering this collection will be on the this.props.Document unless we're rendering a template in which case we try to use props.DataDoc.
        // When a document has a DataDoc but it's not a template, then it contains its own rendering data, but needs to pass the DataDoc through
        // to its children which may be templates.
        // If 'annotationField' is specified, then all children exist on that field of the extension document, otherwise, they exist directly on the data document under 'fieldKey'
        @computed get dataField() {
            return this.props.annotationsKey ? (this.extensionDoc ? this.extensionDoc[this.props.annotationsKey] : undefined) : this.dataDoc[this.props.fieldKey];
        }

        get childLayoutPairs() {
            return this.childDocs.map(cd => Doc.GetLayoutDataDocPair(this.props.Document, this.props.DataDoc, this.props.fieldKey, cd)).filter(pair => pair.layout).map(pair => ({ layout: pair.layout!, data: pair.data! }));
        }
        get childDocList() {
            return Cast(this.dataField, listSpec(Doc));
        }
        get childDocs() {
            let docs = DocListCast(this.dataField);
            const viewSpecScript = Cast(this.props.Document.viewSpecScript, ScriptField);
            return viewSpecScript ? docs.filter(d => viewSpecScript.script.run({ doc: d }, console.log).result) : docs;
        }

        @action
        protected async setCursorPosition(position: [number, number]) {
            let ind;
            let doc = this.props.Document;
            let id = CurrentUserUtils.id;
            let email = Doc.CurrentUserEmail;
            let pos = { x: position[0], y: position[1] };
            if (id && email) {
                const proto = Doc.GetProto(doc);
                if (!proto) {
                    return;
                }
                // The following conditional detects a recurring bug we've seen on the server
                if (proto[Id] === Docs.Prototypes.get(DocumentType.COL)[Id]) {
                    alert("COLLECTION PROTO CURSOR ISSUE DETECTED! Check console for more info...");
                    console.log(doc);
                    console.log(proto);
                    throw new Error(`AHA! You were trying to set a cursor on a collection's proto, which is the original collection proto! Look at the two previously printed lines for document values!`);
                }
                let cursors = Cast(proto.cursors, listSpec(CursorField));
                if (!cursors) {
                    proto.cursors = cursors = new List<CursorField>();
                }
                if (cursors.length > 0 && (ind = cursors.findIndex(entry => entry.data.metadata.id === id)) > -1) {
                    cursors[ind].setPosition(pos);
                } else {
                    let entry = new CursorField({ metadata: { id: id, identifier: email, timestamp: Date.now() }, position: pos });
                    cursors.push(entry);
                }
            }
        }

        @undoBatch
        @action
        protected drop(e: Event, de: DragManager.DropEvent): boolean {
            (this.props.Document.dropConverter instanceof ScriptField) &&
                this.props.Document.dropConverter.script.run({ dragData: de.data });
            if (de.data instanceof DragManager.DocumentDragData && !de.data.applyAsTemplate) {
                if (de.mods === "AltKey" && de.data.draggedDocuments.length) {
                    this.childDocs.map(doc =>
                        Doc.ApplyTemplateTo(de.data.draggedDocuments[0], doc, "layoutFromParent"));
                    e.stopPropagation();
                    return true;
                }
                let added = false;
                if (de.data.dropAction || de.data.userDropAction) {
                    added = de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d) || added, false);
                } else if (de.data.moveDocument) {
                    let movedDocs = de.data.draggedDocuments;
                    added = movedDocs.reduce((added: boolean, d, i) =>
                        de.data.droppedDocuments[i] !== d ? this.props.addDocument(de.data.droppedDocuments[i]) :
                            de.data.moveDocument(d, this.props.Document, this.props.addDocument) || added, false);
                } else {
                    added = de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d) || added, false);
                }
                e.stopPropagation();
                return added;
            }
            else if (de.data instanceof DragManager.AnnotationDragData) {
                e.stopPropagation();
                return this.props.addDocument(de.data.dropDocument);
            }
            return false;
        }

        @undoBatch
        @action
        protected async onDrop(e: React.DragEvent, options: DocumentOptions, completed?: () => void) {
            if (e.ctrlKey) {
                e.stopPropagation(); // bcz: this is a hack to stop propagation when dropping an image on a text document with shift+ctrl
                return;
            }
            let html = e.dataTransfer.getData("text/html");
            let text = e.dataTransfer.getData("text/plain");

            if (text && text.startsWith("<div")) {
                return;
            }
            e.stopPropagation();
            e.preventDefault();

            if (html && FormattedTextBox.IsFragment(html)) {
                let href = FormattedTextBox.GetHref(html);
                if (href) {
                    let docid = FormattedTextBox.GetDocFromUrl(href);
                    if (docid) { // prosemirror text containing link to dash document
                        DocServer.GetRefField(docid).then(f => {
                            if (f instanceof Doc) {
                                if (options.x || options.y) { f.x = options.x; f.y = options.y; } // should be in CollectionFreeFormView
                                (f instanceof Doc) && this.props.addDocument(f);
                            }
                        });
                    } else {
                        this.props.addDocument && this.props.addDocument(Docs.Create.WebDocument(href, options));
                    }
                } else if (text) {
                    this.props.addDocument && this.props.addDocument(Docs.Create.TextDocument({ ...options, width: 100, height: 25, documentText: "@@@" + text }));
                }
                return;
            }
            if (html && !html.startsWith("<a")) {
                let tags = html.split("<");
                if (tags[0] === "") tags.splice(0, 1);
                let img = tags[0].startsWith("img") ? tags[0] : tags.length > 1 && tags[1].startsWith("img") ? tags[1] : "";
                if (img) {
                    let split = img.split("src=\"")[1].split("\"")[0];
                    let doc = Docs.Create.ImageDocument(split, { ...options, width: 300 });
                    ImageUtils.ExtractExif(doc);
                    this.props.addDocument(doc);
                    return;
                } else {
                    let path = window.location.origin + "/doc/";
                    if (text.startsWith(path)) {
                        let docid = text.replace(Utils.prepend("/doc/"), "").split("?")[0];
                        DocServer.GetRefField(docid).then(f => {
                            if (f instanceof Doc) {
                                if (options.x || options.y) { f.x = options.x; f.y = options.y; } // should be in CollectionFreeFormView
                                (f instanceof Doc) && this.props.addDocument(f);
                            }
                        });
                    } else {
                        let htmlDoc = Docs.Create.HtmlDocument(html, { ...options, width: 300, height: 300, documentText: text });
                        this.props.addDocument(htmlDoc);
                    }
                    return;
                }
            }
            if (text && text.indexOf("www.youtube.com/watch") !== -1) {
                const url = text.replace("youtube.com/watch?v=", "youtube.com/embed/");
                this.props.addDocument(Docs.Create.VideoDocument(url, { ...options, title: url, width: 400, height: 315, nativeWidth: 600, nativeHeight: 472.5 }));
                return;
            }
            let matches: RegExpExecArray | null;
            if ((matches = /(https:\/\/)?docs\.google\.com\/document\/d\/([^\\]+)\/edit/g.exec(text)) !== null) {
                let newBox = Docs.Create.TextDocument({ ...options, width: 400, height: 200, title: "Awaiting title from Google Docs..." });
                let proto = newBox.proto!;
                const documentId = matches[2];
                proto[GoogleRef] = documentId;
                proto.data = "Please select this document and then click on its pull button to load its contents from from Google Docs...";
                proto.backgroundColor = "#eeeeff";
                this.props.addDocument(newBox);
                // const parent = Docs.Create.StackingDocument([newBox], { title: `Google Doc Import (${documentId})` });
                // CollectionDockingView.Instance.AddRightSplit(parent, undefined);
                // proto.height = parent[HeightSym]();
                return;
            }
            if ((matches = /(https:\/\/)?photos\.google\.com\/(u\/3\/)?album\/([^\\]+)/g.exec(text)) !== null) {
                const albums = await GooglePhotos.Transactions.ListAlbums();
                const albumId = matches[3];
                const mediaItems = await GooglePhotos.Query.AlbumSearch(albumId);
                console.log(mediaItems);
            }
            let batch = UndoManager.StartBatch("collection view drop");
            let promises: Promise<void>[] = [];
            // tslint:disable-next-line:prefer-for-of
            for (let i = 0; i < e.dataTransfer.items.length; i++) {
                let item = e.dataTransfer.items[i];
                if (item.kind === "string" && item.type.indexOf("uri") !== -1) {
                    let str: string;
                    let prom = new Promise<string>(resolve => e.dataTransfer.items[i].getAsString(resolve))
                        .then(action((s: string) => rp.head(Utils.CorsProxy(str = s))))
                        .then(result => {
                            let type = result["content-type"];
                            if (type) {
                                Docs.Get.DocumentFromType(type, str, { ...options, width: 300, nativeWidth: type.indexOf("video") !== -1 ? 600 : 300 })
                                    .then(doc => doc && this.props.addDocument(doc));
                            }
                        });
                    promises.push(prom);
                }
                let type = item.type;
                if (item.kind === "file") {
                    let file = item.getAsFile();
                    let formData = new FormData();

                    if (!file || !file.type) {
                        continue;
                    }

                    formData.append('file', file);
                    let dropFileName = file ? file.name : "-empty-";
                    promises.push(Networking.PostFormDataToServer("/upload", formData).then(results => {
                        results.map(action(({ clientAccessPath }: any) => {
                            let full = { ...options, nativeWidth: type.indexOf("video") !== -1 ? 600 : 300, width: 300, title: dropFileName };
                            let pathname = Utils.prepend(clientAccessPath);
                            Docs.Get.DocumentFromType(type, pathname, full).then(doc => {
                                doc && (Doc.GetProto(doc).fileUpload = path.basename(pathname).replace("upload_", "").replace(/\.[a-z0-9]*$/, ""));
                                doc && this.props.addDocument(doc);
                            });
                        }));
                    }));
                }
            }
            if (text && !text.includes("https://")) {
                this.props.addDocument(Docs.Create.TextDocument({ ...options, documentText: "@@@" + text, width: 400, height: 315 }));
                return;
            }

            if (promises.length) {
                Promise.all(promises).finally(() => { completed && completed(); batch.end(); });
            } else {
                batch.end();
            }
        }
    }
    return CollectionSubView;
}

