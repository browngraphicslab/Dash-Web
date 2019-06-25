import * as React from "react";
import * as ReactDOM from "react-dom";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, IObservableObject } from "mobx";
import "./Track.scss";
import { CollectionViewProps } from "../collections/CollectionBaseView";
import { CollectionSubView, SubCollectionViewProps } from "../collections/CollectionSubView";
import { DocumentViewProps, DocumentView } from "./DocumentView";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { Doc, DocListCastAsync, DocListCast } from "../../../new_fields/Doc";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast, BoolCast } from "../../../new_fields/Types";
import { emptyStatement, thisExpression, react } from "babel-types";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import { List } from "../../../new_fields/List";
import { Self } from "../../../new_fields/FieldSymbols";
import { list } from "serializr";
import { arrays, Dictionary } from "typescript-collections";
import { forEach } from "typescript-collections/dist/lib/arrays";
import { CompileScript } from "../../util/Scripting";
import { FieldView } from "./FieldView";
import { promises } from "fs";
import { Tapable } from "tapable";
import { Keyframe } from "./Keyframe";
import { timingSafeEqual } from "crypto";
type Data = List<Doc>;
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


interface props{
    node: Doc; 
    currentBarX: number; 
}

@observer
export class Track extends React.Component<props> {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _timeInput = React.createRef<HTMLInputElement>();
    @observable private _playButton = React.createRef<HTMLButtonElement>();

    @observable private _isRecording: Boolean = false;
    private _reactionDisposers: IReactionDisposer[] = [];
    private _selectionManagerChanged?: IReactionDisposer;

    @observable private _currentBarX: number = 0;
    @observable private _keys = ["x", "y", "width", "height", "panX", "panY", "scale"];
    @observable private _bars: { x: number, doc: Doc }[] = [];
    @observable private _barMoved: boolean = false;
    @observable private _length:number = 0; 

    // @computed private get _keyframes() {
    //     return Cast(this.props.Document.keyframes, listSpec(Doc)) as any as List<List<Doc>>;
    // }

    // @computed private get _data() {
    //     //return Cast(this.props.Document.dataa, listSpec(Doc)) as List<Doc>; 
    //     return Cast(this.props.Document[this.props.fieldKey], listSpec(Doc))!;
    // }

    /**
     * when the record button is pressed
     * @param e MouseEvent
     */
    // @action
    // onRecord = (e: React.MouseEvent) => {
       
    //     let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
    //     if (!children) {
    //         return;
    //     }
    //     let childrenList = ((children[Self] as any).__fields);
    //     const addReaction = (node: Doc) => {
    //         node = (node as any).value();
    //         return reaction(() => {
    //             return this._keys.map(key => FieldValue(node[key]));
    //         }, async data => {
    //             if (!this._barMoved) {
    //                 if (this._data.indexOf(node) !== -1 && this._keyframes.length < this._data.length) {
    //                     let timeandpos = this.setTimeAndPos(node);
    //                     let info: List<Doc> = new List<Doc>(new Array<Doc>(1000)); //kinda weird  
    //                     info[this._currentBarX] = timeandpos;
    //                     this._keyframes.push(info);
    //                     this._bars = [];
    //                     this._bars.push({ x: this._currentBarX, doc: node });
    //                 } else {
    //                     let index = this._data.indexOf(node);
    //                     if (this._keyframes[index][this._currentBarX] !== undefined) { //when node is in data, but doesn't have data for this specific time. 
    //                         let timeandpos = this.setTimeAndPos(node);
    //                         this._keyframes[index][this._currentBarX] = timeandpos;
    //                         this._bars.push({ x: this._currentBarX, doc: node });
    //                     } else { //when node is in data, and has data for this specific time
    //                         let timeandpos = this.setTimeAndPos(node);
    //                         this._keyframes[index][this._currentBarX] = timeandpos;
    //                     }
    //                 }
    //             }
    //         });
    //     };


    //     observe(childrenList as IObservableArray<Doc>, change => {
    //         if (change.type === "update") {
    //             this._reactionDisposers[change.index]();
    //             this._reactionDisposers[change.index] = addReaction(change.newValue);
    //         } else {
    //             let removed = this._reactionDisposers.splice(change.index, change.removedCount, ...change.added.map(addReaction));
    //             removed.forEach(disp => disp());
    //         }
    //     }, true);

    // }

    /**
     * sets the time and pos schema doc, given a node
     * @param doc (node)
     */
    @action
    setTimeAndPos = (node: Doc) => {
        let pos: Position = Position(node);
        let timeandpos = new Doc();
        const newPos = new Doc();
        this._keys.forEach(key => newPos[key] = pos[key]);
        timeandpos.position = newPos;
        timeandpos.time = this._currentBarX;
        return timeandpos;
    }

