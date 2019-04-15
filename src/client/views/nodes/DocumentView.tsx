import { action, computed, runInAction } from "mobx";
import { observer } from "mobx-react";
import { BooleanField } from "../../../fields/BooleanField";
import { Document } from "../../../fields/Document";
import { Field, FieldWaiting, Opt } from "../../../fields/Field";
import { Key } from "../../../fields/Key";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { TextField } from "../../../fields/TextField";
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
import { ContextMenu } from "../ContextMenu";
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import React = require("react");


export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    Document: Document;
    opacity: number;
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
    onActiveChanged: (isActive: boolean) => void;
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
        let fn = emptyFunction;
        Object.defineProperty(fn, "name", { value: key + "Key" });
        Keys[key] = fn;
    }
    for (const field of fields) {
        let fn = emptyFunction;
        Object.defineProperty(fn, "name", { value: field });
        Fields[field] = fn;
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
    private _mainCont = React.createRef<HTMLDivElement>();
    public get ContentRef() {
        return this._mainCont;
    }
    private _downX: number = 0;
    private _downY: number = 0;
    @computed get active(): boolean { return SelectionManager.IsSelected(this) || this.props.parentActive(); }
    @computed get topMost(): boolean { return this.props.isTopMost; }
    @computed get layout(): string { return this.props.Document.GetText(KeyStore.Layout, "<p>Error loading layout data</p>"); }
    @computed get layoutKeys(): Key[] { return this.props.Document.GetData(KeyStore.LayoutKeys, ListField, new Array<Key>()); }
    @computed get layoutFields(): Key[] { return this.props.Document.GetData(KeyStore.LayoutFields, ListField, new Array<Key>()); }
    screenRect = (): ClientRect | DOMRect => this._mainCont.current ? this._mainCont.current.getBoundingClientRect() : new DOMRect();
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

    private dropDisposer?: DragManager.DragDropDisposer;

    componentDidMount() {
        if (this._mainCont.current) {
            this.dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
        runInAction(() => DocumentManager.Instance.DocumentViews.push(this));
    }

    componentDidUpdate() {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        if (this._mainCont.current) {
            this.dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
    }

    componentWillUnmount() {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        runInAction(() => DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1));
    }

    startDragging(x: number, y: number, dropAliasOfDraggedDoc: boolean) {
        if (this._mainCont.current) {
            const [left, top] = this.props
                .ScreenToLocalTransform()
                .inverse()
                .transformPoint(0, 0);
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
        if (
            Math.abs(this._downX - e.clientX) > 3 ||
            Math.abs(this._downY - e.clientY) > 3
        ) {
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
        if (!SelectionManager.IsSelected(this) &&
            e.button !== 2 &&
            Math.abs(e.clientX - this._downX) < 4 &&
            Math.abs(e.clientY - this._downY) < 4
        ) {
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }
    stopPropogation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    }

    deleteClicked = (): void => {
        if (this.props.removeDocument) {
            this.props.removeDocument(this.props.Document);
        }
    }

    fieldsClicked = (e: React.MouseEvent): void => {
        if (this.props.addDocument) {
            this.props.addDocument(Documents.KVPDocument(this.props.Document, { width: 300, height: 300 }), false);
        }
    }
    fullScreenClicked = (e: React.MouseEvent): void => {
        CollectionDockingView.Instance.OpenFullScreen(this.props.Document);
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({
            description: "Close Full Screen",
            event: this.closeFullScreenClicked
        });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
    }

    closeFullScreenClicked = (e: React.MouseEvent): void => {
        CollectionDockingView.Instance.CloseFullScreen();
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({
            description: "Full Screen",
            event: this.fullScreenClicked
        });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
    }

    @action
    public minimize = (): void => {
        this.props.Document.SetData(
            KeyStore.Minimized,
            true as boolean,
            BooleanField
        );
        SelectionManager.DeselectAll();
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
                        linkDoc.Set(KeyStore.Title, new TextField("New Link"));
                        linkDoc.Set(KeyStore.LinkDescription, new TextField(""));
                        linkDoc.Set(KeyStore.LinkTags, new TextField("Default"));

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
        if (e.isDefaultPrevented()) {
            return;
        }
        let text = e.dataTransfer.getData("text/plain");
        if (text && text.startsWith("<div")) {
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
        let moved =
            Math.abs(this._downX - e.clientX) > 3 ||
            Math.abs(this._downY - e.clientY) > 3;
        if (moved || e.isDefaultPrevented()) {
            e.preventDefault();
            return;
        }
        e.preventDefault();

        if (!this.isMinimized()) {
            ContextMenu.Instance.addItem({
                description: "Minimize",
                event: this.minimize
            });
        }
        ContextMenu.Instance.addItem({
            description: "Full Screen",
            event: this.fullScreenClicked
        });
        ContextMenu.Instance.addItem({
            description: "Fields",
            event: this.fieldsClicked
        });
        ContextMenu.Instance.addItem({
            description: "Center",
            event: () => this.props.focus(this.props.Document)
        });
        ContextMenu.Instance.addItem({
            description: "Open Right",
            event: () =>
                CollectionDockingView.Instance.AddRightSplit(this.props.Document)
        });
        ContextMenu.Instance.addItem({
            description: "Copy URL",
            event: () => {
                Utils.CopyText(ServerUtils.prepend("/doc/" + this.props.Document.Id));
            }
        });
        ContextMenu.Instance.addItem({
            description: "Copy ID",
            event: () => {
                Utils.CopyText(this.props.Document.Id);
            }
        });
        //ContextMenu.Instance.addItem({ description: "Docking", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Docking) })
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
        if (!this.topMost) {
            // DocumentViews should stop propagation of this event
            e.stopPropagation();
        }

        ContextMenu.Instance.addItem({
            description: "Delete",
            event: this.deleteClicked
        });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
        SelectionManager.SelectDoc(this, e.ctrlKey);
    }

    isMinimized = () => {
        let field = this.props.Document.GetT(KeyStore.Minimized, BooleanField);
        if (field && field !== FieldWaiting) {
            return field.Data;
        }
    }

    @action
    expand = () => {
        this.props.Document.SetData(
            KeyStore.Minimized,
            false as boolean,
            BooleanField
        );
    }

    isSelected = () => SelectionManager.IsSelected(this);

    select = (ctrlPressed: boolean) => {
        SelectionManager.SelectDoc(this, ctrlPressed);
    }

    @computed get nativeWidth(): number { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight(): number { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }
    @computed
    get contents() {
        return (<DocumentContentsView
            {...this.props}
            isSelected={this.isSelected}
            select={this.select}
            layoutKey={KeyStore.Layout}
        />);
    }

    render() {
        if (!this.props.Document) {
            return null;
        }

        var scaling = this.props.ContentScaling();
        var nativeWidth = this.nativeWidth;
        var nativeHeight = this.nativeHeight;

        if (this.isMinimized()) {
            return (
                <div
                    className="minimized-box"
                    ref={this._mainCont}
                    style={{
                        transformOrigin: "left top",
                        transform: `scale(${scaling} , ${scaling})`
                    }}
                    onClick={this.expand}
                    onDrop={this.onDrop}
                    onPointerDown={this.onPointerDown}
                />
            );
        } else {
            var backgroundcolor = this.props.Document.GetText(
                KeyStore.BackgroundColor,
                ""
            );
            return (
                <div
                    className="documentView-node"
                    ref={this._mainCont}
                    style={{
                        background: backgroundcolor,
                        width: nativeWidth > 0 ? nativeWidth.toString() + "px" : "100%",
                        height: nativeHeight > 0 ? nativeHeight.toString() + "px" : "100%",
                        transformOrigin: "left top",
                        transform: `scale(${scaling} , ${scaling})`
                    }}
                    onDrop={this.onDrop}
                    onContextMenu={this.onContextMenu}
                    onPointerDown={this.onPointerDown}
                >
                    {this.contents}
                </div>
            );
        }
    }
}
