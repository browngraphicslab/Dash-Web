import { action } from "mobx";
import * as rp from 'request-promise';
import CursorField from "../../../new_fields/CursorField";
import { Doc, DocListCast, Opt } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, PromiseValue } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { RouteStore } from "../../../server/RouteStore";
import { DocServer } from "../../DocServer";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocComponent } from "../DocComponent";
import { FieldViewProps } from "../nodes/FieldView";
import { CollectionPDFView } from "./CollectionPDFView";
import { CollectionVideoView } from "./CollectionVideoView";
import { CollectionView } from "./CollectionView";
import React = require("react");
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { Id } from "../../../new_fields/FieldSymbols";

export interface CollectionViewProps extends FieldViewProps {
    addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    PanelWidth: () => number;
    PanelHeight: () => number;
}

export interface SubCollectionViewProps extends CollectionViewProps {
    CollectionView: CollectionView | CollectionPDFView | CollectionVideoView;
}

export function CollectionSubView<T>(schemaCtor: (doc: Doc) => T) {
    class CollectionSubView extends DocComponent<SubCollectionViewProps, T>(schemaCtor) {
        private dropDisposer?: DragManager.DragDropDisposer;
        protected createDropTarget = (ele: HTMLDivElement) => {
            this.dropDisposer && this.dropDisposer();
            if (ele) {
                this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
            }
        }
        protected CreateDropTarget(ele: HTMLDivElement) {
            this.createDropTarget(ele);
        }

        get childDocs() {
            //TODO tfs: This might not be what we want?
            //This linter error can't be fixed because of how js arguments work, so don't switch this to filter(FieldValue)
            return DocListCast(this.props.Document[this.props.fieldKey]);
        }

        @action
        protected async setCursorPosition(position: [number, number]) {
            let ind;
            let doc = this.props.Document;
            let id = CurrentUserUtils.id;
            let email = CurrentUserUtils.email;
            let pos = { x: position[0], y: position[1] };
            if (id && email) {
                const proto = await doc.proto;
                if (!proto) {
                    return;
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
            if (de.data instanceof DragManager.DocumentDragData) {
                let added = false;
                if (de.data.dropAction || de.data.userDropAction) {
                    added = de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d) || added, false);
                } else if (de.data.moveDocument) {
                    let movedDocs = de.data.options === this.props.Document[Id] ? de.data.draggedDocuments : de.data.droppedDocuments;
                    added = movedDocs.reduce((added: boolean, d) =>
                        de.data.moveDocument(d, this.props.Document, this.props.addDocument) || added, false);
                } else {
                    added = de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d) || added, false);
                }
                e.stopPropagation();
                return added;
            }
            else if (de.data instanceof DragManager.AnnotationDragData) {
                return this.props.addDocument(de.data.dropDocument);
            }
            return false;
        }

        protected async getDocumentFromType(type: string, path: string, options: DocumentOptions): Promise<Opt<Doc>> {
            let ctor: ((path: string, options: DocumentOptions) => (Doc | Promise<Doc | undefined>)) | undefined = undefined;
            if (type.indexOf("image") !== -1) {
                ctor = Docs.ImageDocument;
            }
            if (type.indexOf("video") !== -1) {
                ctor = Docs.VideoDocument;
            }
            if (type.indexOf("audio") !== -1) {
                ctor = Docs.AudioDocument;
            }
            if (type.indexOf("pdf") !== -1) {
                ctor = Docs.PdfDocument;
                options.nativeWidth = 1200;
            }
            if (type.indexOf("excel") !== -1) {
                ctor = Docs.DBDocument;
                options.dropAction = "copy";
            }
            if (type.indexOf("html") !== -1) {
                if (path.includes(window.location.hostname)) {
                    let s = path.split('/');
                    let id = s[s.length - 1];
                    DocServer.GetRefField(id).then(field => {
                        if (field instanceof Doc) {
                            let alias = Doc.MakeAlias(field);
                            alias.x = options.x || 0;
                            alias.y = options.y || 0;
                            alias.width = options.width || 300;
                            alias.height = options.height || options.width || 300;
                            this.props.addDocument(alias, false);
                        }
                    });
                    return undefined;
                }
                ctor = Docs.WebDocument;
                options = { height: options.width, ...options, title: path, nativeWidth: undefined };
            }
            return ctor ? ctor(path, options) : undefined;
        }

        @undoBatch
        @action
        protected onDrop(e: React.DragEvent, options: DocumentOptions): void {
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
                        this.props.addDocument && this.props.addDocument(Docs.WebDocument(href, options));
                    }
                } else if (text) {
                    this.props.addDocument && this.props.addDocument(Docs.TextDocument({ ...options, width: 100, height: 25, documentText: "@@@" + text }), false);
                }
                return;
            }
            if (html && !html.startsWith("<a")) {
                let tags = html.split("<");
                if (tags[0] === "") tags.splice(0, 1);
                let img = tags[0].startsWith("img") ? tags[0] : tags.length > 1 && tags[1].startsWith("img") ? tags[1] : "";
                if (img) {
                    let split = img.split("src=\"")[1].split("\"")[0];
                    let doc = Docs.ImageDocument(split, { ...options, width: 300 });
                    this.props.addDocument(doc, false);
                    return;
                } else {
                    let path = window.location.origin + "/doc/";
                    if (text.startsWith(path)) {
                        let docid = text.replace(DocServer.prepend("/doc/"), "").split("?")[0];
                        DocServer.GetRefField(docid).then(f => {
                            if (f instanceof Doc) {
                                if (options.x || options.y) { f.x = options.x; f.y = options.y; } // should be in CollectionFreeFormView
                                (f instanceof Doc) && this.props.addDocument(f, false);
                            }
                        });
                    } else {
                        let htmlDoc = Docs.HtmlDocument(html, { ...options, width: 300, height: 300, documentText: text });
                        this.props.addDocument(htmlDoc, false);
                    }
                    return;
                }
            }
            if (text && text.indexOf("www.youtube.com/watch") !== -1) {
                const url = text.replace("youtube.com/watch?v=", "youtube.com/embed/");
                this.props.addDocument(Docs.WebDocument(url, { ...options, width: 300, height: 300 }));
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
                        .then(action((s: string) => rp.head(DocServer.prepend(RouteStore.corsProxy + "/" + (str = s)))))
                        .then(result => {
                            let type = result["content-type"];
                            if (type) {
                                this.getDocumentFromType(type, str, { ...options, width: 300, nativeWidth: 300 })
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
                            let path = window.location.origin + file;
                            let docPromise = this.getDocumentFromType(type, path, { ...options, nativeWidth: 300, width: 300, title: dropFileName });

                            docPromise.then(doc => doc && this.props.addDocument(doc));
                        }));
                    });
                    promises.push(prom);
                }
            }

            if (promises.length) {
                Promise.all(promises).finally(() => batch.end());
            } else {
                batch.end();
            }
        }
    }
    return CollectionSubView;
}

