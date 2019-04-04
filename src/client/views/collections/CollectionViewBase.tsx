import { action, runInAction } from "mobx";
import { Document } from "../../../fields/Document";
import { ListField } from "../../../fields/ListField";
import React = require("react");
import { KeyStore } from "../../../fields/KeyStore";
import { FieldWaiting, Opt } from "../../../fields/Field";
import { undoBatch } from "../../util/UndoManager";
import { DragManager } from "../../util/DragManager";
import { Documents, DocumentOptions } from "../../documents/Documents";
import { Key } from "../../../fields/Key";
import { Transform } from "../../util/Transform";
import { CollectionView } from "./CollectionView";
import { RouteStore } from "../../../server/RouteStore";
import { TupleField } from "../../../fields/TupleField";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { NumberField } from "../../../fields/NumberField";
import request = require("request");
import { ServerUtils } from "../../../server/ServerUtil";
import { Server } from "../../Server";
import { FieldViewProps } from "../nodes/FieldView";

export interface CollectionViewProps extends FieldViewProps {
    addDocument: (document: Document, allowDuplicates?: boolean) => boolean;
    removeDocument: (document: Document) => boolean;
    moveDocument: (document: Document, targetCollection: Document, addDocument: (document: Document) => boolean) => boolean;
}

export interface SubCollectionViewProps extends CollectionViewProps {
}

export type CursorEntry = TupleField<[string, string], [number, number]>;

export class CollectionViewBase extends React.Component<SubCollectionViewProps> {
    private dropDisposer?: DragManager.DragDropDisposer;
    protected createDropTarget = (ele: HTMLDivElement) => {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    @action
    protected setCursorPosition(position: [number, number]) {
        let ind;
        let doc = this.props.Document;
        let id = CurrentUserUtils.id;
        let email = CurrentUserUtils.email;
        if (id && email) {
            let textInfo: [string, string] = [id, email];
            doc.GetTAsync(KeyStore.Prototype, Document).then(proto => {
                if (!proto) {
                    return;
                }
                proto.GetOrCreateAsync<ListField<CursorEntry>>(KeyStore.Cursors, ListField, action((field: ListField<CursorEntry>) => {
                    let cursors = field.Data;
                    if (cursors.length > 0 && (ind = cursors.findIndex(entry => entry.Data[0][0] === id)) > -1) {
                        cursors[ind].Data[1] = position;
                    } else {
                        let entry = new TupleField<[string, string], [number, number]>([textInfo, position]);
                        cursors.push(entry);
                    }
                }))
            })
        }
    }

    @undoBatch
    @action
    protected drop(e: Event, de: DragManager.DropEvent): boolean {
        if (de.data instanceof DragManager.DocumentDragData) {
            if (de.data.aliasOnDrop) {
                [KeyStore.Width, KeyStore.Height, KeyStore.CurPage].map(key =>
                    de.data.draggedDocuments.GetTAsync(key, NumberField, (f: Opt<NumberField>) => f ? de.data.droppedDocument.SetNumber(key, f.Data) : null));
            }
            let added = false;
            if (de.data.aliasOnDrop) {
                added = de.data.droppedDocuments.reduce((added, d) => added || this.props.addDocument(d), false);
            } else if (de.data.moveDocument) {
                const move = de.data.moveDocument;
                added = de.data.droppedDocuments.reduce((added, d) => added || move(d, this.props.Document, this.props.addDocument), false)
            }
            e.stopPropagation();
            return added;
        }
        return false;
    }

    protected getDocumentFromType(type: string, path: string, options: DocumentOptions): Opt<Document> {
        let ctor: ((path: string, options: DocumentOptions) => Document) | undefined;
        if (type.indexOf("image") !== -1) {
            ctor = Documents.ImageDocument;
        }
        if (type.indexOf("video") !== -1) {
            ctor = Documents.VideoDocument;
        }
        if (type.indexOf("audio") !== -1) {
            ctor = Documents.AudioDocument;
        }
        if (type.indexOf("pdf") !== -1) {
            ctor = Documents.PdfDocument;
        }
        if (type.indexOf("html") !== -1) {
            if (path.includes('localhost')) {
                let s = path.split('/');
                let id = s[s.length - 1];
                Server.GetField(id).then(field => {
                    if (field instanceof Document) {
                        let alias = field.CreateAlias();
                        alias.SetNumber(KeyStore.X, options.x || 0);
                        alias.SetNumber(KeyStore.Y, options.y || 0);
                        alias.SetNumber(KeyStore.Width, options.width || 300);
                        alias.SetNumber(KeyStore.Height, options.height || options.width || 300);
                        this.props.addDocument(alias, false);
                    }
                })
                return undefined;
            }
            ctor = Documents.WebDocument;
            options = { height: options.width, ...options, title: path };
        }
        return ctor ? ctor(path, options) : undefined;
    }

    @action
    protected onDrop(e: React.DragEvent, options: DocumentOptions): void {
        let html = e.dataTransfer.getData("text/html");
        let text = e.dataTransfer.getData("text/plain");

        if (text && text.startsWith("<div")) {
            return;
        }
        e.stopPropagation()
        e.preventDefault()

        if (html && html.indexOf("<img") != 0 && !html.startsWith("<a")) {
            console.log("not good");
            let htmlDoc = Documents.HtmlDocument(html, { ...options, width: 300, height: 300 });
            htmlDoc.SetText(KeyStore.DocumentText, text);
            this.props.addDocument(htmlDoc, false);
            return;
        }

        for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const upload = window.location.origin + RouteStore.upload;
            let item = e.dataTransfer.items[i];
            if (item.kind === "string" && item.type.indexOf("uri") != -1) {
                e.dataTransfer.items[i].getAsString(action((s: string) => {
                    request.head(ServerUtils.prepend(RouteStore.corsProxy + "/" + s), (err, res, body) => {
                        let type = res.headers["content-type"];
                        if (type) {
                            let doc = this.getDocumentFromType(type, s, { ...options, width: 300, nativeWidth: 300 })
                            if (doc) {
                                this.props.addDocument(doc, false);
                            }
                        }
                    });
                    // this.props.addDocument(Documents.WebDocument(s, { ...options, width: 300, height: 300 }), false)
                }))
            }
            let type = item.type
            if (item.kind == "file") {
                let file = item.getAsFile();
                let formData = new FormData()

                if (file) {
                    formData.append('file', file)
                }

                fetch(upload, {
                    method: 'POST',
                    body: formData
                }).then((res: Response) => {
                    return res.json()
                }).then(json => {
                    json.map((file: any) => {
                        let path = window.location.origin + file
                        runInAction(() => {
                            let doc = this.getDocumentFromType(type, path, { ...options, nativeWidth: 300, width: 300 })

                            let docs = this.props.Document.GetT(KeyStore.Data, ListField);
                            if (docs != FieldWaiting) {
                                if (!docs) {
                                    docs = new ListField<Document>();
                                    this.props.Document.Set(KeyStore.Data, docs)
                                }
                                if (doc) {
                                    docs.Data.push(doc);
                                }
                            }
                        })
                    })
                })
            }
        }
    }
}
