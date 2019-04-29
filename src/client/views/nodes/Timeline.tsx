import * as React from "react";
import * as ReactDOM from "react-dom";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray } from "mobx";
import "./Timeline.scss";
import { KeyStore } from "../../../fields/KeyStore";
import { Document } from "../../../fields/Document";
import { KeyFrame } from "./KeyFrame";
import { CollectionViewProps } from "../collections/CollectionBaseView";
import { CollectionSubView, SubCollectionViewProps } from "../collections/CollectionSubView";
import { DocumentViewProps } from "./DocumentView";

import { Opt } from '../../../fields/Field';
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";

@observer
export class Timeline extends React.Component<SubCollectionViewProps> {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _isRecording: Boolean = false;
    @observable private _currentBar: any = null;
    @observable private _newBar: any = null;
    private _reactionDisposers: IReactionDisposer[] = [];
    private _keyFrames: KeyFrame[] = [];
    @observable private _onBar: Boolean = false;

    @action
    onRecord = (e: React.MouseEvent) => {
        this._isRecording = true;
    }

    @action
    onStop = (e: React.MouseEvent) => {
        this._isRecording = false;
        if (this._inner.current) {
            this._newBar = document.createElement("div");
            this._newBar.style.height = "100%";
            this._newBar.style.width = "5px";
            this._newBar.style.backgroundColor = "yellow";
            this._newBar.style.position = "absolute";
            this._newBar.style.transform = this._currentBar.style.transform;
            this._inner.current.appendChild(this._newBar);
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

    createBar = (width: number) => {
        if (this._inner.current) {
            this._currentBar = document.createElement("div");
            this._currentBar.style.height = "100%";
            this._currentBar.style.width = `${width}px`;
            this._currentBar.style.left = "mouse.offsetX";
            this._currentBar.style.backgroundColor = "green";
            this._currentBar.style.transform = `translate(${0}px)`;
            this._currentBar.style.position = "absolute";
            this._currentBar.onPointerDown(this.selectFrame);
            this._inner.current.appendChild(this._currentBar);
        }
    }

    selectFrame = (e: React.PointerEvent) => {
        this._onBar = true; //where to set back to false?
        //let frame = document.getSelectedElement(e)
    }

    componentDidMount() {
        this.createBar(5);
        let doc: Document = this.props.Document;
        let childrenList = this.props.Document.GetList(this.props.fieldKey, [] as Document[]);
        // let keyFrame = new KeyFrame(); //should not be done here...
        // this._keyFrames.push(keyFrame);
        let keys = [KeyStore.X, KeyStore.Y];
        const addReaction = (element: Document) => {
            return reaction(() => {
                return keys.map(key => element.GetNumber(key, 0));
            }, data => {
                let keyFrame = new KeyFrame();
                if (this._onBar) { //need to set value of onBar somewhere... -> if already on key frame use this keyframe
                    // keyFrame = function that returns current keyFrame;
                } else { //else create new keyframe
                    this._keyFrames.push(keyFrame);
                }
                keys.forEach((key, index) => {
                    console.log("moved!"); //store key frames -> need to create a way to do this (data structure??)
                    keyFrame.document().SetNumber(key, data[index]); //Tyler working on better Doc.ts functions...(this is currently not comprehensive...)
                });
            });
        };
        observe(childrenList as IObservableArray<Document>, change => {
            if (change.type === "update") {
                this._reactionDisposers[change.index]();
                this._reactionDisposers[change.index] = addReaction(change.newValue);
            } else {
                let removed = this._reactionDisposers.splice(change.index, change.removedCount, ...change.added.map(addReaction));
                removed.forEach(disp => disp());
            }
        }, true);
    }

    componentWillUnmount() {
        this._reactionDisposers.forEach(disp => disp());
        this._reactionDisposers = [];
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