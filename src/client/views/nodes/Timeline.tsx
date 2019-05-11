import * as React from "react";
import * as ReactDOM from "react-dom";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray } from "mobx";
import "./Timeline.scss";
import { KeyFrame } from "./KeyFrame";
import { CollectionViewProps } from "../collections/CollectionBaseView";
import { CollectionSubView, SubCollectionViewProps } from "../collections/CollectionSubView";
import { DocumentViewProps } from "./DocumentView";

import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { Doc, Self } from "../../../new_fields/Doc";
import { Document, listSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast } from "../../../new_fields/Types";

@observer
export class Timeline extends CollectionSubView(Document) {
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
        let doc: Doc = this.props.Document;
        let test = this.props.Document[this.props.fieldKey];
        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
        // let keyFrame = new KeyFrame(); //should not be done here...
        // this._keyFrames.push(keyFrame)";
        if (!children) {
            return;
        }
        let childrenList = (children[Self] as any).__fields;
        let keys = ["x", "y"];
        const addReaction = (element: Doc) => {
            return reaction(() => {

                return keys.map(key => FieldValue(element[key]));
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
                        keyFrame.document[key] = data[index];
                    });
                }
            });
        };
        observe(childrenList as IObservableArray<Doc>, change => {
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
                    {/* <button onClick={this.onStop}>Stop</button> */}
                    <input placeholder="Time"></input>
                </div>
            </div>
        );
    }
}