import { observer } from "mobx-react";
import { Key } from "../../fields/Key";
import { NodeCollectionStore } from "../../stores/NodeCollectionStore";
import "./FreeFormCanvas.scss";
import React = require("react");
import { action } from "mobx";
import { Document } from "../../fields/Document";
import {DocumentViewModel} from "../../viewmodels/DocumentViewModel";
import {DocumentView} from "../nodes/DocumentView";
import {TextField} from "../../fields/TextField";
import {ListField} from "../../fields/ListField";
import {Field} from "../../fields/Field";
import { SelectionManager } from "../../util/SelectionManager";

interface IProps {
    store: NodeCollectionStore;
}

@observer
export class FreeFormCanvas extends React.Component<IProps> {

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

        SelectionManager.DeselectAll()
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 2) {
            this._isPointerDown = false;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
        }

        // let doc = this.props.store.Docs[0];
        // let dataField = doc.GetFieldT(KeyStore.Data, TextField);
        // let data = dataField ? dataField.Data : "";
        // this.props.store.Docs[0].SetFieldValue(KeyStore.Data, data + " hello", TextField);
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        if (!this._isPointerDown) {
            return;
        }

        this.props.store.X += e.movementX;
        this.props.store.Y += e.movementY;
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();

        let scaleAmount = 1 - (e.deltaY / 1000);
        this.props.store.Scale *= scaleAmount;
    }

    render() {
        let store = this.props.store;
        return (
            <div className="freeformcanvas-container" onPointerDown={this.onPointerDown} onWheel={this.onPointerWheel} onContextMenu={(e) => e.preventDefault()}>
                <div className="freeformcanvas" style={{ transform: store.Transform, transformOrigin: '50% 50%' }}>
                    <div className="node-container">
                        {this.props.store.Docs.map(doc => {
                            return (<DocumentView key={doc.Id} dvm={doc} />);
                        })}
                    </div>
                </div>
            </div>
        );
    }
}