import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { Opt, FieldWaiting } from "../../../fields/Field";
import { Key, KeyStore } from "../../../fields/Key";
import { ListField } from "../../../fields/ListField";
import { Utils } from "../../../Utils";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionViewBase, COLLECTION_BORDER_WIDTH } from "../collections/CollectionViewBase";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { ImageBox } from "../nodes/ImageBox";
import "./DocumentView.scss";
import React = require("react");
import { Transform } from "../../util/Transform";
import { SelectionManager } from "../../util/SelectionManager";
import { DragManager } from "../../util/DragManager";
import { ContextMenu } from "../ContextMenu";
import { TextField } from "../../../fields/TextField";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

export interface DocumentViewProps {
    DocumentView: Opt<DocumentView>  // needed only to set ContainingDocumentView on CollectionViewProps when invoked from JsxParser -- is there a better way?
    ContainingCollectionView: Opt<CollectionViewBase>;

    Document: Document;
    AddDocument?: (doc: Document) => void;
    RemoveDocument?: (doc: Document) => boolean;
    GetTransform: () => Transform;
    isTopMost: boolean;
    Scaling: number;
}

@observer
export class DocumentView extends React.Component<DocumentViewProps> {

    private _mainCont = React.createRef<HTMLDivElement>();
    get MainContent() {
        return this._mainCont;
    }
    get screenRect(): ClientRect | DOMRect {
        if (this._mainCont.current) {
            return this._mainCont.current.getBoundingClientRect();
        }
        return new DOMRect();
    }
    @computed
    get layout(): string {
        return this.props.Document.GetText(KeyStore.Layout, "<p>Error loading layout data</p>");
    }

    @computed
    get backgroundLayout(): string | undefined {
        let field = this.props.Document.GetT(KeyStore.BackgroundLayout, TextField);
        if (field && field !== "<Waiting>") {
            return field.Data;
        }
    }

    @computed
    get layoutKeys(): Key[] {
        return this.props.Document.GetData(KeyStore.LayoutKeys, ListField, new Array<Key>());
    }

    @computed
    get layoutFields(): Key[] {
        return this.props.Document.GetData(KeyStore.LayoutFields, ListField, new Array<Key>());
    }

    @computed
    get active(): boolean {
        return SelectionManager.IsSelected(this) || this.props.ContainingCollectionView === undefined ||
            this.props.ContainingCollectionView.active;
    }

    private _contextMenuCanOpen = false;
    private _downX: number = 0;
    private _downY: number = 0;
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

    @action
    dragComplete = (e: DragManager.DragCompleteEvent) => {
    }

    @computed
    get topMost(): boolean {
        return this.props.ContainingCollectionView == undefined || this.props.ContainingCollectionView instanceof CollectionDockingView;
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
                const [left, top] = this.props.GetTransform().inverse().transformPoint(0, 0);
                let dragData: { [id: string]: any } = {};
                dragData["document"] = this;
                dragData["xOffset"] = e.x - left;
                dragData["yOffset"] = e.y - top;
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
        if (this.props.RemoveDocument) {
            this.props.RemoveDocument(this.props.Document);
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

    // 
    // returns the cumulative scaling between the document and the screen
    //
    @computed
    public get ScalingToScreenSpace(): number {
        if (this.props.ContainingCollectionView != undefined &&
            this.props.ContainingCollectionView.props.ContainingDocumentView != undefined) {
            let ss = this.props.ContainingCollectionView.props.DocumentForCollection.GetNumber(KeyStore.Scale, 1);
            return this.props.ContainingCollectionView.props.ContainingDocumentView.ScalingToScreenSpace * ss;
        }
        return 1;
    }

    isSelected = () => {
        return SelectionManager.IsSelected(this);
    }

    select = (ctrlPressed: boolean) => {
        SelectionManager.SelectDoc(this, ctrlPressed)
    }

    render() {
        let bindings = { ...this.props } as any;
        bindings.isSelected = this.isSelected;
        bindings.select = this.select;
        for (const key of this.layoutKeys) {
            bindings[key.Name + "Key"] = key;  // this maps string values of the form <keyname>Key to an actual key Kestore.keyname  e.g,   "DataKey" => KeyStore.Data
        }
        if (!bindings.GetTransform) {
            console.log("test");
        }
        for (const key of this.layoutFields) {
            let field = this.props.Document.Get(key);
            bindings[key.Name] = field && field != FieldWaiting ? field.GetValue() : field;
        }
        let backgroundLayout = this.backgroundLayout;
        if (backgroundLayout) {
            let backgroundView = <JsxParser
                components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView }}
                bindings={bindings}
                jsx={this.backgroundLayout}
                showWarnings={true}
                onError={(test: any) => { console.log(test) }}
            />;
            bindings.BackgroundView = backgroundView;
        }

        var width = this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
        var strwidth = width > 0 ? width.toString() + "px" : "100%";
        var height = this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
        var strheight = height > 0 ? height.toString() + "px" : "100%";
        return (
            <div className="documentView-node" ref={this._mainCont} style={{ width: strwidth, height: strheight, transformOrigin: "left top", transform: `scale(${this.props.Scaling},${this.props.Scaling})` }}
                onContextMenu={this.onContextMenu}
                onPointerDown={this.onPointerDown} >
                <JsxParser
                    components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView }}
                    bindings={bindings}
                    jsx={this.layout}
                    showWarnings={true}
                    onError={(test: any) => { console.log(test) }}
                />
            </div>
        )
    }
}
