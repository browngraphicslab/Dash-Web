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
import { DocumentManager } from "../../util/DocumentManager";
import request = require("request");
import { ServerUtils } from "../../../server/ServerUtil";

export interface CollectionViewProps {
    fieldKey: Key;
    Document: Document;
    ScreenToLocalTransform: () => Transform;
    isSelected: () => boolean;
    isTopMost: boolean;
    select: (ctrlPressed: boolean) => void;
    bindings: any;
    panelWidth: () => number;
    panelHeight: () => number;
    focus: (doc: Document) => void;
}

export interface SubCollectionViewProps extends CollectionViewProps {
    active: () => boolean;
    addDocument: (doc: Document, allowDuplicates: boolean) => void;
    removeDocument: (doc: Document) => boolean;
    CollectionView: CollectionView;
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
            doc.GetOrCreateAsync<ListField<CursorEntry>>(KeyStore.Cursors, ListField, field => {
                let cursors = field.Data;
                if (cursors.length > 0 && (ind = cursors.findIndex(entry => entry.Data[0][0] === id)) > -1) {
                    cursors[ind].Data[1] = position;
                } else {
                    let entry = new TupleField<[string, string], [number, number]>([textInfo, position]);
                    cursors.push(entry);
                }
            })


        }
    }

    protected getRemoteCursors = (): CursorEntry[] => {
        let doc = this.props.Document;
        let id = CurrentUserUtils.id;
        if (doc && id) {
            // get me all stored cursors that don't correspond to my own cursor
            return doc.GetList<CursorEntry>(KeyStore.Cursors, []).filter(entry => entry.Data[0][0] !== id);
        }
        return [];
    }

    @undoBatch
    @action
    protected drop(e: Event, de: DragManager.DropEvent) {
        if (de.data instanceof DragManager.DocumentDragData) {
            if (de.data.aliasOnDrop) {
                [KeyStore.Width, KeyStore.Height, KeyStore.CurPage].map(key =>
                    de.data.draggedDocument.GetTAsync(key, NumberField, (f: Opt<NumberField>) => f ? de.data.droppedDocument.SetNumber(key, f.Data) : null));
            } else if (de.data.removeDocument) {
                de.data.removeDocument(this.props.CollectionView);
            }
            this.props.addDocument(de.data.droppedDocument, false);
            e.stopPropagation();
        }
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
            ctor = Documents.WebDocument;
            options = { height: options.width, ...options, };
        }
        return ctor ? ctor(path, options) : undefined;
    }

    @action
    protected onDrop(e: React.DragEvent, options: DocumentOptions): void {
        let that = this;

        let html = e.dataTransfer.getData("text/html");
        let text = e.dataTransfer.getData("text/plain");

        if (text && text.startsWith("<div")) {
            return;
        }
        e.stopPropagation()
        e.preventDefault()

        if (html && html.indexOf("<img") != 0) {
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
                    let document: Document;
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

                            let docs = that.props.Document.GetT(KeyStore.Data, ListField);
                            if (docs != FieldWaiting) {
                                if (!docs) {
                                    docs = new ListField<Document>();
                                    that.props.Document.Set(KeyStore.Data, docs)
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
