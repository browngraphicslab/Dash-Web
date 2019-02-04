import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { Opt } from "../../fields/Field";
import { Key, KeyStore } from "../../fields/Key";
import { ListField } from "../../fields/ListField";
import { NumberField } from "../../fields/NumberField";
import { TextField } from "../../fields/TextField";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Utils } from "../../Utils";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionViewBase, COLLECTION_BORDER_WIDTH } from "../collections/CollectionViewBase";
import { ContextMenu } from "../ContextMenu";
import { FieldTextBox } from "../nodes/FieldTextBox";
import { ImageBox } from "../nodes/ImageBox";
import "./NodeView.scss";
import React = require("react");
import { baseKeymap } from "prosemirror-commands";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

interface DocumentViewProps {
    Document: Document;
    ContainingCollectionView: Opt<CollectionViewBase>;
    ContainingDocumentContentsView: Opt<DocumentContentsView>;
}
@observer
export class DocumentContentsView extends React.Component<DocumentViewProps> {

    protected _mainCont = React.createRef<any>();
    get MainContent() {
        return this._mainCont;
    }
    @computed
    get layout(): string {
        return this.props.Document.GetFieldValue(KeyStore.Layout, TextField, String("<p>Error loading layout data</p>"));
    }

    @computed
    get layoutKeys(): Key[] {
        return this.props.Document.GetFieldValue(KeyStore.LayoutKeys, ListField, new Array<Key>());
    }

    @computed
    get layoutFields(): Key[] {
        return this.props.Document.GetFieldValue(KeyStore.LayoutFields, ListField, new Array<Key>());
    }

    // 
    // returns the cumulative scaling between the document and the screen
    //
    @computed
    public get ScalingToScreenSpace(): number {
        if (this.props.ContainingDocumentContentsView != undefined) {
            let ss = this.props.ContainingDocumentContentsView.props.Document.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
            return this.props.ContainingDocumentContentsView.ScalingToScreenSpace * ss;
        }
        return 1;
    }

    //
    // Converts a coordinate in the screen space of the app into a local document coordinate.
    //
    public TransformToLocalPoint(screenX: number, screenY: number) {
        // if this collection view is nested within another collection view, then 
        // first transform the screen point into the parent collection's coordinate space.
        let { LocalX: parentX, LocalY: parentY } = this.props.ContainingDocumentContentsView != undefined ?
            this.props.ContainingDocumentContentsView!.TransformToLocalPoint(screenX, screenY) :
            { LocalX: screenX, LocalY: screenY };
        let ContainerX: number = parentX - COLLECTION_BORDER_WIDTH;
        let ContainerY: number = parentY - COLLECTION_BORDER_WIDTH;

        var Xx = this.props.Document.GetFieldValue(KeyStore.X, NumberField, Number(0));
        var Yy = this.props.Document.GetFieldValue(KeyStore.Y, NumberField, Number(0));
        // CollectionDockingViews change the location of their children frames without using a Dash transformation.
        // They also ignore any transformation that may have been applied to their content document.
        // NOTE: this currently assumes CollectionDockingViews aren't nested.
        if (this.props.ContainingCollectionView instanceof CollectionDockingView) {
            var { translateX: rx, translateY: ry } = Utils.GetScreenTransform(this.MainContent.current!);
            Xx = rx - COLLECTION_BORDER_WIDTH;
            Yy = ry - COLLECTION_BORDER_WIDTH;
        }

        let Ss = this.props.Document.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
        let Panxx = this.props.Document.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        let Panyy = this.props.Document.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        let LocalX = (ContainerX - (Xx + Panxx)) / Ss;
        let LocalY = (ContainerY - (Yy + Panyy)) / Ss;

        return { LocalX, Ss, Panxx, Xx, LocalY, Panyy, Yy, ContainerX, ContainerY };
    }

