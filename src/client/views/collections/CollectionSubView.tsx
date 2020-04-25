import { action, computed, IReactionDisposer, reaction } from "mobx";
import CursorField from "../../../new_fields/CursorField";
import { Doc, DocListCast, Opt, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Cast, StrCast } from "../../../new_fields/Types";
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
import { basename } from 'path';
import { GooglePhotos } from "../../apis/google_docs/GooglePhotosClientUtils";
import { ImageUtils } from "../../util/Import & Export/ImageUtils";
import { Networking } from "../../Network";
import { GestureUtils } from "../../../pen-gestures/GestureUtils";
import { InteractionUtils } from "../../util/InteractionUtils";
import { Upload } from "../../../server/SharedMediaTypes";

export interface CollectionViewProps extends FieldViewProps {
    addDocument: (document: Doc) => boolean;
    removeDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => boolean;
    PanelWidth: () => number;
    PanelHeight: () => number;
    VisibleHeight?: () => number;
    setPreviewCursor?: (func: (x: number, y: number, drag: boolean) => void) => void;
    rootSelected: (outsideReaction?: boolean) => boolean;
    fieldKey: string;
    NativeWidth: () => number;
    NativeHeight: () => number;
}

export interface SubCollectionViewProps extends CollectionViewProps {
    CollectionView: Opt<CollectionView>;
    children?: never | (() => JSX.Element[]) | React.ReactNode;
    freezeChildDimensions?: boolean; // used by TimeView to coerce documents to treat their width height as their native width/height
    overrideDocuments?: Doc[]; // used to override the documents shown by the sub collection to an explicit list (see LinkBox)
    ignoreFields?: string[]; // used in TreeView to ignore specified fields (see LinkBox)
    isAnnotationOverlay?: boolean;
    annotationsKey: string;
    layoutEngine?: () => string;
}