    /**
     * given time, finds the closest left and right keyframes, and if found, interpolates to that position. 
     */
    @action
    timeChange = async (time: number) => {
        const docs = this._data;
        docs.forEach(async (oneDoc, i) => {
            let OD: Doc = await oneDoc;
            let leftKf!: TimeAndPosition;
            let rightKf!: TimeAndPosition;
            let singleFrame: Doc | undefined = undefined;
            if (i >= this._keyframes.length) {
                return;
            }
            let oneKf = this._keyframes[i];
            oneKf.forEach((singleKf) => {
                singleKf = singleKf as Doc;
                if (singleKf !== undefined) {
                    let leftMin = Infinity;
                    let rightMin = Infinity;
                    if (singleKf.time !== time) { //choose closest time neighbors
                        leftMin = this.calcMinLeft(oneKf, time);
                        if (leftMin !== Infinity) {
                            let kf = this._keyframes[i][leftMin] as Doc;
                            leftKf = TimeAndPosition(kf);
                        }
                        rightMin = this.calcMinRight(oneKf, time);
                        if (rightMin !== Infinity) {
                            let kf = this._keyframes[i][rightMin] as Doc;
                            rightKf = TimeAndPosition(kf);
                        }
                    } else {
                        singleFrame = singleKf;
                        if (true || oneKf[i] !== undefined) {
                            this._keys.map(key => {
                                let temp = OD[key];
                                FieldValue(OD[key]);
                            });
                        }
                    }
                }
            });
            if (!singleFrame) {
                if (leftKf && rightKf) {
                    this.interpolate(OD, leftKf, rightKf, this._currentBarX);
                } else if (leftKf) {
                    this._keys.map(async key => {
                        let pos = (await leftKf.position)!;
                        if (pos === undefined) { ///something is probably wrong here
                            return;
                        }
                        OD[key] = pos[key];
                    });
                } else if (rightKf) {
                    this._keys.map(async key => {
                        let pos = (await rightKf.position)!;
                        if (pos === undefined) { //something is probably wrong here
                            return;
                        }
                        OD[key] = pos[key];
                    });
                }
            }
        });
    }

    /**
     * calculates the closest left keyframe, if there is one
     * @param kfList: keyframe list 
     * @param time 
     */
    @action
    calcMinLeft = (kfList: List<Doc>, time: number): number => { //returns the time of the closet keyframe to the left
        let counter: number = Infinity;
        let leftMin: number = Infinity;
        kfList.forEach((kf) => {
            kf = kf as Doc;
            if (kf !== undefined && NumCast(kf.time) < time) {
                let diff: number = Math.abs(NumCast(kf.time) - time);
                if (diff < counter) {
                    counter = diff;
                    leftMin = NumCast(kf.time);
                }
            }
        });
        return leftMin;
    }

    /**
     * calculates the closest right keyframe, if there is one
     * @param kfList: keyframe lsit
     * @param time: time
     */
    @action
    calcMinRight = (kfList: List<Doc>, time: number): number => { //returns the time of the closest keyframe to the right 
        let counter: number = Infinity;
        let rightMin: number = Infinity;
        kfList.forEach((kf) => {
            kf = kf as Doc;
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
     * @param  kf1 timeandposition of the first yellow bar
     * @param kf2 timeandposition of the second yellow bar
     * @param time time that you want to interpolate
     */
    @action
    interpolate = async (doc: Doc, kf1: TimeAndPosition, kf2: TimeAndPosition, time: number) => {
        const keyFrame1 = (await kf1.position)!;
        const keyFrame2 = (await kf2.position)!;

        if (keyFrame1 === undefined || keyFrame2 === undefined) {
            return;
        }

        const dif_time = kf2.time - kf1.time;
        const ratio = (time - kf1.time) / dif_time; //linear 
        this._keys.forEach(key => {
            const diff = NumCast(keyFrame2[key]) - NumCast(keyFrame1[key]);
            const adjusted = diff * ratio;
            doc[key] = NumCast(keyFrame1[key]) + adjusted;
        });
    }



    /**
     * called when you input a certain time on the input bar and press enter. The green bar will move to that location. 
     * @param e keyboard event
     */
    @action
    onTimeEntered = (e: React.KeyboardEvent) => {
        if (this._timeInput.current) {
            if (e.keyCode === 13) {
                let input = parseInt(this._timeInput.current.value) || 0;
                this._currentBarX = input;
                this.timeChange(input);
            }
        }
    }
    


    @action
    componentDidMount() {
        
      
        // if (!this._keyframes) {
        //     this.props.Document.keyframes = new List<List<Doc>>();
        // }

        // let keys = Doc.allKeys(this.props.node);
        // return reaction(() => keys.map(key => FieldValue(this.props.node[key])), data => {
        //     console.log(data); 
        // }); 


        reaction (() => this.props.currentBarX, () => {
            console.log("react"); 
            this._data.forEach((datum) => {
                if (this.props.currentBarX >= (datum.begin as number) && this.props.currentBarX <= (datum.end as number)){
                    this.props.node.hidden = false; 
                } else {
                    this.props.node.hidden = true; 
                }
            }); 
            // if (this.props.currentBarX  !== this._position){
            //     this.props.node.hidden = true; 
            // } else {
            //     this.props.node.hidden = false; 
            // }
        }); 
    }

    /**
     * removes reaction when the component is removed from the timeline
     */
    componentWillUnmount() {
        this._reactionDisposers.forEach(disp => disp());
        this._reactionDisposers = [];
    }

    @observable private _keyframes: JSX.Element[] = []; 
    @observable private _data: Doc[] = []; 
    @action 
    onInnerDoubleClick = (e: React.MouseEvent) => {
        let inner = this._inner.current!; 
        let left = inner.getBoundingClientRect().left;
        let offsetX = Math.round(e.clientX - left);
        this.props.node.position = offsetX; 
        let datum = new Doc(); 
        datum.begin = offsetX; 
        datum.end = offsetX + 200; 
        this._data.push(datum); 
        this._keyframes.push(<Keyframe node={this.props.node} currentBarX={this.props.currentBarX}/>); 
    }

    render() {
        return (
            <div className="track-container">
                <div className="track">
                    <div className="inner" ref={this._inner} onDoubleClick={this.onInnerDoubleClick}>
                        {this._keyframes.map((element)=> element)}
                    </div>
                </div>
            </div>
        );
    }
}