    //
    // Converts a point in the coordinate space of a document to a screen space coordinate.
    //
    public TransformToScreenPoint(localX: number, localY: number, Ss: number = 1, Panxx: number = 0, Panyy: number = 0): { ScreenX: number, ScreenY: number } {

        var Xx = this.props.Document.GetFieldValue(KeyStore.X, NumberField, Number(0));
        var Yy = this.props.Document.GetFieldValue(KeyStore.Y, NumberField, Number(0));
        // CollectionDockingViews change the location of their children frames without using a Dash transformation.
        // They also ignore any transformation that may have been applied to their content document.
        // NOTE: this currently assumes CollectionDockingViews aren't nested.
        if (this.props.ContainingCollectionView instanceof CollectionDockingView) {
            var { translateX: rx, translateY: ry } = Utils.GetScreenTransform(this.MainContent.current!);
            Xx = rx - COLLECTION_BORDER_WIDTH;
            Yy = ry - COLLECTION_BORDER_WIDTH;
        }

        let W = COLLECTION_BORDER_WIDTH;
        let H = COLLECTION_BORDER_WIDTH;
        let parentX = (localX - W) * Ss + (Xx + Panxx) + W;
        let parentY = (localY - H) * Ss + (Yy + Panyy) + H;

        // if this collection view is nested within another collection view, then 
        // first transform the local point into the parent collection's coordinate space.
        let containingDocView = this.props.ContainingDocumentContentsView;
        if (containingDocView != undefined) {
            let ss = containingDocView.props.Document.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
            let panxx = containingDocView.props.Document.GetFieldValue(KeyStore.PanX, NumberField, Number(0)) + COLLECTION_BORDER_WIDTH * ss;
            let panyy = containingDocView.props.Document.GetFieldValue(KeyStore.PanY, NumberField, Number(0)) + COLLECTION_BORDER_WIDTH * ss;
            let { ScreenX, ScreenY } = containingDocView.TransformToScreenPoint(parentX, parentY, ss, panxx, panyy);
            parentX = ScreenX;
            parentY = ScreenY;
        }
        return { ScreenX: parentX, ScreenY: parentY };
    }
    render() {
        let doc = this.props.Document;
        let bindings = { ...this.props } as any;
        for (const key of this.layoutKeys) {
            bindings[key.Name + "Key"] = key;
        }
        bindings.ContainingDocumentContentsView = this;
        for (const key of this.layoutFields) {
            let field = doc.GetField(key);
            if (field) {
                bindings[key.Name] = field.GetValue();
            }
        }
        return (
            //<div ref={this._mainCont}>
            <JsxParser ref={this._mainCont}
                components={{ FieldTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView }}
                bindings={bindings}
                jsx={this.layout}
                showWarnings={true}
                onError={(test: any) => { console.log(test) }}
            />
            //</div>
        )
    }
}

@observer
export class DocumentView extends DocumentContentsView {
    private _contextMenuCanOpen = false;
    private _downX: number = 0;
    private _downY: number = 0;

    constructor(props: DocumentViewProps) {
        super(props);
    }
    get screenRect(): ClientRect | DOMRect {
        if (this._mainCont.current) {
            return this._mainCont.current.getBoundingClientRect();
        }
        return new DOMRect();
    }

    @computed
    get x(): number {
        return this.props.Document.GetFieldValue(KeyStore.X, NumberField, Number(0));
    }

    @computed
    get y(): number {
        return this.props.Document.GetFieldValue(KeyStore.Y, NumberField, Number(0));
    }

    set x(x: number) {
        this.props.Document.SetFieldValue(KeyStore.X, x, NumberField)
    }

    set y(y: number) {
        this.props.Document.SetFieldValue(KeyStore.Y, y, NumberField)
    }

    @computed
    get transform(): string {
        return `translate(${this.x}px, ${this.y}px)`;
    }

    @computed
    get width(): number {
        return this.props.Document.GetFieldValue(KeyStore.Width, NumberField, Number(0));
    }

    set width(w: number) {
        this.props.Document.SetFieldValue(KeyStore.Width, w, NumberField)
    }

    @computed
    get height(): number {
        return this.props.Document.GetFieldValue(KeyStore.Height, NumberField, Number(0));
    }

    set height(h: number) {
        this.props.Document.SetFieldValue(KeyStore.Height, h, NumberField)
    }

    @computed
    get zIndex(): number {
        return this.props.Document.GetFieldValue(KeyStore.ZIndex, NumberField, Number(0));
    }

