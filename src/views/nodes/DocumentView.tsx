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
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

interface IProps {
    dvm: DocumentViewModel;
}

@observer
export class DocumentView extends React.Component<IProps> {
    @computed
    get x(): number {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.X, NumberField, Number(0));
    }

    @computed
    get y(): number {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.Y, NumberField, Number(0));
    }

    set x(x: number) {
        this.props.dvm.Doc.SetFieldValue(KeyStore.X, x, NumberField)
    }

    set y(y: number) {
        this.props.dvm.Doc.SetFieldValue(KeyStore.Y, y, NumberField)
    }

    @computed
    get transform(): string {
        return `translate(${this.x}px, ${this.y}px)`;
    }

    @computed
    get width(): number {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.Width, NumberField, Number(0));
    }

    @computed
    get height(): number {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.Height, NumberField, Number(0));
    }

    //Temp
    @computed
    get data(): string {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.Data, TextField, String(""));
    }

    @computed
    get layout(): string {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.Layout, TextField, String("<p>Error loading layout data</p>"));
    }

    @computed
    get layoutKeys(): Key[] {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.LayoutKeys, ListField, new Array<Key>());
    }

    @computed
    get layoutFields(): Key[] {
        return this.props.dvm.Doc.GetFieldValue(KeyStore.LayoutFields, ListField, new Array<Key>());
    }

    @computed
    get selected() : string {
        return SelectionManager.IsSelected(this) ? "5px solid black" : "0px"
    }

    private _isPointerDown = false;

    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 2) {
            this._isPointerDown = true;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
        SelectionManager.SelectDoc(this, e.ctrlKey)
    }

    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 2) {
            e.preventDefault();
            this._isPointerDown = false;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
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
    }

    render() {
        let doc = this.props.dvm.Doc;
        let bindings: any = {
            doc: doc,
            isSelected: this.selected
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
        
        return (
            <div className="node" style={{
                transform: this.transform,
                width: this.width,
                height: this.height,
                border: this.selected
            }} onPointerDown={this.onPointerDown} onContextMenu={
                (e) => {
                    e.preventDefault()
                }}>
                <JsxParser
                    components={{ FieldTextBox, FreeFormCanvas, CollectionFreeFormView }}
                    bindings={bindings}
                    jsx={this.layout}
                />
            </div>
        );
    }

}