import { observer } from "mobx-react";
import React = require("react");
import { computed, observable, action } from "mobx";
import { KeyStore, Key } from "../../fields/Key";
import { NumberField } from "../../fields/NumberField";
import { TextField } from "../../fields/TextField";
import { ListField } from "../../fields/ListField";
import { FieldTextBox } from "../nodes/FieldTextBox"
import { Document } from "../../fields/Document";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView"
import { CollectionDockingView } from "../collections/CollectionDockingView"
import { CollectionSchemaView } from "../collections/CollectionSchemaView"
import "./NodeView.scss"
import { SelectionManager } from "../../util/SelectionManager";
import { ContextMenu } from "../ContextMenu";
import { Opt } from "../../fields/Field";
import { DragManager } from "../../util/DragManager";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

interface DocumentViewProps {
    Document: Document;
    ContainingCollectionView: Opt<CollectionView>;
    ContainingDocumentView: Opt<DocumentView>
}

export interface CollectionViewProps {
    fieldKey: Key;
    Document: Document;
    ContainingDocumentView: Opt<DocumentView>;
}

// these properties are set via the render() method of the DocumentView when it creates this node.
// However, these properties are set below in the LayoutString() static method
export interface DocumentFieldViewProps {
    fieldKey: Key;
    doc: Document;
    containingDocumentView: DocumentView
}

interface CollectionView {
    addDocument: (doc: Document) => void;
    removeDocument: (doc: Document) => void;
    active: boolean;
    props: CollectionViewProps;
}

@observer
class DocumentContents extends React.Component<DocumentViewProps> {

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
    render() {
        let doc = this.props.Document;
        let bindings = { ...this.props } as any;
        for (const key of this.layoutKeys) {
            bindings[key.Name + "Key"] = key;
        }
        for (const key of this.layoutFields) {
            let field = doc.GetField(key);
            if (field) {
                bindings[key.Name] = field.GetValue();
            }
        }
        return <JsxParser
            components={{ FieldTextBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView }}
            bindings={bindings}
            jsx={this.layout}
            showWarnings={true}
            onError={(test: any) => { console.log(test) }}
        />


    }

}

@observer
export class DocumentView extends React.Component<DocumentViewProps> {
    private _mainCont = React.createRef<HTMLDivElement>();
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

    @action
    dragComplete = (e: DragManager.DragCompleteEvent) => {
    }

    @computed
    get active(): boolean {
        return SelectionManager.IsSelected(this) || this.props.ContainingCollectionView === undefined || this.props.ContainingCollectionView!.active;
    }


    // 
    // returns the cumulative scaling between the document and the screen
    //
    @computed
    public get ScalingToScreenSpace(): number {
        if (this.props.ContainingDocumentView != undefined) {
            let ss = this.props.ContainingDocumentView.props.Document.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
            return this.props.ContainingDocumentView.ScalingToScreenSpace * ss;
        }
        return 1;
    }

    //
    // Converts a coordinate in the screen space of the app into a local document coordinate.
    //
    public TransformToLocalPoint(screenX: number, screenY: number) {
        let ContainerX = screenX - CollectionFreeFormView.BORDER_WIDTH;
        let ContainerY = screenY - CollectionFreeFormView.BORDER_WIDTH;

        // if this collection view is nested within another collection view, then 
        // first transform the screen point into the parent collection's coordinate space.
        if (this.props.ContainingDocumentView != undefined) {
            let { LocalX, LocalY } = this.props.ContainingDocumentView!.TransformToLocalPoint(screenX, screenY);
            ContainerX = LocalX - CollectionFreeFormView.BORDER_WIDTH;
            ContainerY = LocalY - CollectionFreeFormView.BORDER_WIDTH;
        }

        let dockingViewChromeHack = this.props.ContainingCollectionView instanceof CollectionDockingView;
        let Xx = dockingViewChromeHack ? 0 : this.props.Document.GetFieldValue(KeyStore.X, NumberField, Number(0));
        let Yy = dockingViewChromeHack ? CollectionDockingView.TAB_HEADER_HEIGHT : this.props.Document.GetFieldValue(KeyStore.Y, NumberField, Number(0));
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

        let dockingViewChromeHack = this.props.ContainingCollectionView instanceof CollectionDockingView;
        let W = CollectionFreeFormView.BORDER_WIDTH; // this.props.Document.GetFieldValue(KeyStore.Width, NumberField, Number(0));
        let H = CollectionFreeFormView.BORDER_WIDTH;
        let Xx = dockingViewChromeHack ? 0 : this.props.Document.GetFieldValue(KeyStore.X, NumberField, Number(0));
        let Yy = dockingViewChromeHack ? CollectionDockingView.TAB_HEADER_HEIGHT : this.props.Document.GetFieldValue(KeyStore.Y, NumberField, Number(0));
        let parentX = (localX - W) * Ss + (Xx + Panxx) + W;
        let parentY = (localY - H) * Ss + (Yy + Panyy) + H;

        // if this collection view is nested within another collection view, then 
        // first transform the local point into the parent collection's coordinate space.
        let containingDocView = this.props.ContainingDocumentView;
        if (containingDocView != undefined) {
            let ss = containingDocView.props.Document.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
            let panxx = containingDocView.props.Document.GetFieldValue(KeyStore.PanX, NumberField, Number(0)) + CollectionFreeFormView.BORDER_WIDTH * ss;
            let panyy = containingDocView.props.Document.GetFieldValue(KeyStore.PanY, NumberField, Number(0)) + CollectionFreeFormView.BORDER_WIDTH * ss;
            let { ScreenX, ScreenY } = containingDocView.TransformToScreenPoint(parentX, parentY, ss, panxx, panyy);
            parentX = ScreenX;
            parentY = ScreenY;
        }
        return { ScreenX: parentX, ScreenY: parentY };
    }

    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
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
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
            if (this._mainCont.current != null && this.props.ContainingCollectionView != null) {
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

    deleteClicked = (e: React.MouseEvent): void => {
        if (this.props.ContainingCollectionView instanceof CollectionFreeFormView) {
            this.props.ContainingCollectionView.removeDocument(this.props.Document)
        }
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

        var topMost = this.props.ContainingCollectionView == undefined;
        if (topMost) {
            ContextMenu.Instance.clearItems()
        }
        else {
            // DocumentViews should stop propogation of this event
            e.stopPropagation();

            ContextMenu.Instance.clearItems();
            ContextMenu.Instance.addItem({ description: "Delete", event: this.deleteClicked })
            ContextMenu.Instance.displayMenu(e.pageX, e.pageY)
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }


    render() {
        var freestyling = this.props.ContainingCollectionView === undefined || this.props.ContainingCollectionView instanceof CollectionFreeFormView;
        return (
            <div className="node" ref={this._mainCont} style={{
                transform: freestyling ? this.transform : "",
                width: freestyling ? this.width : "100%",
                height: freestyling ? this.height : "100%",
            }}
                onContextMenu={this.onContextMenu}
                onPointerDown={this.onPointerDown}>
                <DocumentContents {...this.props} ContainingDocumentView={this} />
            </div>
        );
    }
}