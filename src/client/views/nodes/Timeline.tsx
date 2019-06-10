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
import { Doc, DocListCastAsync } from "../../../new_fields/Doc";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast } from "../../../new_fields/Types";
import { emptyStatement } from "babel-types";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import { List } from "../../../new_fields/List";
import { Self } from "../../../new_fields/FieldSymbols";
import { list } from "serializr";
import { arrays } from "typescript-collections";
import { forEach } from "typescript-collections/dist/lib/arrays";

type Data = List<Doc>; //data?
type Keyframes = List<List<Doc>>;

const PositionSchema = createSchema({
    x: defaultSpec("number", 0),
    y: defaultSpec("number", 0)
});

type Position = makeInterface<[typeof PositionSchema]>;
const Position = makeInterface(PositionSchema);

const TimeAndPositionSchema = createSchema({
    time: defaultSpec("number", 0),
    position: Doc
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

    @observable private _currentBarX: number = 0;
    @observable private _onBar: Boolean = false;
    @observable private _keys = ["x", "y"];
    @observable private _data: Doc[] = []; // 1D list of nodes
    @observable private _keyframes: Doc[][] = []; //2D list of infos

    @observable private TEMPNUM = 0; 
    @action
    onRecord = (e: React.MouseEvent) => {
        if (this._isRecording === true){
            this._isRecording = false; 
            return; 
        }
        this._isRecording = true;
        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
        if (!children) {
            return;
        }
        let childrenList = (children[Self] as any).__fields;

        const addReaction = (node: Doc) => {
            node = (node as any).value();
            return reaction(() => {
                return this._keys.map(key => FieldValue(node[key]));
            }, async data => {
                if (this.TEMPNUM === 1){ //very hacky... we want the reaction to run only once
                    this.storeKeyChange(node); 
                    this.TEMPNUM = 0; 
                } else {
                    this.TEMPNUM = 1; 
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



    storeKeyChange = (node:Doc) =>{
        if (this._inner.current) {
            if (!this._barMoved) {
                if (this._data.indexOf(node) === -1) {
                    const kf = new List();
                    this._data.push(node);
                    let index = this._data.indexOf(node);
                    let timeandpos = this.setTimeAndPos(node);

                    let info: Doc[] = new Array(1000); //////////////////////////////////////////////////// do something  
                    info[this._currentBarX] = timeandpos;

                    this._keyframes[index] = info;

                    //graphical yellow bar
                    let bar: HTMLDivElement = this.createBar(5, this._currentBarX, "yellow");
                    this._inner.current.appendChild(bar);
                } else {  
                    let index = this._data.indexOf(node);
                    if (this._keyframes[index][this._currentBarX] === undefined) { //when node is in data, but doesn't have data for this specific time. 
                        console.log("does not have specific time"); 
                        let timeandpos = this.setTimeAndPos(node);
                        this._keyframes[index][this._currentBarX] = timeandpos;   
                        let bar: HTMLDivElement = this.createBar(5, this._currentBarX, "yellow");
                        this._inner.current.appendChild(bar);
                        //@ts-ignore
                        console.log(timeandpos.position.y + " stored position" ); 
                        console.log(node.y + " actual node"); 
                    } else { //when node is in data, and has data for this specific time
                        console.log("else"); 
                        let timeandpos = this.setTimeAndPos(node);
                        //@ts-ignore
                        console.log(node.y + " actual node"); 
                        this._keyframes[index][this._currentBarX] = timeandpos;
                        //@ts-ignore
                        console.log(this._keyframes[index][this._currentBarX].position.y + " stored pos"); 

                    }
                }
            }

        }
    }
    setTimeAndPos = (node: Doc) => {
        let pos: Position = Position(node);
        let timeandpos = new Doc();
        const newPos = new Doc();
        this._keys.forEach(key => newPos[key] = pos[key]);
        timeandpos.position = newPos;
        timeandpos.time = this._currentBarX;
        return timeandpos;
    }


    @action
    timeChange = async (time: number) => {
        //const docs = (await DocListCastAsync(this.props.Document[this.props.fieldKey]))!;
        //const kfList:Doc[][] = Cast(this._keyframes, listSpec(Doc), []) as any;
        const docs = this._data;
        const kfList: Doc[][] = this._keyframes;

        const list = await Promise.all(kfList.map(l => Promise.all(l)));
        let isFrame: boolean = false;

        docs.forEach(async (oneDoc, i) => {
            let leftKf!: TimeAndPosition;
            let rightKf!: TimeAndPosition;
            let oneKf = this._keyframes[i];
            oneKf.forEach((singleKf) => {
                if (singleKf !== undefined) {
                    let leftMin = Infinity;
                    let rightMin = Infinity;
                    if (singleKf.time !== time) { //choose closest time neighbors
                        leftMin = this.calcMinLeft(oneKf, time);
                        if (leftMin !== Infinity) {
                            leftKf = TimeAndPosition(this._keyframes[i][leftMin]);
                        }
                        rightMin = this.calcMinRight(oneKf, time);
                        if (rightMin !== Infinity) {
                            rightKf = TimeAndPosition(this._keyframes[i][rightMin]);
                        }
                    }
                }
            });
            
            if (leftKf && rightKf) {
                this.interpolate(oneDoc, leftKf, rightKf, this._currentBarX);
            } else {
                               
            }
        });
    }

    calcMinLeft = (kfList: Doc[], time: number): number => { //returns the time of the closet keyframe to the left
        let counter: number = Infinity;
        let leftMin: number = Infinity;
        kfList.forEach((kf) => {
            if (kf !== undefined && NumCast(kf.time) < time) { //ERROR: "cannot read property time of undefined"
                let diff: number = Math.abs(NumCast(kf.time) - time);
                if (diff < counter) {
                    counter = diff;
                    leftMin = NumCast(kf.time);
                }
            }
        });
        return leftMin;
    }

    calcMinRight = (kfList: Doc[], time: number): number => { //returns the time of the closest keyframe to the right 
        let counter: number = Infinity;
        let rightMin: number = Infinity;
        kfList.forEach((kf) => {
            if (kf !== undefined && NumCast(kf.time) > time) {
                let diff: number = Math.abs(NumCast(kf.time!) - time);
                if (diff < counter) {
                    counter = diff;
                    rightMin = NumCast(kf.time);
                }
            }
        });
        return rightMin;
    }


    /**
     * Linearly interpolates a document from time1 to time2 
     * @param Doc that needs to be modified
     * @param  
     */
    @action
    interpolate = async (doc: Doc, kf1: TimeAndPosition, kf2: TimeAndPosition, time: number) => {
        const keyFrame1 = (await kf1.position)!;
        const keyFrame2 = (await kf2.position)!;

        const dif_time = kf2.time - kf1.time;
        const ratio = (time - kf1.time) / dif_time;

        this._keys.forEach(key => {
            const diff = NumCast(keyFrame2[key]) - NumCast(keyFrame1[key]);
            const adjusted = diff * ratio;
            doc[key] = NumCast(keyFrame1[key]) + adjusted;
        });
    }


    private _barMoved: boolean = false;
    @action
    onInnerPointerUp = (e: React.PointerEvent) => {             
        if (this._inner.current) {
            this._barMoved = false;
            this._inner.current.removeEventListener("pointermove", this.onInnerPointerMove);
        }
        this._data.forEach((node) => {
            console.log(node.y); 
        }); 
    }

    @action
    onInnerPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._isRecording) {
            if (this._inner.current) {
                this._barMoved = true;
                let mouse = e.nativeEvent;
                let offsetX = Math.round(mouse.offsetX);
                this._currentBarX = offsetX;
                this._currentBar.style.transform = `translate(${offsetX}px)`;
                this._inner.current.removeEventListener("pointermove", this.onInnerPointerMove); //reset
                this._inner.current.addEventListener("pointermove", this.onInnerPointerMove);
                this.timeChange(this._currentBarX);
            }

        }
    }

    @action
    onInnerPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this._barMoved = true;
        let offsetX = Math.round(e.offsetX);
        this._currentBarX = offsetX;
        this._currentBar.style.transform = `translate(${offsetX}px)`; //styling should not have to be done this way...maybe done through react??
        this.timeChange(this._currentBarX);
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

    @action
    displayKeyFrames = async (dv: DocumentView) => {
        console.log("hi"); 
        let doc:Doc = dv.props.Document;
        let inner:HTMLDivElement = (await this._inner.current)!;
        this._data.forEach((node) => {
            if (node === doc){        
                this.clearBars(); 
                const index = this._data.indexOf(node); 
                this._keyframes[index].forEach((time) => {
                    if (time !== undefined){
                        let timeandpos = TimeAndPosition(time);
                        let bar: HTMLDivElement = this.createBar(5, this._currentBarX, "yellow");
                        inner.appendChild(bar);
                    }
                })
            }
        }); 

    }

    @action 
    clearBars = async () => {
        let inner:HTMLDivElement = (await this._inner.current)!;
        inner.childNodes.forEach((bar) => {
            if (bar !== this._currentBar){
                inner.removeChild(bar);
            }
        }); 
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
                                })}
                        </div>
                    </div>
                    <button onClick={this.onRecord}>Record</button>
                    {/* <button onClick={this.onInterpolate}>Inter</button> */}
                    <input placeholder="Time" ref={this._timeInput} onKeyDown={this.onTimeEntered}></input>
                </div>
            </div>
        );
    }
}