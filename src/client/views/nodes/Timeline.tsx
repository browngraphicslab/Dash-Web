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
    private _keyBars: HTMLDivElement[] = [];
    private _actualKeyFrame: KeyFrame[] = [];

    private _currentBarX: number = 0;
    @observable private _onBar: Boolean = false;


    @action
    onRecord = (e: React.MouseEvent) => {
        this._isRecording = true;
    }

    @action
    onStop = (e: React.MouseEvent) => {
    }

    @action
    onInnerPointerDown = (e: React.PointerEvent) => {
        if (this._isRecording) {
            if (this._inner.current) {
                let mouse = e.nativeEvent;
                this._currentBar.style.transform = `translate(${mouse.offsetX}px)`;
                this._currentBarX = mouse.offsetX;
                console.log(mouse.offsetX);
            }
        }
    }

    createBar = (width: number, pos = 0, color = "green"): HTMLDivElement => {
        let bar = document.createElement("div");
        bar.style.height = "100%";
        bar.style.width = `${width}px`;
        bar.style.left = "mouse.offsetX";
        bar.style.backgroundColor = color;
        bar.style.transform = `translate(${pos}px)`;
        bar.style.position = "absolute";
        bar.style.zIndex = "2"; 
        return bar;
    }
    componentDidMount() {
        if (this._inner.current && this._currentBar === null) {
            this._currentBar = this.createBar(5);
            this._inner.current.appendChild(this._currentBar);
        }
        let doc: Document = this.props.Document;
        let childrenList = this.props.Document.GetList(this.props.fieldKey, [] as Document[]);
        // let keyFrame = new KeyFrame(); //should not be done here...
        // this._keyFrames.push(keyFrame);
        let keys = [KeyStore.X, KeyStore.Y];
        const addReaction = (element: Document) => {

            return reaction(() => {

                return keys.map(key => element.GetNumber(key, 0));
            }, data => {
                if (this._inner.current) {
                    let keyFrame: KeyFrame;
                    if (!this._keyBars[this._currentBarX]) {
                        let bar = this.createBar(5, this._currentBarX, "orange");
                        this._inner.current.appendChild(bar);
                        this._keyBars[this._currentBarX] = bar;
                        keyFrame = new KeyFrame();
                        this._keyFrames[this._currentBarX] = keyFrame;
                    } else {
                        keyFrame = this._keyFrames[this._currentBarX];
                    }
                    keys.forEach((key, index) => {
                        keyFrame.document.SetNumber(key, data[index]); //Tyler working on better Doc.ts functions...(this is currently not comprehensive...)
                    });
                }
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