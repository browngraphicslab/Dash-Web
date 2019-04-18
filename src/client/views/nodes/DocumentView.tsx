import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faObjectGroup, faStickyNote, faFilePdf, faFilm, faImage } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { Field, Opt } from "../../../fields/Field";
import { Key } from "../../../fields/Key";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { ServerUtils } from "../../../server/ServerUtil";
import { emptyFunction, Utils } from "../../../Utils";
import { Documents } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { CollectionView } from "../collections/CollectionView";
import { MINIMIZED_ICON_SIZE } from "../../views/globalCssVariables.scss";
import { ContextMenu } from "../ContextMenu";
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import React = require("react");


library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);

export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    Document: Document;
    addDocument?: (doc: Document, allowDuplicates?: boolean) => boolean;
    removeDocument?: (doc: Document) => boolean;
    moveDocument?: (doc: Document, targetCollection: Document, addDocument: (document: Document) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    isTopMost: boolean;
    ContentScaling: () => number;
    PanelWidth: () => number;
    PanelHeight: () => number;
    focus: (doc: Document) => void;
    selectOnLoad: boolean;
    parentActive: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
}
export interface JsxArgs extends DocumentViewProps {
    Keys: { [name: string]: Key };
    Fields: { [name: string]: Field };
}

/*
This function is pretty much a hack that lets us fill out the fields in JsxArgs with something that
jsx-to-string can recover the jsx from
Example usage of this function:
    public static LayoutString() {
        let args = FakeJsxArgs(["Data"]);
        return jsxToString(
            <CollectionFreeFormView
                doc={args.Document}
                fieldKey={args.Keys.Data}
                DocumentViewForField={args.DocumentView} />,
            { useFunctionCode: true, functionNameOnly: true }
        )
    }
*/
export function FakeJsxArgs(keys: string[], fields: string[] = []): JsxArgs {
    let Keys: { [name: string]: any } = {};
    let Fields: { [name: string]: any } = {};
    for (const key of keys) {
        Object.defineProperty(emptyFunction, "name", { value: key + "Key" });
        Keys[key] = emptyFunction;
    }
    for (const field of fields) {
        Object.defineProperty(emptyFunction, "name", { value: field });
        Fields[field] = emptyFunction;
    }
    let args: JsxArgs = {
        Document: function Document() { },
        DocumentView: function DocumentView() { },
        Keys,
        Fields
    } as any;
    return args;
}

@observer
export class DocumentView extends React.Component<DocumentViewProps> {
    private _downX: number = 0;
    private _downY: number = 0;
    private _mainCont = React.createRef<HTMLDivElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;

