import { action, runInAction, observable, computed } from "mobx";
import { Document } from "../../../fields/Document";
import { ListField } from "../../../fields/ListField";
import React = require("react");
import { KeyStore } from "../../../fields/KeyStore";
import { FieldWaiting } from "../../../fields/Field";
import { undoBatch } from "../../util/UndoManager";
import { DragManager } from "../../util/DragManager";
import { DocumentView } from "../nodes/DocumentView";
import { Documents, DocumentOptions } from "../../documents/Documents";
import { Key } from "../../../fields/Key";
import { Transform } from "../../util/Transform";
import { CollectionView } from "./CollectionView";
import { RouteStore } from "../../../server/RouteStore";
import { TupleField } from "../../../fields/TupleField";
import { DashUserModel } from "../../../server/authentication/models/user_model";
import { UserUtils } from "../../../server/authentication/models/user_utils";

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
    addDocument: (doc: Document) => void;
    removeDocument: (doc: Document) => boolean;
    CollectionView: CollectionView;
}

export type CursorEntry = TupleField<string, [number, number]>;

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
        let id = UserUtils.currentUserId;
        if (id) {
            doc.GetOrCreateAsync<ListField<CursorEntry>>(KeyStore.Cursors, ListField, field => {
                let cursors = field.Data;
                if (cursors.length > 0 && (ind = cursors.findIndex(entry => entry.Data[0] === id)) > -1) {
                    cursors[ind].Data[1] = position;
                } else {
                    let entry = new TupleField<string, [number, number]>([id, position]);
                    cursors.push(entry);
                }
            })


        }
    }

    protected getCursors(): CursorEntry[] {
        let doc = this.props.Document;
        let id = UserUtils.currentUserId;
        let cursors = doc.GetList<CursorEntry>(KeyStore.Cursors, []);
        let notMe = cursors.filter(entry => entry.Data[0] !== id);
        return id ? notMe : [];
    }

    @undoBatch
    @action
    protected drop(e: Event, de: DragManager.DropEvent) {
        const docView: DocumentView = de.data["documentView"];
        const doc: Document = de.data["document"];

        if (docView && (!docView.props.ContainingCollectionView || docView.props.ContainingCollectionView !== this.props.CollectionView)) {
            if (docView.props.RemoveDocument) {
                docView.props.RemoveDocument(docView.props.Document);
            }
            this.props.addDocument(docView.props.Document);
        } else if (doc) {
            this.props.removeDocument(doc);
            this.props.addDocument(doc);
        }
        e.stopPropagation();
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
            this.props.addDocument(htmlDoc);
            return;
        }

        console.log(e.dataTransfer.items.length);

        for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const upload = window.location.origin + RouteStore.upload;
            let item = e.dataTransfer.items[i];
            if (item.kind === "string" && item.type.indexOf("uri") != -1) {
                e.dataTransfer.items[i].getAsString(action((s: string) => this.props.addDocument(Documents.WebDocument(s, options))))
            }
            let type = item.type
            console.log(type)
            if (item.kind == "file") {
                let fReader = new FileReader()
                let file = item.getAsFile();
                let formData = new FormData()

                if (file) {
                    formData.append('file', file)
                }

                fetch(upload, {
                    method: 'POST',
                    body: formData
                })
                    .then((res: Response) => {
                        return res.json()
                    }).then(json => {

                        json.map((file: any) => {
                            let path = window.location.origin + file
                            runInAction(() => {
                                var doc: any;

                                if (type.indexOf("image") !== -1) {
                                    doc = Documents.ImageDocument(path, { ...options, nativeWidth: 200, width: 200, })
                                }
                                if (type.indexOf("video") !== -1) {
                                    doc = Documents.VideoDocument(path, { ...options, nativeWidth: 300, width: 300, })
                                }
                                if (type.indexOf("audio") !== -1) {
                                    doc = Documents.AudioDocument(path, { ...options, nativeWidth: 300, width: 300, })
                                }
                                if (type.indexOf("pdf") !== -1) {
                                    doc = Documents.PdfDocument(path, { ...options, nativeWidth: 300, width: 300, })
                                }
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
