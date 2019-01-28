import {observer} from "mobx-react";
import React = require("react");
import {computed, observable, action} from "mobx";
import {KeyStore, Key} from "../../fields/Key";
import {NumberField} from "../../fields/NumberField";
import {TextField} from "../../fields/TextField";
import {DocumentViewModel} from "../../viewmodels/DocumentViewModel";
import {ListField} from "../../fields/ListField";
import {FieldTextBox} from "../nodes/FieldTextBox"
import {Document} from "../../fields/Document";
import {CollectionFreeFormView} from "../freeformcanvas/CollectionFreeFormView"
import "./NodeView.scss"
import {SelectionManager} from "../../util/SelectionManager";
import {DocumentDecorations} from "../../DocumentDecorations";
import {ContextMenu} from "../ContextMenu";
import {Opt} from "../../fields/Field";
import {DragManager} from "../../util/DragManager";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

interface IProps {
    Document: Document;
    ContainingCollectionView: Opt<CollectionFreeFormView>;
    ContainingDocumentView: Opt<DocumentView>
}

@observer
class DocumentContents extends React.Component<IProps> {

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
        let bindings = {...this.props} as any;
        for (const key of this.layoutKeys) {
            bindings[ key.Name + "Key" ] = key;
        }
        for (const key of this.layoutFields) {
            let field = doc.GetField(key);
            if (field) {
                bindings[ key.Name ] = field.GetValue();
            }
        }
        return <JsxParser
            components={{FieldTextBox, CollectionFreeFormView}}
            bindings={bindings}
            jsx={this.layout}
            showWarnings={true}
            onError={(test: any) => {console.log(test)}}
        />


    }

}

@observer
export class DocumentView extends React.Component<IProps> {
    private _mainCont = React.createRef<HTMLDivElement>();
    private _contextMenuCanOpen = false;
    private _downX: number = 0;
    private _downY: number = 0;

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
    // Converts an input coordinate in application's screen space
    // into a coordinate in the space of this document.
    // NOTE: this is intended for use on DocumentViews that are CollectionFreeFormViews
    //
    public TransformToLocalPoint(screenX: number, screenY: number) {
        let ContainerX = screenX;
        let ContainerY = screenY;
        // if this collection view is nested within another collection view, then 
        // first transform the screen point into the parent collection's coordinate space.
        if (this.props.ContainingDocumentView != undefined) {
            let {LocalX, LocalY} = this.props.ContainingDocumentView!.TransformToLocalPoint(screenX, screenY);
            ContainerX = LocalX;
            ContainerY = LocalY;
        }

        let W = this.props.Document.GetFieldValue(KeyStore.Width, NumberField, Number(0));
        let Xx = this.props.Document.GetFieldValue(KeyStore.X, NumberField, Number(0));
        let Yy = this.props.Document.GetFieldValue(KeyStore.Y, NumberField, Number(0));
        let Ss = this.props.Document.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
        let Panxx = this.props.Document.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        let Panyy = this.props.Document.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        let LocalX = W / 2 - (Xx + Panxx) / Ss + (ContainerX - W / 2) / Ss;
        let LocalY = -(Yy + Panyy) / Ss + ContainerY / Ss;

        return {LocalX, Ss, W, Panxx, Xx, LocalY, Panyy, Yy, ContainerX, ContainerY};
    }

    onPointerDown = (e: React.PointerEvent): void => {
        let me = this;
        this._downX = e.clientX;
        this._downY = e.clientY;
        this._contextMenuCanOpen = e.button == 2;
        if (this.active) {
            e.stopPropagation();
            e.preventDefault();
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
                let dragData: {[ id: string ]: any} = {};
                dragData[ "document" ] = this;
                dragData[ "xOffset" ] = e.x - rect.left;
                dragData[ "yOffset" ] = e.y - rect.top;
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
            ContextMenu.Instance.addItem({description: "Delete", event: this.deleteClicked})
            ContextMenu.Instance.displayMenu(e.pageX, e.pageY)
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }

    render() {
        return (
            <div className="node" ref={this._mainCont} style={{
                transform: this.transform,
                width: this.width,
                height: this.height,
            }}
                onContextMenu={this.onContextMenu}
                onPointerDown={this.onPointerDown}>
                <DocumentContents {...this.props} ContainingDocumentView={this} />
            </div>
        );
    }

}