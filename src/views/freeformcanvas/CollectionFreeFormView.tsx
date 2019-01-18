import { observer } from "mobx-react";
import { Key, KeyStore } from "../../fields/Key";
import "./FreeFormCanvas.scss";
import React = require("react");
import { action } from "mobx";
import { Document } from "../../fields/Document";
import {DocumentViewModel} from "../../viewmodels/DocumentViewModel";
import {DocumentView} from "../nodes/DocumentView";
import {ListField} from "../../fields/ListField";
import {NumberField} from "../../fields/NumberField";

interface IProps {
    fieldKey:Key;
    doc:Document;
}

@observer
export class CollectionFreeFormView extends React.Component<IProps> {

    private _isPointerDown: boolean = false;

    constructor(props:IProps) {
        super(props);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 2) {
            this._isPointerDown = true;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 2) {
            this._isPointerDown = false;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
        }
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (!this._isPointerDown) {
            return;
        }
        const {doc} = this.props;
        let x = doc.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        let y = doc.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        doc.SetFieldValue(KeyStore.PanX, x+e.movementX, NumberField);
        doc.SetFieldValue(KeyStore.PanY, y+e.movementY, NumberField);
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();

        let scaleAmount = 1 - (e.deltaY / 1000);
        //this.props.store.Scale *= scaleAmount;
    }

    render() {
        const {fieldKey, doc} = this.props;
        const value: Document[] = doc.GetFieldValue(fieldKey, ListField, []);
        const panx: number = doc.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        const pany: number = doc.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        return (
            <div className="collectionfreeformview-container" onPointerDown={this.onPointerDown} onWheel={this.onPointerWheel} onContextMenu={(e) => e.preventDefault()}>
                <div className="collectionfreeformview" style={{ transform: `translate(${panx}px, ${pany}px)`, transformOrigin: '50% 50%' }}>
                    <div className="node-container">
                        {value.map(doc => {
                            return (<DocumentView key={doc.Id} dvm={new DocumentViewModel(doc)} />);
                        })}
                    </div>
                </div>
            </div>
        );
    }
}