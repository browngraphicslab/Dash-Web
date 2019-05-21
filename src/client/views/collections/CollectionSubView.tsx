import { action, runInAction } from "mobx";
import React = require("react");
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DragManager } from "../../util/DragManager";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { RouteStore } from "../../../server/RouteStore";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { FieldViewProps } from "../nodes/FieldView";
import * as rp from 'request-promise';
import { CollectionView } from "./CollectionView";
import { CollectionPDFView } from "./CollectionPDFView";
import { CollectionVideoView } from "./CollectionVideoView";
import { Doc, Opt, FieldResult, DocListCast } from "../../../new_fields/Doc";
import { DocComponent } from "../DocComponent";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, PromiseValue, FieldValue, ListSpec } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { DocServer } from "../../DocServer";
import CursorField from "../../../new_fields/CursorField";

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
            if (this.dropDisposer) {
                this.dropDisposer();
            }
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
                if (de.data.dropAction || de.data.userDropAction) {
                    ["width", "height", "curPage"].map(key =>
                        de.data.draggedDocuments.map((draggedDocument: Doc, i: number) =>
                            PromiseValue(Cast(draggedDocument[key], "number")).then(f => f && (de.data.droppedDocuments[i][key] = f))));
                }
                let added = false;
                if (de.data.dropAction || de.data.userDropAction) {
                    added = de.data.droppedDocuments.reduce((added: boolean, d) => {
                        let moved = this.props.addDocument(d);
                        return moved || added;
                    }, false);
                } else if (de.data.moveDocument) {
                    const move = de.data.moveDocument;
                    added = de.data.droppedDocuments.reduce((added: boolean, d) => {
                        let moved = move(d, this.props.Document, this.props.addDocument);
                        return moved || added;
                    }, false);
                } else {
                    added = de.data.droppedDocuments.reduce((added: boolean, d) => {
                        let moved = this.props.addDocument(d);
                        return moved || added;
                    }, false);
                }
                e.stopPropagation();
                return added;
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
                if (path.includes('localhost')) {
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
            let html = e.dataTransfer.getData("text/html");
            let text = e.dataTransfer.getData("text/plain");

            if (text && text.startsWith("<div")) {
                return;
            }
            e.stopPropagation();
            e.preventDefault();

            if (html && html.indexOf("<img") !== 0 && !html.startsWith("<a")) {
                let htmlDoc = Docs.HtmlDocument(html, { ...options, width: 300, height: 300, documentText: text });
                this.props.addDocument(htmlDoc, false);
                return;
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
                            let docPromise = this.getDocumentFromType(type, path, { ...options, nativeWidth: 600, width: 300, title: dropFileName });

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