    set zIndex(h: number) {
        this.props.Document.SetFieldValue(KeyStore.ZIndex, h, NumberField)
    }

    @action
    dragComplete = (e: DragManager.DragCompleteEvent) => {
    }

    @computed
    get active(): boolean {
        return SelectionManager.IsSelected(this) || this.props.ContainingCollectionView === undefined || this.props.ContainingCollectionView!.active;
    }

    @computed
    get topMost(): boolean {
        return this.props.ContainingCollectionView == undefined || this.props.ContainingCollectionView instanceof CollectionDockingView;
    }

    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        var me = this;
        if (e.shiftKey && e.buttons === 1) {
            CollectionDockingView.StartOtherDrag(this._mainCont.current!, this.props.Document);
            e.stopPropagation();
            return;
        }
        this._contextMenuCanOpen = e.button == 2;
        if (this.active && !e.isDefaultPrevented()) {
            e.stopPropagation();
            if (e.buttons === 2) {
                e.preventDefault();
            }
            document.removeEventListener("pointermove", this.onPointerMove)
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp)
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    onPointerMove = (e: PointerEvent): void => {
        if (e.cancelBubble) {
            this._contextMenuCanOpen = false;
            return;
        }
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
            this._contextMenuCanOpen = false;
            if (this._mainCont.current != null && !this.topMost) {
                this._contextMenuCanOpen = false;
                const rect = this.screenRect;
                let dragData: { [id: string]: any } = {};
                dragData["document"] = this;
                dragData["xOffset"] = e.x - rect.left;
                dragData["yOffset"] = e.y - rect.top;
                DragManager.StartDrag(this._mainCont.current, dragData, {
                    handlers: {
                        dragComplete: this.dragComplete,
                    },
                    hideSource: true
                })
            }
        }
        e.stopPropagation();
        e.preventDefault();
    }

    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove)
        document.removeEventListener("pointerup", this.onPointerUp)
        e.stopPropagation();
        if (Math.abs(e.clientX - this._downX) < 4 && Math.abs(e.clientY - this._downY) < 4) {
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }

    openRight = (e: React.MouseEvent): void => {
        CollectionDockingView.AddRightSplit(this.props.Document);
    }

    deleteClicked = (e: React.MouseEvent): void => {
        if (this.props.ContainingCollectionView instanceof CollectionFreeFormView) {
            this.props.ContainingCollectionView.removeDocument(this.props.Document)
        }
    }
    @action
    fullScreenClicked = (e: React.MouseEvent): void => {
        CollectionDockingView.OpenFullScreen(this.props.Document);
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({ description: "Close Full Screen", event: this.closeFullScreenClicked });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
    }
    @action
    closeFullScreenClicked = (e: React.MouseEvent): void => {
        CollectionDockingView.CloseFullScreen();
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked })
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
    }

    @action
    onContextMenu = (e: React.MouseEvent): void => {
        if (!SelectionManager.IsSelected(this)) {
            return;
        }
        e.preventDefault()

        if (!this._contextMenuCanOpen) {
            return;
        }

        if (this.topMost) {
            ContextMenu.Instance.clearItems()
            ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked })
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
        }
        else {
            // DocumentViews should stop propogation of this event
            e.stopPropagation();

            ContextMenu.Instance.clearItems();
            ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked })
            ContextMenu.Instance.addItem({ description: "Open Right", event: this.openRight })
            ContextMenu.Instance.addItem({ description: "Delete", event: this.deleteClicked })
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }

    render() {
        var freestyling = this.props.ContainingCollectionView instanceof CollectionFreeFormView;
        return (
            <div className="node" ref={this._mainCont} style={{
                transform: freestyling ? this.transform : "",
                width: freestyling ? this.width : "100%",
                height: freestyling ? this.height : "100%",
                position: freestyling ? "absolute" : "relative",
                zIndex: freestyling ? this.zIndex : 0,
            }}
                onContextMenu={this.onContextMenu}
                onPointerDown={this.onPointerDown}>

                <DocumentContentsView {...this.props} />
            </div>
        );
    }
}