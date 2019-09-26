import { action, computed, IReactionDisposer, reaction } from "mobx";
import * as rp from 'request-promise';
import CursorField from "../../../new_fields/CursorField";
import { Doc, DocListCast, Opt } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { BoolCast, Cast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { RouteStore } from "../../../server/RouteStore";
import { Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { DocumentType } from "../../documents/DocumentTypes";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocComponent } from "../DocComponent";
import { FieldViewProps } from "../nodes/FieldView";
import { FormattedTextBox, GoogleRef } from "../nodes/FormattedTextBox";
import { CollectionPDFView } from "./CollectionPDFView";
import { CollectionVideoView } from "./CollectionVideoView";
import { CollectionView } from "./CollectionView";
import React = require("react");

export interface CollectionViewProps extends FieldViewProps {
    addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    PanelWidth: () => number;
    PanelHeight: () => number;
    chromeCollapsed: boolean;
    setPreviewCursor?: (func: (x: number, y: number, drag: boolean) => void) => void;
}

export interface SubCollectionViewProps extends CollectionViewProps {
    CollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    ruleProvider: Doc | undefined;
}

export function CollectionSubView<T>(schemaCtor: (doc: Doc) => T) {
    class CollectionSubView extends DocComponent<SubCollectionViewProps, T>(schemaCtor) {
        private dropDisposer?: DragManager.DragDropDisposer;
        private _childLayoutDisposer?: IReactionDisposer;

        protected createDropTarget = (ele: HTMLDivElement) => {
            this.dropDisposer && this.dropDisposer();
            if (ele) {
                this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
            }
        }
        protected CreateDropTarget(ele: HTMLDivElement) {
            this.createDropTarget(ele);
        }

        componentDidMount() {
            this._childLayoutDisposer = reaction(() => [this.childDocs, Cast(this.props.Document.childLayout, Doc)],
                async (args) => args[1] instanceof Doc &&
                    this.childDocs.map(async doc => !Doc.AreProtosEqual(args[1] as Doc, (await doc).layout as Doc) && Doc.ApplyTemplateTo(args[1] as Doc, (await doc))));

        }
        componentWillUnmount() {
            this._childLayoutDisposer && this._childLayoutDisposer();
        }

        // The data field for rendeing this collection will be on the this.props.Document unless we're rendering a template in which case we try to use props.DataDoc.
        // When a document has a DataDoc but it's not a template, then it contains its own rendering data, but needs to pass the DataDoc through
        // to its children which may be templates.
        // The name of the data field comes from fieldExt if it's an extension, or fieldKey otherwise.
        @computed get dataField() {
            return Doc.fieldExtensionDoc(this.props.Document.isTemplate && this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey, this.props.fieldExt)[this.props.fieldExt || this.props.fieldKey];
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
            if (de.data instanceof DragManager.DocumentDragData && !de.data.applyAsTemplate) {
                if (de.mods === "AltKey" && de.data.draggedDocuments.length) {
                    this.childDocs.map(doc =>
                        Doc.ApplyTemplateTo(de.data.draggedDocuments[0], doc)
                    );
                    e.stopPropagation();
                    return true;
                }
                let added = false;
                if (de.data.dropAction || de.data.userDropAction) {
                    added = de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d) || added, false);
                } else if (de.data.moveDocument) {
                    let movedDocs = de.data.draggedDocuments;// de.data.options === this.props.Document[Id] ? de.data.draggedDocuments : de.data.droppedDocuments;
                    // note that it's possible the drag function might create a drop document that's not the same as the
                    // original dragged document.  So we explicitly call addDocument() with a droppedDocument and 
                    added = movedDocs.reduce((added: boolean, d, i) =>
                        de.data.moveDocument(d, this.props.Document, (doc: Doc) => this.props.addDocument(de.data.droppedDocuments[i])) || added, false);
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
        protected onDrop(e: React.DragEvent, options: DocumentOptions, completed?: () => void) {
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
                                (f instanceof Doc) && this.props.addDocument(f, false);
                            }
                        });
                    } else {
                        this.props.addDocument && this.props.addDocument(Docs.Create.WebDocument(href, options));
                    }
                } else if (text) {
                    this.props.addDocument && this.props.addDocument(Docs.Create.TextDocument({ ...options, width: 100, height: 25, documentText: "@@@" + text }), false);
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
                    this.props.addDocument(doc, false);
                    return;
                } else {
                    let path = window.location.origin + "/doc/";
                    if (text.startsWith(path)) {
                        let docid = text.replace(Utils.prepend("/doc/"), "").split("?")[0];
                        DocServer.GetRefField(docid).then(f => {
                            if (f instanceof Doc) {
                                if (options.x || options.y) { f.x = options.x; f.y = options.y; } // should be in CollectionFreeFormView
                                (f instanceof Doc) && this.props.addDocument(f, false);
                            }
                        });
                    } else {
                        let htmlDoc = Docs.Create.HtmlDocument(html, { ...options, width: 300, height: 300, documentText: text });
                        this.props.addDocument(htmlDoc, false);
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
                proto.autoHeight = true;
                proto[GoogleRef] = matches[2];
                proto.data = "Please select this document and then click on its pull button to load its contents from from Google Docs...";
                proto.backgroundColor = "#eeeeff";
                this.props.addDocument(newBox);
                return;
            }
            let batch = UndoManager.StartBatch("collection view drop");
            let promises: Promise<void>[] = [];
            // tslint:disable-next-line:prefer-for-of
            for (let i = 0; i < e.dataTransfer.items.length; i++) {
                const upload = window.location.origin + RouteStore.upload;
                let item = e.dataTransfer.items[i];
                if (item.kind === "string" && item.type.indexOf("uri") !== -1) {
                    let str: string;
                    let prom = new Promise<string>(resolve => e.dataTransfer.items[i].getAsString(resolve))
                        .then(action((s: string) => rp.head(Utils.CorsProxy(str = s))))
                        .then(result => {
                            let type = result["content-type"];
                            if (type) {
                                Docs.Get.DocumentFromType(type, str, { ...options, width: 300, nativeWidth: type.indexOf("video") !== -1 ? 600 : 300 })
                                    .then(doc => doc && this.props.addDocument(doc, false));
                            }
                        });
                    promises.push(prom);
                }
                let type = item.type;
                if (item.kind === "file") {
                    let file = item.getAsFile();
                    let formData = new FormData();

                    if (file) {
                        formData.append('file', file);
                    }
                    let dropFileName = file ? file.name : "-empty-";

                    let prom = fetch(upload, {
                        method: 'POST',
                        body: formData
                    }).then(async (res: Response) => {
                        (await res.json()).map(action((file: any) => {
                            let full = { ...options, nativeWidth: type.indexOf("video") !== -1 ? 600 : 300, width: 300, title: dropFileName };
                            let path = Utils.prepend(file);
                            Docs.Get.DocumentFromType(type, path, full).then(doc => doc && this.props.addDocument(doc));
                        }));
                    });
                    promises.push(prom);
                }
            }
            if (text) {
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

