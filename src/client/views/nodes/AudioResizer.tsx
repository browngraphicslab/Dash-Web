import { observer } from "mobx-react"
import React = require("react");
import "./AudioResizer.scss";

@observer
export class AudioResizer extends React.Component {
    private _isPointerDown = false;

    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = true;
        console.log("click");

        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = false;

        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        console.log("drag");

        if (!this._isPointerDown) {
            return;
        }

        let resize = document.getElementById("resizer");
        if (resize) {
            resize.style.right += e.movementX;
        }
    }

    render() {
        return <div className="resizer" onPointerDown={this.onPointerDown}></div>
    }
}