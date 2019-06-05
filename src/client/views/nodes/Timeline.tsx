import * as React from "react";
import * as ReactDOM from "react-dom";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray } from "mobx";
import "./Timeline.scss";
import { KeyFrame } from "./KeyFrame";
import { CollectionViewProps } from "../collections/CollectionBaseView";
import { CollectionSubView, SubCollectionViewProps } from "../collections/CollectionSubView";
import { DocumentViewProps, DocumentView } from "./DocumentView";

import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { Doc, DocListCastAsync, FieldResult } from "../../../new_fields/Doc";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast } from "../../../new_fields/Types";
import { emptyStatement } from "babel-types";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import { List } from "../../../new_fields/List";
import { Self } from "../../../new_fields/FieldSymbols";

type IndividualDocKeyFrame = List<Doc>;
type KeyframeList = List<List<Doc>>;

const PositionSchema = createSchema({
    x: defaultSpec("number", 0),
    y: defaultSpec("number", 0)
});

type Position = makeInterface<[typeof PositionSchema]>;
const Position = makeInterface(PositionSchema);

const TimeAndPositionSchema = createSchema({
    time: defaultSpec("number", 0),
    keyframe: Doc //Position
});

type TimeAndPosition = makeInterface<[typeof TimeAndPositionSchema]>;
const TimeAndPosition = makeInterface(TimeAndPositionSchema);

@observer
export class Timeline extends CollectionSubView(Document) {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _timeInput = React.createRef<HTMLInputElement>();

    @observable private _isRecording: Boolean = false;
    @observable private _currentBar: any = null;
    @observable private _newBar: any = null;
    private _reactionDisposers: IReactionDisposer[] = [];
    private _keyFrames: KeyFrame[] = [];
    private _keyBars: HTMLDivElement[] = [];

    private _currentBarX: number = 0;
    @observable private _onBar: Boolean = false;
    @observable private _keys = ["x", "y"];
    @observable private _frames: Doc[] = [];
    // @observable private _keyList: String[] = []; //list of _keys
    // @observable private _keyFrameList: String[] = []; //list of _keyList
    // @observable private _topLevelList: String[] = []; //list of _keyFrameList


    @action
    onRecord = (e: React.MouseEvent) => {
        this._isRecording = true;
        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
        if (!children) {
            return;
        }
        let childrenList = (children[Self] as any).__fields;
        // let keys = ["x", "y"]; //maybe make this an instance var?

        const addReaction = (element: Doc) => {
            element = (element as any).value();
            return reaction(() => {
                return this._keys.map(key => FieldValue(element[key]));
            }, async data => { //where is the data index actually being set?
                if (this._inner.current) {
                    let keyFrame: KeyFrame; //keyframe reference
                    //is KeyFrame just a wrapper for a doc? cause then could just be of type doc...
                    let exists: boolean = false;
                    let time: number = this._currentBarX; //time that indicates what frame you are in. Whole numbers. 
                    // let frames: List<Doc>; //don't know if this should be an instance...
                    this._keyFrames.forEach(async kf => { //checks if there is a keyframe that is tracking this document. 
                        if (kf.doc.document === element) {
                            keyFrame = kf;
                            this._frames = (await DocListCastAsync(keyFrame.doc.frames))!;
                            exists = true;
                        }
                    });

                    if (!exists) {
                        keyFrame = new KeyFrame();
                        let bar: HTMLDivElement = this.createBar(5, time, "yellow");
                        this._inner.current.appendChild(bar);
                        // keyFrame.doc.bar = bar;
                        keyFrame.doc.frames = new List<Doc>();

                        this._keyFrames.push(keyFrame);
                    }

                    this._keys.forEach((key, index) => {
                        console.log(data[index]);
                        if (keyFrame.doc.frames !== undefined) {
                            this._frames.forEach(frame => {
                                if (frame.time === this._currentBarX) {
                                    frame[key] = data[index];
                                }
                            });
                        }
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

    //maybe to be called in innerPointerDown
    //this is the only method that should have access to time changes
    //should run every time the time has been changed
    //should look through the array of times and positions and set docs to the positions associated with the specific time
    //if there is not an entry in the array associated with the time (for now) choose the next existing lower/higher time entry, etc.
    //eventually there will be interpolation between these existing times 
    //will be similar to last block of code in the onRecord reaction, but kind of doing the opposite...


    @action
    timeChange = async (time: number) => { //x position of mouse relative to inner box can be passed in?
        //data is list of docs
        let keyFrame: TimeAndPosition; //keyframe reference
        const docs = (await DocListCastAsync(this.props.Document[this.props.fieldKey]))!;
        const kfList: KeyframeList = Cast(this.props.Document.keyframes, listSpec(Doc)) as any;
        const list = await Promise.all(kfList.map(l => Promise.all(l)));
        for (let i in docs) {
            let oneDoc = docs[i];
            let oneKf: TimeAndPosition[] = list[i].map(TimeAndPosition); //use child getter if keyframes is list of keyframes (because collection is list of children)

            //first find frame with closest time
            //after find frame: need to do await for specific frame, except cast to Doc instead of listSpec(Doc)
            //then make a promise for that 
            //_frames array is probably irrelevant (so can probably get rid of this._keyFrames.forEach(async).. section)
            //lastly, set all properties of current keyframe to that of the stored and now accessed keyframe (singleKf)***

            let updatedKf!: TimeAndPosition;

            for (let j in oneKf) {
                let singleKf: TimeAndPosition = oneKf[j];
                let leftMin: Number = Infinity;
                let rightMin: Number = Infinity;
                let leftKf: TimeAndPosition;
                let rightKf: TimeAndPosition;
                if (singleKf.time !== time) { //choose closest time neighbor and reset singleKf to that keyFrame
                    for (let k in oneKf) {
                        if (oneKf[k].time < time) {
                            const diff: Number = Math.abs(oneKf[k].time - time);
                            if (diff < leftMin) {
                                leftMin = diff;
                                leftKf = oneKf[k];
                            }
                        } else {
                            const diff: Number = Math.abs(oneKf[k].time - time);
                            if (diff < rightMin) {
                                rightMin = diff;
                                rightKf = oneKf[k];
                            }
                        }
                    }
                }
            }
        }
    }

    @action
    displayKeyFrames = (dv: DocumentView) => {
        console.log(dv);
        dv.props.Document;

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
        this._currentBar.style.transform = `translate(${offsetX}px)`; //styling should not have to be done this way...maybe done through react??
        console.log(offsetX);
        console.log(this._currentBarX);
    }

    createBar = (width: number, pos: number = 0, color: string = "green"): HTMLDivElement => {
        let bar = document.createElement("div");
        bar.style.height = "100%";
        bar.style.width = `${width}px`;
        bar.style.backgroundColor = color;
        bar.style.transform = `translate(${pos}px)`; //repeated code from previous method
        bar.style.position = "absolute";
        bar.style.pointerEvents = "none";
        return bar;
    }

    onTimeEntered = (e: React.KeyboardEvent) => {
        if (this._timeInput.current) {
            if (e.keyCode === 13) {
                let input = parseInt(this._timeInput.current.value) || 0;
                this._currentBar.style.transform = `translate(${input}px)`;
                this._currentBarX = input;
            }
        }
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
                            {
                                SelectionManager.SelectedDocuments().map((dv) => {
                                    this.displayKeyFrames(dv);
                                })
                            }
                        </div>
                    </div>
                    <button onClick={this.onRecord}>Record</button>
                    <input placeholder="Time" ref={this._timeInput} onKeyDown={this.onTimeEntered}></input>
                </div>
            </div>
        );
    }
}