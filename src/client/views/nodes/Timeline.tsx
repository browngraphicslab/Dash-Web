import * as React from "react";
import * as ReactDOM from "react-dom";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer } from "mobx";
import "./Timeline.scss";
import { KeyStore } from "../../../fields/KeyStore";
import { Document } from "../../../fields/Document";
import { KeyFrame } from "./KeyFrame";
<<<<<<< HEAD
import { CollectionViewProps } from "../collections/CollectionBaseView";
import { CollectionSubView } from "../collections/CollectionSubView"; 
import { DocumentViewProps } from "./DocumentView";

=======
import { Opt } from '../../../fields/Field';
>>>>>>> 6304e03f953b2cc66dcc1a0900855376ff739015

@observer
export class Timeline extends React.Component<DocumentViewProps> {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _isRecording: Boolean = false;
    @observable private _currentBar: any = null;
    @observable private _newBar: any = null;
    private _reactionDisposer: Opt<IReactionDisposer>;

    @action
    onRecord = (e: React.MouseEvent) => {
        this._isRecording = true;
    }

    @action
    onStop = (e: React.MouseEvent) => {
        this._isRecording = false;
<<<<<<< HEAD
        if (this._inner.current) {
            
=======
        if (this._inner.current) { //if you comment this section out it works as before...
            this._newBar = document.createElement("div");
            this._newBar.style.height = "100%";
            this._newBar.style.width = "5px";
            this._newBar.style.backgroundColor = "yellow";
            this._newBar.style.transform = this._currentBar.style.transform;
            this._inner.current.appendChild(this._newBar);
>>>>>>> 6304e03f953b2cc66dcc1a0900855376ff739015
        }
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
<<<<<<< HEAD
        let doc: Document = this.props.Document;
        console.log(doc.Get(KeyStore.BackgroundColor)); 
        let keyFrame = new KeyFrame(); 
        this._keyFrames.push(keyFrame); 
        let keys = [KeyStore.X, KeyStore.Y];
        reaction(() => {       
=======
        let doc: Document;
        let keyFrame = new KeyFrame();
        this._keyFrames.push(keyFrame);
        let keys = [KeyStore.X, KeyStore.Y];
        this._reactionDisposer = reaction(() => {
>>>>>>> 6304e03f953b2cc66dcc1a0900855376ff739015
            return keys.map(key => doc.GetNumber(key, 0));
        }, data => {
            keys.forEach((key, index) => {
                keyFrame.document().SetNumber(key, data[index]);
            });
        });
<<<<<<< HEAD

        console.log(keyFrame.document +  "Document"); 
=======
    }

    componentWillUnmount() {
        if (this._reactionDisposer) {
            this._reactionDisposer();
            this._reactionDisposer = undefined;
        }
>>>>>>> 6304e03f953b2cc66dcc1a0900855376ff739015
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