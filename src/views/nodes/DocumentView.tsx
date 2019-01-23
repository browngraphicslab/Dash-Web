import { observer } from "mobx-react";
import React = require("react");
import { computed, observable } from "mobx";
import { KeyStore, Key } from "../../fields/Key";
import { NumberField } from "../../fields/NumberField";
import { TextField } from "../../fields/TextField";
import { DocumentViewModel } from "../../viewmodels/DocumentViewModel";
import { ListField } from "../../fields/ListField";
import { FieldTextBox } from "../nodes/FieldTextBox"
import { FreeFormCanvas } from "../freeformcanvas/FreeFormCanvas"
import { CollectionFreeFormView } from "../freeformcanvas/CollectionFreeFormView"
import "./NodeView.scss"
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentDecorations } from "../../DocumentDecorations";
import { SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS } from "constants";
import { DragManager } from "../../util/DragManager";
import { Document } from "../../fields/Document";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

interface IProps {
    dvm: Document;
}

@observer
class DocumentContents extends React.Component<IProps & {isSelected: () => boolean}> {

    @computed
    get layout(): string {
        return this.props.dvm.GetFieldValue(KeyStore.Layout, TextField, String("<p>Error loading layout data</p>"));
    }

    @computed
    get layoutKeys(): Key[] {
        return this.props.dvm.GetFieldValue(KeyStore.LayoutKeys, ListField, new Array<Key>());
    }

    @computed
    get layoutFields(): Key[] {
        return this.props.dvm.GetFieldValue(KeyStore.LayoutFields, ListField, new Array<Key>());
    }
    render() {
        let doc = this.props.dvm;
        let bindings: any = {
            doc: doc,
            isSelected: this.props.isSelected
        };
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
            components={{ FieldTextBox, FreeFormCanvas, CollectionFreeFormView }}
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

    get screenRect(): ClientRect | DOMRect {
        if (this._mainCont.current) {
            return this._mainCont.current.getBoundingClientRect();
        }
        return new DOMRect();
    }

    @computed
    get x(): number {
        return this.props.dvm.GetFieldValue(KeyStore.X, NumberField, Number(0));
    }

    @computed
    get y(): number {
        return this.props.dvm.GetFieldValue(KeyStore.Y, NumberField, Number(0));
    }

    set x(x: number) {
        this.props.dvm.SetFieldValue(KeyStore.X, x, NumberField)
    }

    set y(y: number) {
        this.props.dvm.SetFieldValue(KeyStore.Y, y, NumberField)
    }

    @computed
    get transform(): string {
        return `translate(${this.x}px, ${this.y}px)`;
    }

    @computed
    get width(): number {
        return this.props.dvm.GetFieldValue(KeyStore.Width, NumberField, Number(0));
    }

    set width(w: number) {
        this.props.dvm.SetFieldValue(KeyStore.Width, w, NumberField)
    }

    @computed
    get height(): number {
        return this.props.dvm.GetFieldValue(KeyStore.Height, NumberField, Number(0));
    }

    set height(h: number) {
        this.props.dvm.SetFieldValue(KeyStore.Height, h, NumberField)
    }

    @computed
    get selected(): boolean {
        return SelectionManager.IsSelected(this)
    }

    isSelected = (): boolean => {
        return this.selected
    }

    private _isPointerDown = false;

    componentDidMount() {
        // if(this._mainCont.current) {
        //     DragManager.MakeDraggable(this._mainCont.current, {
        //         buttons: 2,
        //         handlers: {
        //             dragComplete: () => {},
        //             dragStart: () => {}
        //         }
        //     })
        // }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        // return;
        e.stopPropagation();
        if (e.button === 2) {
            this._isPointerDown = true;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        } else {
            SelectionManager.SelectDoc(this, e.ctrlKey)
        }
    }

    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 2) {
            e.preventDefault();
            this._isPointerDown = false;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            DocumentDecorations.Instance.opacity = 1
        }
    }

    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!this._isPointerDown) {
            return;
        }
        this.x += e.movementX;
        this.y += e.movementY;
        //DocumentDecorations.Instance.opacity = 0
    }

    onDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
        if (this._mainCont.current !== null) {
            this._mainCont.current.style.opacity = "0";
            // e.dataTransfer.setDragImage()
        }
    }

    render() {
        return (
            <div className="node" ref={this._mainCont} style={{
                transform: this.transform,
                width: this.width,
                height: this.height,
            }}
                onContextMenu={
                    (e) => {
                        e.preventDefault()
                    }}
                onPointerDown={this.onPointerDown}>
                <DocumentContents dvm={this.props.dvm} isSelected={this.isSelected} />
            </div>
        );
    }

}