import { observer } from "mobx-react";
import { NodeCollectionStore } from "../../stores/NodeCollectionStore";
import "./FreeFormCanvas.scss";
import { NodeContainer } from "./NodeContainer";
import React = require("react");
import { KeyStore } from "../../fields/Key";
import { NumberField } from "../../fields/NumberField";
import { TextField } from "../../fields/TextField";
import { action } from "mobx";

interface IProps {
    store: NodeCollectionStore
}

@observer
export class FreeFormCanvas extends React.Component<IProps> {

    private _isPointerDown: boolean = false;

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = true;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = false;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);

        let doc = this.props.store.Docs[0];
        let dataField = doc.GetFieldT(KeyStore.Data, TextField);
        let data = dataField ? dataField.Data : "";
        this.props.store.Docs[0].SetFieldValue(KeyStore.Data, data + " hello", TextField);
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!this._isPointerDown) {
            return;
        }
        this.props.store.X += e.movementX;
        this.props.store.Y += e.movementY;
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();
        e.preventDefault();

        let scaleAmount = 1 - (e.deltaY / 1000);
        this.props.store.Scale *= scaleAmount;
    }

    render() {
        let store = this.props.store;
        return (
            <div className="freeformcanvas-container" onPointerDown={this.onPointerDown} onWheel={this.onPointerWheel}>
                <div className="freeformcanvas" style={{ transform: store.Transform, transformOrigin: '50% 50%' }}>
                    <NodeContainer store={store} />
                </div>
            </div>
        );
    }
}