export function CollectionSubView<T, X>(schemaCtor: (doc: Doc) => T, moreProps?: X) {
    class CollectionSubView extends DocComponent<X & SubCollectionViewProps, T>(schemaCtor) {
        private dropDisposer?: DragManager.DragDropDisposer;
        private gestureDisposer?: GestureUtils.GestureEventDisposer;
        protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;
        private _childLayoutDisposer?: IReactionDisposer;
        protected _mainCont?: HTMLDivElement;
        protected createDashEventsTarget = (ele: HTMLDivElement) => { //used for stacking and masonry view
            this.dropDisposer?.();
            this.gestureDisposer?.();
            this.multiTouchDisposer?.();
            if (ele) {
                this._mainCont = ele;
                this.dropDisposer = DragManager.MakeDropTarget(ele, this.onInternalDrop.bind(this));
                this.gestureDisposer = GestureUtils.MakeGestureTarget(ele, this.onGesture.bind(this));
                this.multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(ele, this.onTouchStart.bind(this));
            }
        }
        protected CreateDropTarget(ele: HTMLDivElement) { //used in schema view
            this.createDashEventsTarget(ele);
        }

        componentDidMount() {
            this._childLayoutDisposer = reaction(() => ({ childDocs: this.childDocs, childLayout: Cast(this.props.Document.childLayout, Doc) }),
                ({ childDocs, childLayout }) => {
                    if (childLayout instanceof Doc) {
                        childDocs.map(doc => {
                            doc.layout_fromParent = childLayout;
                            doc.layoutKey = "layout_fromParent";
                        });
                    }
                    else if (!(childLayout instanceof Promise)) {
                        childDocs.filter(d => !d.isTemplateForField).map(doc => doc.layoutKey === "layout_fromParent" && (doc.layoutKey = "layout"));
                    }
                }, { fireImmediately: true });

        }
        componentWillUnmount() {
            this.gestureDisposer?.();
            this.multiTouchDisposer?.();
            this._childLayoutDisposer?.();
        }

        @computed get dataDoc() {
            return (this.props.DataDoc instanceof Doc && this.props.Document.isTemplateForField ? Doc.GetProto(this.props.DataDoc) :
                this.props.Document.resolvedDataDoc ? this.props.Document : Doc.GetProto(this.props.Document)); // if the layout document has a resolvedDataDoc, then we don't want to get its parent which would be the unexpanded template
        }

        rootSelected = (outsideReaction?: boolean) => {
            return this.props.isSelected(outsideReaction) || (this.rootDoc && this.props.rootSelected(outsideReaction));
        }

        // The data field for rendering this collection will be on the this.props.Document unless we're rendering a template in which case we try to use props.DataDoc.
        // When a document has a DataDoc but it's not a template, then it contains its own rendering data, but needs to pass the DataDoc through
        // to its children which may be templates.
        // If 'annotationField' is specified, then all children exist on that field of the extension document, otherwise, they exist directly on the data document under 'fieldKey'
        @computed get dataField() {
            return this.dataDoc[this.props.fieldKey + (this.props.annotationsKey ? "-" + this.props.annotationsKey : "")];
        }

        get childLayoutPairs(): { layout: Doc; data: Doc; }[] {
            const { Document, DataDoc } = this.props;
            const validPairs = this.childDocs.map(doc => Doc.GetLayoutDataDocPair(Document, !this.props.annotationsKey ? DataDoc : undefined, doc)).filter(pair => pair.layout);
            return validPairs.map(({ data, layout }) => ({ data: data as Doc, layout: layout! })); // this mapping is a bit of a hack to coerce types
        }
        get childDocList() {
            return Cast(this.dataField, listSpec(Doc));
        }
        @computed get childDocs() {
            const docFilters = this.props.ignoreFields?.includes("_docFilters") ? [] : Cast(this.props.Document._docFilters, listSpec("string"), []);
            const docRangeFilters = this.props.ignoreFields?.includes("_docRangeFilters") ? [] : Cast(this.props.Document._docRangeFilters, listSpec("string"), []);
            const filterFacets: { [key: string]: { [value: string]: string } } = {};  // maps each filter key to an object with value=>modifier fields
            for (let i = 0; i < docFilters.length; i += 3) {
                const [key, value, modifiers] = docFilters.slice(i, i + 3);
                if (!filterFacets[key]) {
                    filterFacets[key] = {};
                }
                filterFacets[key][value] = modifiers;
            }

            let rawdocs: (Doc | Promise<Doc>)[] = [];
            if (this.dataField instanceof Doc) { // if collection data is just a document, then promote it to a singleton list;
                rawdocs = [this.dataField];
            } else if (Cast(this.dataField, listSpec(Doc), null)) { // otherwise, if the collection data is a list, then use it.  
                rawdocs = Cast(this.dataField, listSpec(Doc), null);
            } else {   // Finally, if it's not a doc or a list and the document is a template, we try to render the root doc.
                // For example, if an image doc is rendered with a slide template, the template will try to render the data field as a collection.
                // Since the data field is actually an image, we set the list of documents to the singleton of root document's proto which will be an image.
                const rootDoc = Cast(this.props.Document.rootDocument, Doc, null);
                rawdocs = rootDoc && !this.props.annotationsKey ? [Doc.GetProto(rootDoc)] : [];
            }
            const docs = rawdocs.filter(d => !(d instanceof Promise)).map(d => d as Doc);
            const viewSpecScript = Cast(this.props.Document.viewSpecScript, ScriptField);
            const childDocs = viewSpecScript ? docs.filter(d => viewSpecScript.script.run({ doc: d }, console.log).result) : docs;

            const filteredDocs = docFilters.length && !this.props.dontRegisterView ? childDocs.filter(d => {
                for (const facetKey of Object.keys(filterFacets)) {
                    const facet = filterFacets[facetKey];
                    const satisfiesFacet = Object.keys(facet).some(value =>
                        (facet[value] === "x") !== Doc.matchFieldValue(d, facetKey, value));
                    if (!satisfiesFacet) {
                        return false;
                    }
                }
                return true;
            }) : childDocs;
            const rangeFilteredDocs = filteredDocs.filter(d => {
                for (let i = 0; i < docRangeFilters.length; i += 3) {
                    const key = docRangeFilters[i];
                    const min = Number(docRangeFilters[i + 1]);
                    const max = Number(docRangeFilters[i + 2]);
                    const val = Cast(d[key], "number", null);
                    if (val !== undefined && (val < min || val > max)) {
                        return false;
                    }
                }
                return true;
            });
            return rangeFilteredDocs;
        }

        @action
        protected async setCursorPosition(position: [number, number]) {
            let ind;
            const doc = this.props.Document;
            const id = CurrentUserUtils.id;
            const email = Doc.CurrentUserEmail;
            const pos = { x: position[0], y: position[1] };
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
                    const entry = new CursorField({ metadata: { id: id, identifier: email, timestamp: Date.now() }, position: pos });
                    cursors.push(entry);
                }
            }
        }

        @undoBatch
        protected onGesture(e: Event, ge: GestureUtils.GestureEvent) {
        }

        @undoBatch
        @action
        protected onInternalDrop(e: Event, de: DragManager.DropEvent): boolean {
            const docDragData = de.complete.docDragData;
            (this.props.Document.dropConverter instanceof ScriptField) &&
                this.props.Document.dropConverter.script.run({ dragData: docDragData }); /// bcz: check this 
            if (docDragData) {
                let added = false;
                if (docDragData.dropAction || docDragData.userDropAction) {
                    added = docDragData.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d) || added, false);
                } else if (docDragData.moveDocument) {
                    const movedDocs = docDragData.draggedDocuments;
                    added = movedDocs.reduce((added: boolean, d, i) =>
                        docDragData.droppedDocuments[i] !== d ? this.props.addDocument(docDragData.droppedDocuments[i]) :
                            docDragData.moveDocument?.(d, this.props.Document, this.props.addDocument) || added, false);
                } else {
                    added = docDragData.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d) || added, false);
                }
                e.stopPropagation();
                return added;
            }
            else if (de.complete.annoDragData) {
                e.stopPropagation();
                return this.props.addDocument(de.complete.annoDragData.dropDocument);
            }
            return false;
        }

        @undoBatch
        @action
        protected async onExternalDrop(e: React.DragEvent, options: DocumentOptions, completed?: () => void) {
            if (e.ctrlKey) {
                e.stopPropagation(); // bcz: this is a hack to stop propagation when dropping an image on a text document with shift+ctrl
                return;
            }

            const { dataTransfer } = e;
            const html = dataTransfer.getData("text/html");
            const text = dataTransfer.getData("text/plain");

            if (text && text.startsWith("<div")) {
                return;
            }

            e.stopPropagation();
            e.preventDefault();
            const { addDocument } = this.props;
            if (!addDocument) {
                alert("this.props.addDocument does not exist. Aborting drop operation.");
                return;
            }

            if (html) {
                if (FormattedTextBox.IsFragment(html)) {
                    const href = FormattedTextBox.GetHref(html);
                    if (href) {
                        const docid = FormattedTextBox.GetDocFromUrl(href);
                        if (docid) { // prosemirror text containing link to dash document
                            DocServer.GetRefField(docid).then(f => {
                                if (f instanceof Doc) {
                                    if (options.x || options.y) { f.x = options.x; f.y = options.y; } // should be in CollectionFreeFormView
                                    (f instanceof Doc) && addDocument(f);
                                }
                            });
                        } else {
                            addDocument(Docs.Create.WebDocument(href, { ...options, title: href }));
                        }
                    } else if (text) {
                        addDocument(Docs.Create.TextDocument(text, { ...options, _width: 100, _height: 25 }));
                    }
                    return;
                }
                if (!html.startsWith("<a")) {
                    const tags = html.split("<");
                    if (tags[0] === "") tags.splice(0, 1);
                    let img = tags[0].startsWith("img") ? tags[0] : tags.length > 1 && tags[1].startsWith("img") ? tags[1] : "";
                    const cors = img.includes("corsProxy") ? img.match(/http.*corsProxy\//)![0] : "";
                    img = cors ? img.replace(cors, "") : img;
                    if (img) {
                        const split = img.split("src=\"")[1].split("\"")[0];
                        let source = split;
                        if (split.startsWith("data:image") && split.includes("base64")) {
                            const [{ accessPaths }] = await Networking.PostToServer("/uploadRemoteImage", { sources: [split] });
                            source = Utils.prepend(accessPaths.agnostic.client);
                        }
                        if (source.startsWith("http")) {
                            const doc = Docs.Create.ImageDocument(source, { ...options, _width: 300 });
                            ImageUtils.ExtractExif(doc);
                            addDocument(doc);
                        }
                        return;
                    } else {
                        const path = window.location.origin + "/doc/";
                        if (text.startsWith(path)) {
                            const docid = text.replace(Utils.prepend("/doc/"), "").split("?")[0];
                            DocServer.GetRefField(docid).then(f => {
                                if (f instanceof Doc) {
                                    if (options.x || options.y) { f.x = options.x; f.y = options.y; } // should be in CollectionFreeFormView
                                    (f instanceof Doc) && this.props.addDocument(f);
                                }
                            });
                        } else {
                            const htmlDoc = Docs.Create.HtmlDocument(html, { ...options, title: "-web page-", _width: 300, _height: 300 });
                            Doc.GetProto(htmlDoc)["data-text"] = text;
                            this.props.addDocument(htmlDoc);
                        }
                        return;
                    }
                }
            }

            if (text) {
                if (text.includes("www.youtube.com/watch")) {
                    const url = text.replace("youtube.com/watch?v=", "youtube.com/embed/");
                    addDocument(Docs.Create.VideoDocument(url, {
                        ...options,
                        title: url,
                        _width: 400,
                        _height: 315,
                        _nativeWidth: 600,
                        _nativeHeight: 472.5
                    }));
                    return;
                }
                let matches: RegExpExecArray | null;
                if ((matches = /(https:\/\/)?docs\.google\.com\/document\/d\/([^\\]+)\/edit/g.exec(text)) !== null) {
                    const newBox = Docs.Create.TextDocument("", { ...options, _width: 400, _height: 200, title: "Awaiting title from Google Docs..." });
                    const proto = newBox.proto!;
                    const documentId = matches[2];
                    proto[GoogleRef] = documentId;
                    proto.data = "Please select this document and then click on its pull button to load its contents from from Google Docs...";
                    proto.backgroundColor = "#eeeeff";
                    addDocument(newBox);
                    return;
                }
                if ((matches = /(https:\/\/)?photos\.google\.com\/(u\/3\/)?album\/([^\\]+)/g.exec(text)) !== null) {
                    const albumId = matches[3];
                    const mediaItems = await GooglePhotos.Query.AlbumSearch(albumId);
                    console.log(mediaItems);
                    return;
                }
            }

            const { items } = e.dataTransfer;
            const { length } = items;
            const files: File[] = [];
            const generatedDocuments: Doc[] = [];
            if (!length) {
                alert("No uploadable content found.");
                return;
            }

            const batch = UndoManager.StartBatch("collection view drop");
            for (let i = 0; i < length; i++) {
                const item = e.dataTransfer.items[i];
                if (item.kind === "string" && item.type.includes("uri")) {
                    const stringContents = await new Promise<string>(resolve => item.getAsString(resolve));
                    const type = "html";// (await rp.head(Utils.CorsProxy(stringContents)))["content-type"];
                    if (type) {
                        const doc = await Docs.Get.DocumentFromType(type, stringContents, options);
                        doc && generatedDocuments.push(doc);
                    }
                }
                if (item.kind === "file") {
                    const file = item.getAsFile();
                    file && file.type && files.push(file);
                }
            }
            for (const { source: { name, type }, result } of await Networking.UploadFilesToServer(files)) {
                if (result instanceof Error) {
                    alert(`Upload failed: ${result.message}`);
                    return;
                }
                const full = { ...options, _width: 400, title: name };
                const pathname = Utils.prepend(result.accessPaths.agnostic.client);
                const doc = await Docs.Get.DocumentFromType(type, pathname, full);
                if (!doc) {
                    continue;
                }
                const proto = Doc.GetProto(doc);
                proto.text = result.rawText;
                proto.fileUpload = basename(pathname).replace("upload_", "").replace(/\.[a-z0-9]*$/, "");
                if (Upload.isImageInformation(result)) {
                    proto["data-nativeWidth"] = (result.nativeWidth > result.nativeHeight) ? 400 * result.nativeWidth / result.nativeHeight : 400;
                    proto["data-nativeHeight"] = (result.nativeWidth > result.nativeHeight) ? 400 : 400 / (result.nativeWidth / result.nativeHeight);
                    proto.contentSize = result.contentSize;
                }
                generatedDocuments.push(doc);
            }
            if (generatedDocuments.length) {
                const set = generatedDocuments.length > 1 && generatedDocuments.map(d => Doc.iconify(d));
                if (set) {
                    addDocument(Doc.pileup(generatedDocuments, options.x!, options.y!));
                } else {
                    generatedDocuments.forEach(addDocument);
                }
                completed?.();
            } else {
                if (text && !text.includes("https://")) {
                    addDocument(Docs.Create.TextDocument(text, { ...options, _width: 400, _height: 315 }));
                }
            }
            batch.end();
        }
    }

    return CollectionSubView;
}

