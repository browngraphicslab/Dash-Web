import { action, computed } from "mobx";
import * as rp from 'request-promise';
import CursorField from "../../../new_fields/CursorField";
import { Doc, DocListCast, Opt } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { BoolCast, Cast, PromiseValue } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { RouteStore } from "../../../server/RouteStore";
import { DocServer } from "../../DocServer";
import { Docs, DocumentOptions, DocumentType } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { FieldViewProps } from "../nodes/FieldView";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { CollectionPDFView } from "./CollectionPDFView";
import { CollectionVideoView } from "./CollectionVideoView";
import { CollectionView } from "./CollectionView";
import React = require("react");
import { MainView } from "../MainView";
import { Utils } from "../../../Utils";
import { DocComponent } from "../DocComponent";
import { ScriptField } from "../../../new_fields/ScriptField";

export interface CollectionViewProps extends FieldViewProps {
    addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    PanelWidth: () => number;
    PanelHeight: () => number;
    chromeCollapsed: boolean;
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

        @computed get extensionDoc() { return Doc.resolvedFieldDataDoc(BoolCast(this.props.Document.isTemplate) && this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey, this.props.fieldExt); }


        get childDocs() {
            let self = this;
            //TODO tfs: This might not be what we want?
            //This linter error can't be fixed because of how js arguments work, so don't switch this to filter(FieldValue)
            let docs = DocListCast(this.extensionDoc[this.props.fieldExt ? this.props.fieldExt : this.props.fieldKey]);
            let viewSpecScript = Cast(this.props.Document.viewSpecScript, ScriptField); 
            if (viewSpecScript) {
                let script = viewSpecScript.script;
                docs = docs.filter(d => {
                    let res = script.run({ doc: d });
                    if (res.success) {
                        return res.result;
                    }
                });
            }
            return docs;
        }
        get childDocList() {
            //TODO tfs: This might not be what we want?
            //This linter error can't be fixed because of how js arguments work, so don't switch this to filter(FieldValue)
            return Cast(this.extensionDoc[this.props.fieldExt ? this.props.fieldExt : this.props.fieldKey], listSpec(Doc));
        }

        @action
        protected async setCursorPosition(position: [number, number]) {
            let ind;
            let doc = this.props.Document;
            let id = CurrentUserUtils.id;
            let email = CurrentUserUtils.email;
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
                    let movedDocs = de.data.options === this.props.Document[Id] ? de.data.draggedDocuments : de.data.droppedDocuments;
                    added = movedDocs.reduce((added: boolean, d) =>
                        de.data.moveDocument(d, this.props.Document, this.props.addDocument) || added, false);
                } else {
                    added = de.data.droppedDocuments.reduce((added: boolean, d) => {
                        let moved = this.props.addDocument(d);
                        return moved || added;
                    }, false);
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

            if (promises.length) {
                Promise.all(promises).finally(() => { completed && completed(); batch.end(); });
            } else {
                batch.end();
            }
        }
    }
    return CollectionSubView;
}

