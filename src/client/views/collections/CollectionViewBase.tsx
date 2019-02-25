import { action, computed } from "mobx";
import { Document } from "../../../fields/Document";
import { ListField } from "../../../fields/ListField";
import React = require("react");
import { KeyStore } from "../../../fields/KeyStore";
import { Opt, FieldWaiting } from "../../../fields/Field";
import { undoBatch } from "../../util/UndoManager";
import { DragManager } from "../../util/DragManager";
import { DocumentView } from "../nodes/DocumentView";
import { Documents, DocumentOptions } from "../../documents/Documents";
import { Key } from "../../../fields/Key";
import { Transform } from "../../util/Transform";


export interface CollectionViewProps {
    fieldKey: Key;
    Document: Document;
    ScreenToLocalTransform: () => Transform;
    isSelected: () => boolean;
    isTopMost: boolean;
    select: (ctrlPressed: boolean) => void;
    bindings: any;
}
export interface SubCollectionViewProps extends CollectionViewProps {
    active: () => boolean;
    addDocument: (doc: Document) => void;
    removeDocument: (doc: Document) => boolean;
    CollectionView: any;
}

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

    @undoBatch
    @action
    protected drop(e: Event, de: DragManager.DropEvent) {
        const doc: DocumentView = de.data["document"];
        if (doc.props.ContainingCollectionView && doc.props.ContainingCollectionView !== this.props.CollectionView) {
            if (doc.props.RemoveDocument) {
                doc.props.RemoveDocument(doc.props.Document);
            }
            this.props.addDocument(doc.props.Document);
        }
        e.stopPropagation();
    }

    @action
    protected onDrop(e: React.DragEvent, options: DocumentOptions): void {
        e.stopPropagation()
        e.preventDefault()
        let that = this;

        let html = e.dataTransfer.getData("text/html");
        let text = e.dataTransfer.getData("text/plain");
        if (html && html.indexOf("<img") != 0) {
            let htmlDoc = Documents.HtmlDocument(html, { ...options });
            htmlDoc.SetText(KeyStore.DocumentText, text);
            this.props.addDocument(htmlDoc);
            return;
        }

        for (let i = 0; i < e.dataTransfer.items.length; i++) {
            let item = e.dataTransfer.items[i];
            if (item.kind === "string" && item.type.indexOf("uri") != -1) {
                e.dataTransfer.items[i].getAsString(function (s) {
                    action(() => {
                        var img = Documents.ImageDocument(s, { ...options, nativeWidth: 300, width: 300, })

                        let docs = that.props.Document.GetT(KeyStore.Data, ListField);
                        if (docs != FieldWaiting) {
                            if (!docs) {
                                docs = new ListField<Document>();
                                that.props.Document.Set(KeyStore.Data, docs)
                            }
                            docs.Data.push(img);
                        }
                    })()

                })
            }
            if (item.kind == "file" && item.type.indexOf("image")) {
                let fReader = new FileReader()
                let file = item.getAsFile();

                fReader.addEventListener("load", action("drop", () => {
                    if (fReader.result) {
                        let url = "" + fReader.result;
                        let doc = Documents.ImageDocument(url, options)
                        let docs = that.props.Document.GetT(KeyStore.Data, ListField);
                        if (docs != FieldWaiting) {
                            if (!docs) {
                                docs = new ListField<Document>();
                                that.props.Document.Set(KeyStore.Data, docs)
                            }
                            docs.Data.push(doc);
                        }
                    }
                }), false)

                if (file) {
                    fReader.readAsDataURL(file)
                }
            }
        }
    }
}