    public get ContentDiv() { return this._mainCont.current; }
    @computed get active(): boolean { return SelectionManager.IsSelected(this) || this.props.parentActive(); }
    @computed get topMost(): boolean { return this.props.isTopMost; }
    @computed get layout(): string { return this.props.Document.GetText(KeyStore.Layout, "<p>Error loading layout data</p>"); }
    @computed get layoutKeys(): Key[] { return this.props.Document.GetData(KeyStore.LayoutKeys, ListField, new Array<Key>()); }
    @computed get layoutFields(): Key[] { return this.props.Document.GetData(KeyStore.LayoutFields, ListField, new Array<Key>()); }

    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        if (e.button === 2 && !this.isSelected()) {
            return;
        }
        if (e.shiftKey && e.buttons === 2) {
            if (this.props.isTopMost) {
                this.startDragging(e.pageX, e.pageY, e.altKey || e.ctrlKey);
            } else {
                CollectionDockingView.Instance.StartOtherDrag([this.props.Document], e);
            }
            e.stopPropagation();
        } else {
            if (this.active) {
                e.stopPropagation();
                document.removeEventListener("pointermove", this.onPointerMove);
                document.addEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
                document.addEventListener("pointerup", this.onPointerUp);
            }
        }
    }

    componentDidMount() {
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
        runInAction(() => DocumentManager.Instance.DocumentViews.push(this));
    }

    componentDidUpdate() {
        if (this._dropDisposer) {
            this._dropDisposer();
        }
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
    }

    componentWillUnmount() {
        if (this._dropDisposer) {
            this._dropDisposer();
        }
        runInAction(() => DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1));
    }

    startDragging(x: number, y: number, dropAliasOfDraggedDoc: boolean) {
        if (this._mainCont.current) {
            const [left, top] = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            let dragData = new DragManager.DocumentDragData([this.props.Document]);
            dragData.aliasOnDrop = dropAliasOfDraggedDoc;
            dragData.xOffset = x - left;
            dragData.yOffset = y - top;
            dragData.moveDocument = this.props.moveDocument;
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, {
                handlers: {
                    dragComplete: action(emptyFunction)
                },
                hideSource: !dropAliasOfDraggedDoc
            });
        }
    }

    onPointerMove = (e: PointerEvent): void => {
        if (e.cancelBubble) {
            return;
        }
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            if (!this.topMost || e.buttons === 2 || e.altKey) {
                this.startDragging(this._downX, this._downY, e.ctrlKey || e.altKey);
            }
        }
        e.stopPropagation();
        e.preventDefault();
    }
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        e.stopPropagation();
        if (!SelectionManager.IsSelected(this) && e.button !== 2 &&
            Math.abs(e.clientX - this._downX) < 4 && Math.abs(e.clientY - this._downY) < 4) {
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }
    stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    }

    deleteClicked = (): void => {
        this.props.removeDocument && this.props.removeDocument(this.props.Document);
    }

    fieldsClicked = (e: React.MouseEvent): void => {
        if (this.props.addDocument) {
            this.props.addDocument(Documents.KVPDocument(this.props.Document, { width: 300, height: 300 }), false);
        }
    }
    fullScreenClicked = (e: React.MouseEvent): void => {
        CollectionDockingView.Instance.OpenFullScreen((this.props.Document.GetPrototype() as Document).MakeDelegate());
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({ description: "Close Full Screen", event: this.closeFullScreenClicked });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
    }

    closeFullScreenClicked = (e: React.MouseEvent): void => {
        CollectionDockingView.Instance.CloseFullScreen();
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
    }

    @action
    public minimize = (where: number[]): void => {
        this.props.Document.SetBoolean(KeyStore.Minimized, true);
        if (where[0] !== 0 || where[1] !== 0)
            this.props.Document.SetNumber(KeyStore.MinimizedX, where[0]);
        if (where[1] !== 0 || where[0] !== 0)
            this.props.Document.SetNumber(KeyStore.MinimizedY, where[1]);
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc: Document = de.data.linkSourceDocument;
            let destDoc: Document = this.props.Document;
            let linkDoc: Document = new Document();

            destDoc.GetTAsync(KeyStore.Prototype, Document).then(protoDest =>
                sourceDoc.GetTAsync(KeyStore.Prototype, Document).then(protoSrc =>
                    runInAction(() => {
                        let batch = UndoManager.StartBatch("document view drop");
                        linkDoc.SetText(KeyStore.Title, "New Link");
                        linkDoc.SetText(KeyStore.LinkDescription, "");
                        linkDoc.SetText(KeyStore.LinkTags, "Default");

                        let dstTarg = protoDest ? protoDest : destDoc;
                        let srcTarg = protoSrc ? protoSrc : sourceDoc;
                        linkDoc.Set(KeyStore.LinkedToDocs, dstTarg);
                        linkDoc.Set(KeyStore.LinkedFromDocs, srcTarg);
                        const prom1 = new Promise(resolve => dstTarg.GetOrCreateAsync(
                            KeyStore.LinkedFromDocs,
                            ListField,
                            field => {
                                (field as ListField<Document>).Data.push(linkDoc);
                                resolve();
                            }
                        ));
                        const prom2 = new Promise(resolve => srcTarg.GetOrCreateAsync(
                            KeyStore.LinkedToDocs,
                            ListField,
                            field => {
                                (field as ListField<Document>).Data.push(linkDoc);
                                resolve();
                            }
                        ));
                        Promise.all([prom1, prom2]).finally(() => batch.end());
                    })
                )
            );
            e.stopPropagation();
        }
    }

    onDrop = (e: React.DragEvent) => {
        let text = e.dataTransfer.getData("text/plain");
        if (!e.isDefaultPrevented() && text && text.startsWith("<div")) {
            let oldLayout = this.props.Document.GetText(KeyStore.Layout, "");
            let layout = text.replace("{layout}", oldLayout);
            this.props.Document.SetText(KeyStore.Layout, layout);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onContextMenu = (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3 ||
            e.isDefaultPrevented()) {
            e.preventDefault();
            return;
        }
        e.preventDefault();

        !this.isMinimized() && ContextMenu.Instance.addItem({ description: "Minimize", event: () => this.minimize([0, 0]) });
        ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked });
        ContextMenu.Instance.addItem({ description: "Fields", event: this.fieldsClicked });
        ContextMenu.Instance.addItem({ description: "Center", event: () => this.props.focus(this.props.Document) });
        ContextMenu.Instance.addItem({ description: "Open Right", event: () => CollectionDockingView.Instance.AddRightSplit(this.props.Document) });
        ContextMenu.Instance.addItem({ description: "Copy URL", event: () => Utils.CopyText(ServerUtils.prepend("/doc/" + this.props.Document.Id)) });
        ContextMenu.Instance.addItem({ description: "Copy ID", event: () => Utils.CopyText(this.props.Document.Id) });
        //ContextMenu.Instance.addItem({ description: "Docking", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Docking) })
        ContextMenu.Instance.addItem({ description: "Delete", event: this.deleteClicked });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
        if (!SelectionManager.IsSelected(this))
            SelectionManager.SelectDoc(this, false);
    }

    @action
    expand = (e: React.MouseEvent) => { this.props.Document.SetBoolean(KeyStore.Minimized, false); SelectionManager.SelectDoc(this, e.ctrlKey); }
    isMinimized = () => this.props.Document.GetBoolean(KeyStore.Minimized, false);
    isSelected = () => SelectionManager.IsSelected(this);
    select = (ctrlPressed: boolean) => SelectionManager.SelectDoc(this, ctrlPressed);

    @computed get nativeWidth() { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight() { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }
    @computed get contents() { return (<DocumentContentsView {...this.props} isSelected={this.isSelected} select={this.select} layoutKey={KeyStore.Layout} />); }

    @computed get minimizedIcon() {
        let button = this.layout.indexOf("PDFBox") !== -1 ? faFilePdf :
            this.layout.indexOf("ImageBox") !== -1 ? faImage :
                this.layout.indexOf("Formatted") !== -1 ? faStickyNote :
                    this.layout.indexOf("Video") !== -1 ? faFilm :
                        this.layout.indexOf("Collection") !== -1 ? faObjectGroup :
                            faCaretUp;
        return <FontAwesomeIcon icon={button} style={{ width: MINIMIZED_ICON_SIZE, height: MINIMIZED_ICON_SIZE }} className="documentView-minimizedIcon" />
    }

    render() {
        var scaling = this.props.ContentScaling();
        var nativeHeight = this.nativeHeight > 0 ? this.nativeHeight.toString() + "px" : "100%";
        var nativeWidth = this.nativeWidth > 0 ? this.nativeWidth.toString() + "px" : "100%";

        if (this.isMinimized()) {
            return (
                <div className="minimized-box" ref={this._mainCont} onClick={this.expand} onDrop={this.onDrop} onPointerDown={this.onPointerDown} >
                    {this.minimizedIcon}
                </div>);
        }
        return (
            <div className={`documentView-node${this.props.isTopMost ? "-topmost" : ""}`}
                ref={this._mainCont}
                style={{
                    background: this.props.Document.GetText(KeyStore.BackgroundColor, ""),
                    width: nativeWidth, height: nativeHeight,
                    transform: `scale(${scaling}, ${scaling})`
                }}
                onDrop={this.onDrop} onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown}
            >
                {this.contents}
            </div>
        );
    }
}
