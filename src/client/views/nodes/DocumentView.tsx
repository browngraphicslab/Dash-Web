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
import { ContextMenu } from "../ContextMenu";
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import React = require("react");
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { MarqueeView } from "../collections/collectionFreeForm/MarqueeView";

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
    toggleMinimized: () => void;
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

    @action
    componentDidMount() {
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
        DocumentManager.Instance.DocumentViews.push(this);
    }
    @action
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
    @action
    componentWillUnmount() {
        if (this._dropDisposer) {
            this._dropDisposer();
        }
        DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1);
    }

    stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    }

    startDragging(x: number, y: number, dropAliasOfDraggedDoc: boolean) {
        if (this._mainCont.current) {
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(0, 0);
            let dragData = new DragManager.DocumentDragData([this.props.Document]);
            const [xoff, yoff] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).transformDirection(x - left, y - top);
            dragData.aliasOnDrop = dropAliasOfDraggedDoc;
            dragData.xOffset = xoff;
            dragData.yOffset = yoff;
            dragData.moveDocument = this.props.moveDocument;
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, {
                handlers: {
                    dragComplete: action(emptyFunction)
                },
                hideSource: !dropAliasOfDraggedDoc
            });
        }
    }

    onClick = (e: React.MouseEvent): void => {
        if (CurrentUserUtils.MainDocId != this.props.Document.Id &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
                Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        if (CollectionFreeFormView.RIGHT_BTN_DRAG && (e.button === 2 || (e.button === 0 && e.altKey)) && !this.isSelected()) {
            return;
        }
        if (e.shiftKey && e.buttons === 1) {
            if (this.props.isTopMost) {
                this.startDragging(e.pageX, e.pageY, e.altKey || e.ctrlKey);
            } else {
                CollectionDockingView.Instance.StartOtherDrag([this.props.Document], e);
            }
            e.stopPropagation();
        } else if (this.active) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
            e.preventDefault();
            e.stopPropagation();
        }
    }
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble) {
            if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
                document.removeEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
                if (!e.altKey && !this.topMost && (!CollectionFreeFormView.RIGHT_BTN_DRAG && e.buttons === 1) || (CollectionFreeFormView.RIGHT_BTN_DRAG && e.buttons === 2)) {
                    this.startDragging(this._downX, this._downY, e.ctrlKey || e.altKey);
                }
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    deleteClicked = (): void => {
        this.props.removeDocument && this.props.removeDocument(this.props.Document);
    }
    fieldsClicked = (e: React.MouseEvent): void => {
        let kvp = Documents.KVPDocument(this.props.Document, { width: 300, height: 300 });
        CollectionDockingView.Instance.AddRightSplit(kvp);
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

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc = de.data.linkSourceDocument;
            let destDoc = this.props.Document;

            destDoc.GetTAsync(KeyStore.Prototype, Document).then(protoDest =>
                sourceDoc.GetTAsync(KeyStore.Prototype, Document).then(protoSrc =>
                    (protoSrc ? protoSrc : sourceDoc).CreateLink(protoDest ? protoDest : destDoc))
            );
            e.stopPropagation();
        }
    }

    @action
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

    isSelected = () => SelectionManager.IsSelected(this);
    select = (ctrlPressed: boolean) => SelectionManager.SelectDoc(this, ctrlPressed);
    @computed get nativeWidth() { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight() { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }
    @computed get contents() { return (<DocumentContentsView {...this.props} isSelected={this.isSelected} select={this.select} layoutKey={KeyStore.Layout} />); }

    render() {
        var scaling = this.props.ContentScaling();
        var nativeHeight = this.nativeHeight > 0 ? this.nativeHeight.toString() + "px" : "100%";
        var nativeWidth = this.nativeWidth > 0 ? this.nativeWidth.toString() + "px" : "100%";

        return (
            <div className={`documentView-node${this.props.isTopMost ? "-topmost" : ""}`}
                ref={this._mainCont}
                style={{
                    borderRadius: "inherit",
                    background: this.props.Document.GetText(KeyStore.BackgroundColor, ""),
                    width: nativeWidth, height: nativeHeight,
                    transform: `scale(${scaling}, ${scaling})`
                }}
                onDrop={this.onDrop} onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown} onClick={this.onClick}
            >
                {this.contents}
            </div>
        );
    }
}
