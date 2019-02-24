import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Key, KeyStore } from "../../../fields/Key";
import { NumberField } from "../../../fields/NumberField";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import "./DocumentView.scss";
import React = require("react");
import { DocumentView, DocumentViewProps } from "./DocumentView";
import { Transform } from "../../util/Transform";


@observer
export class CollectionFreeFormDocumentView extends DocumentView {
    private _contextMenuCanOpen = false;
    private _downX: number = 0;
    private _downY: number = 0;
    // private _mainCont = React.createRef<HTMLDivElement>();

    constructor(props: DocumentViewProps) {
        super(props);
    }
    get screenRect(): ClientRect | DOMRect {
        if (this._mainCont.current) {
            return this._mainCont.current.getBoundingClientRect();
        }
        return new DOMRect();
    }

    public LeftCorner(): number {
        return this.props.Document.GetNumber(KeyStore.X, 0) + super.LeftCorner();
    }

    public TopCorner(): number {
        return this.props.Document.GetNumber(KeyStore.Y, 0) + super.TopCorner();
    }

    @computed
    get transform(): string {
        return `scale(${this.props.ParentScaling}, ${this.props.ParentScaling}) translate(${this.props.Document.GetNumber(KeyStore.X, 0)}px, ${this.props.Document.GetNumber(KeyStore.Y, 0)}px)`;
    }

    @computed
    get width(): number {
        return this.props.Document.GetNumber(KeyStore.Width, 0);
    }

    @computed
    get nativeWidth(): number {
        return this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
    }

    set width(w: number) {
        this.props.Document.SetData(KeyStore.Width, w, NumberField)
        if (this.nativeWidth > 0 && this.nativeHeight > 0) {
            this.props.Document.SetNumber(KeyStore.Height, this.nativeHeight / this.nativeWidth * w)
        }
    }

    @computed
    get height(): number {
        return this.props.Document.GetNumber(KeyStore.Height, 0);
    }
    @computed
    get nativeHeight(): number {
        return this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
    }

    set height(h: number) {
        this.props.Document.SetData(KeyStore.Height, h, NumberField);
        if (this.nativeWidth > 0 && this.nativeHeight > 0) {
            this.props.Document.SetNumber(KeyStore.Width, this.nativeWidth / this.nativeHeight * h)
        }
    }

    @computed
    get zIndex(): number {
        return this.props.Document.GetNumber(KeyStore.ZIndex, 0);
    }

    set zIndex(h: number) {
        this.props.Document.SetData(KeyStore.ZIndex, h, NumberField)
    }

    @action
    dragComplete = (e: DragManager.DragCompleteEvent) => {
    }

    @computed
    get active(): boolean {
        return SelectionManager.IsSelected(this) || this.props.ContainingCollectionView === undefined ||
            this.props.ContainingCollectionView.active;
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
                //remove preview cursor from collection
                if (this.props.ContainingCollectionView != undefined && this.props.ContainingCollectionView instanceof CollectionFreeFormView) {
                    this.props.ContainingCollectionView.hidePreviewCursor();
                }
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

    getTransform = (): Transform => {
        return this.props.GetTransform().translated(this.props.Document.GetNumber(KeyStore.X, 0), this.props.Document.GetNumber(KeyStore.Y, 0));
    }

    render() {
        var parentScaling = this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
        return (
            <div className="documentView-node" ref={this._mainCont}
                onContextMenu={this.onContextMenu}
                onPointerDown={this.onPointerDown}
                style={{
                    transformOrigin: "left top",
                    transform: this.transform,
                    width: this.width,
                    height: this.height,
                    position: "absolute",
                    zIndex: this.zIndex,
                }}>

                <DocumentView {...this.props} ref={this._renderDoc} ParentScaling={parentScaling} GetTransform={this.getTransform} DocumentView={this} />
            </div>
        );
    }
}