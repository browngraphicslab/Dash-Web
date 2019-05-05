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
import { emptyStatement } from "babel-types";

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

        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
        // let keyFrame = new KeyFrame(); //should not be done here...
        // this._keyFrames.push(keyFrame)";
        if (!children) {
            return;
        }
        let childrenList = (children[Self] as any).__fields;
        let keys = ["x", "y"];
        const addReaction = (element: Doc) => {
            element = (element as any).value();
            return reaction(() => {
                console.log("react");

                return keys.map(key => FieldValue(element[key]));
            }, data => {
                if (this._inner.current) {
                    let keyFrame: KeyFrame;
                    if (!this._keyBars[this._currentBarX]) {

                        let bar = this.createBar(5, this._currentBarX, "orange");
                        console.log("created!");
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

    @action
    onStop = (e: React.MouseEvent) => {
    }


    @action
    onInnerPointerUp = (e: React.PointerEvent) => {
        if (this._inner.current) {
            this._inner.current.removeEventListener("pointermove", this.onInnerPointerMove);
        }
    }

    @action
    onInnerPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._isRecording) {
            if (this._inner.current) {
                let mouse = e.nativeEvent;
                let offsetX = Math.round(mouse.offsetX);
                this._currentBarX = offsetX;
                this._currentBar.style.transform = `translate(${offsetX}px)`;
                this._inner.current.removeEventListener("pointermove", this.onInnerPointerMove); //reset
                this._inner.current.addEventListener("pointermove", this.onInnerPointerMove);
            }
        }
    }

    @action
    onInnerPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let offsetX = Math.round(e.offsetX);
        this._currentBarX = offsetX;
        this._currentBar.style.transform = `translate(${offsetX}px)`;
        console.log(offsetX);
        console.log(this._currentBarX);
    }

    createBar = (width: number, pos = 0, color = "green"): HTMLDivElement => {
        let bar = document.createElement("div");
        bar.style.height = "100%";
        bar.style.width = `${width}px`;
        bar.style.backgroundColor = color;
        bar.style.transform = `translate(${pos}px)`;
        bar.style.position = "absolute";
        bar.style.pointerEvents = "none";
        return bar;
    }
    componentDidMount() {
        if (this._inner.current && this._currentBar === null) {
            this._currentBar = this.createBar(5);
            this._inner.current.appendChild(this._currentBar);
        }

        let doc: Doc = this.props.Document;
        let test = this.props.Document[this.props.fieldKey];

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
                        <div className="inner" ref={this._inner} onPointerDown={this.onInnerPointerDown} onPointerUp={this.onInnerPointerUp}>
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