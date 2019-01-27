import { observer } from "mobx-react";
import React = require("react");
import { computed, observable, action } from "mobx";
import { KeyStore, Key } from "../../fields/Key";
import { NumberField } from "../../fields/NumberField";
import { TextField } from "../../fields/TextField";
import { DocumentViewModel } from "../../viewmodels/DocumentViewModel";
import { ListField } from "../../fields/ListField";
import { FieldTextBox } from "../nodes/FieldTextBox"
import { Document } from "../../fields/Document";
import { CollectionFreeFormView } from "../freeformcanvas/CollectionFreeFormView"
import "./NodeView.scss"
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentDecorations } from "../../DocumentDecorations";
import { ContextMenu } from "../ContextMenu";
import { Opt } from "../../fields/Field";
import { DragManager } from "../../util/DragManager";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

interface IProps {
    Document:    Document;
    ContainingCollectionView: Opt<object>;
    ContainingDocumentView:   Opt<DocumentView>
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
            bindings[key.Name + "Key"] = key;
        }
        for (const key of this.layoutFields) {
            let field = doc.GetField(key);
            if (field) {
                bindings[key.Name] = field.GetValue();
            }
        }
        return <JsxParser
            components={{ FieldTextBox, CollectionFreeFormView }}
            bindings={bindings}
            jsx={this.layout}
            showWarnings={true}
            onError={(test: any) => { console.log(test) }}
        />


    }

}

@observer
export class DocumentView extends React.Component<IProps> {
    private _mainCont = React.createRef<HTMLDivElement>();
    private _contextMenuCanOpen = false;
    private _downX:number = 0;
    private _downY:number = 0;
    private _lastX:number = 0;
    private _lastY:number = 0;

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

    componentDidMount() {
        const that = this;
        if(this._mainCont.current) {
            DragManager.MakeDraggable(this._mainCont.current, {
                buttons: 2,
                handlers: {
                    dragComplete: () => {},
                    dragStart: (e: DragManager.DragStartEvent) => {
                        if(!this.props.ContainingCollectionView) {
                            e.cancel();
                            return;
                        }
                        const rect = this.screenRect;
                        e.data["document"] = this;
                        e.data["xOffset"] = e.x - rect.left;
                        e.data["yOffset"] = e.y - rect.top;
                    }
                }
            })
        }
    }

    @computed
    get active() : boolean {
        return SelectionManager.IsSelected(this) ||  (this.props.ContainingCollectionView instanceof CollectionFreeFormView && this.props.ContainingCollectionView.active);
    }

    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.pageX;
        this._downY = e.pageY;
        this._lastX = e.pageX;
        this._lastY = e.pageY;
        this._contextMenuCanOpen = e.button == 2;
        // document.removeEventListener("pointermove", this.onPointerMove);
        // document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        if (!e.cancelBubble) {
            e.stopPropagation();
            e.preventDefault();
            DocumentDecorations.Instance.opacity = 1;
            if (this._downX == e.pageX && this._downY == e.pageY) {
                SelectionManager.SelectDoc(this, e.ctrlKey)
            }
        }
    }

    onPointerMove = (e: PointerEvent): void => {
        if (this.active && !e.cancelBubble) {
            e.stopPropagation();
            e.preventDefault();
            this._contextMenuCanOpen = false
            let me = this;
            var dx = e.pageX - this._lastX;
            var dy = e.pageY - this._lastY;
            this._lastX = e.pageX;
            this._lastY = e.pageY;
            let currScale:number = 1;
            if (me.props.ContainingDocumentView != undefined) {
                let pme = me.props.ContainingDocumentView!.props.Document;
                currScale = pme.GetFieldValue(KeyStore.Scale, NumberField, Number(0)); 
                if (me.props.ContainingDocumentView!.props.ContainingDocumentView != undefined) {
                    let pme = me.props.ContainingDocumentView!.props.ContainingDocumentView!.props.Document;
                    currScale *= pme.GetFieldValue(KeyStore.Scale, NumberField, Number(0));
                } 
            } 
            this.x += dx/currScale;
            this.y += dy/currScale;
            DocumentDecorations.Instance.opacity = 0;
        }
    }

    onDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
        if (this._mainCont.current !== null) {
            this._mainCont.current.style.opacity = "0";
            // e.dataTransfer.setDragImage()
        }
    }

    onClick = (e: React.MouseEvent): void => {    }

    deleteClicked = (e: React.MouseEvent): void => {
        if (this.props.ContainingCollectionView instanceof CollectionFreeFormView) {
            this.props.ContainingCollectionView.removeDocument(this.props.Document)
        }
    }

    @action
    onContextMenu = (e: React.MouseEvent): void => {
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
                onPointerDown={this.onPointerDown}
                onClick={this.onClick}>
                <DocumentContents {...this.props} ContainingDocumentView={this} />
            </div>
        );
    }

}