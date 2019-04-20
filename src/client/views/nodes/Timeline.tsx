import * as React from "react";
import * as ReactDOM from "react-dom";
import { observer } from "mobx-react";
import { observable, reaction, action } from "mobx";
import "./Timeline.scss";
import { KeyStore } from "../../../fields/KeyStore";
import { Document } from "../../../fields/Document";
import { KeyFrame } from "./KeyFrame";

@observer
export class Timeline extends React.Component {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _isRecording: Boolean = false;
    @observable private _currentBar: any = null;
    @observable private _newBar: any = null;

    @action
    onRecord = (e: React.MouseEvent) => {
        this._isRecording = true;
    }

    @action
    onStop = (e: React.MouseEvent) => {
        this._isRecording = false;
        if (this._inner.current) { //if you comment this section out it works as before...
            this._newBar = document.createElement("div");
            this._newBar.style.height = "100%";
            this._newBar.style.width = "5px";
            this._newBar.style.backgroundColor = "yellow";
            this._newBar.style.transform = this._currentBar.style.transform;
            this._inner.current.appendChild(this._newBar);
        }
        this._currentBar.remove();
        this._currentBar = null;
    }

    @action
    onInnerPointerDown = (e: React.PointerEvent) => {
        if (this._isRecording) {
            if (this._inner.current) {
                let mouse = e.nativeEvent;
                this._currentBar.style.transform = `translate(${mouse.offsetX}px)`;
            }
        }
    }

    createMark = (width: number) => {

    }

    private _keyFrames: KeyFrame[] = [];

    createBar = (width: number) => {
        if (this._inner.current) {
            this._currentBar = document.createElement("div");
            this._currentBar.style.height = "100%";
            this._currentBar.style.width = `${width}px`;
            this._currentBar.style.left = "mouse.offsetX";
            this._currentBar.style.backgroundColor = "green";
            this._currentBar.style.transform = `translate(${0}px)`;
            this._inner.current.appendChild(this._currentBar);
        }

    }

    componentDidMount() {
        this.createBar(5);
        // let doc: Document;
        // let keyFrame = new KeyFrame(); 
        // this._keyFrames.push(keyFrame); 
        // let keys = [KeyStore.X, KeyStore.Y];
        // reaction(() => {
        //     return keys.map(key => doc.GetNumber(key, 0));
        // }, data => {
        //     keys.forEach((key, index) => {
        //         keyFrame.document().SetNumber(key, data[index]);
        //     });
        // });
    }

    render() {
        return (
            <div>
                <div className="timeline-container">
                    <div className="timeline">
                        <div className="inner" ref={this._inner} onPointerDown={this.onInnerPointerDown}>
                        </div>
                    </div>
                    <button onClick={this.onRecord}>Record</button>
                    <button onClick={this.onStop}>Stop</button>
                    <input placeholder="Time"></input>
                </div>
            </div>
        );
    }
}