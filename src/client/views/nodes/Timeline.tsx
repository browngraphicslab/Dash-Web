import * as React from "react";
import * as ReactDOM from "react-dom";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed } from "mobx";
import "./Timeline.scss";
import { CollectionViewProps } from "../collections/CollectionBaseView";
import { CollectionSubView, SubCollectionViewProps } from "../collections/CollectionSubView";
import { DocumentViewProps, DocumentView } from "./DocumentView";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { Doc, DocListCastAsync } from "../../../new_fields/Doc";
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


@observer
export class Timeline extends CollectionSubView(Document) {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _timeInput = React.createRef<HTMLInputElement>();
    @observable private _playButton = React.createRef<HTMLButtonElement>();

    @observable private _isRecording: Boolean = false;
    @observable private _windSpeed: number = 1;
    private _reactionDisposers: IReactionDisposer[] = [];
    private _selectionManagerChanged?: IReactionDisposer;

    @observable private _currentBarX: number = 0;
    @observable private _keys = ["x", "y", "width", "height", "panX", "panY", "scale"];
    @observable private _bars: { x: number, doc: Doc }[] = [];
    @observable private _barMoved: boolean = false;

    @computed private get _keyframes() {
        return Cast(this.props.Document.keyframes, listSpec(Doc)) as any as List<List<Doc>>;
    }

    @computed private get _data() {
        return Cast(this.props.Document.dataa, listSpec(Doc)) as List<Doc>; 
        //return Cast(this.props.Document[this.props.fieldKey], listSpec(Doc))!;
    }

    /**
     * when the record button is pressed
     * @param e MouseEvent
     */
    @action
    onRecord = (e: React.MouseEvent) => {
        console.log(this._data.length + " from record"); 
        console.log(this._keyframes.length + " from record"); 
        if (this._isRecording === true) {
            this._isRecording = false;
            return;
        }
        this._isRecording = true;
        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
        if (!children) {
            return;
        }
        let childrenList = ((children[Self] as any).__fields);
        const addReaction = (node: Doc) => {
            node = (node as any).value();
            return reaction(() => {
                console.log(this._data.length); 
                return this._keys.map(key => FieldValue(node[key]));
            }, async data => {
                if (!this._barMoved) {
                    console.log(this._keyframes.length + " keyframes length"); 
                    console.log(this._data.length + " data length"); 
                    if (this._data.indexOf(node) === -1) { 
                        let timeandpos = this.setTimeAndPos(node);
                        //change it to dictionary here............................................................................                          
                        let dict = new Dictionary<number, Doc>();
                        this._data.push(node); 
                        let info: List<Doc> = new List<Doc>(new Array<Doc>(1000)); //kinda weird  
                        info[this._currentBarX] = timeandpos;
                        this._keyframes.push(info);
                        console.log(this._keyframes.length); 
                        this._bars = [];
                        this._bars.push({ x: this._currentBarX, doc: node });
                        //...................................................................................................
                    } else {
                        let index = this._data.indexOf(node);
                        console.log(index); 
                        if (this._keyframes[index][this._currentBarX] !== undefined) { //when node is in data, but doesn't have data for this specific time. 
                            let timeandpos = this.setTimeAndPos(node);
                            this._keyframes[index][this._currentBarX] = timeandpos;
                            this._bars.push({ x: this._currentBarX, doc: node });
                        } else { //when node is in data, and has data for this specific time
                            let timeandpos = this.setTimeAndPos(node);
                            this._keyframes[index][this._currentBarX] = timeandpos;
                        }
                    }
                }
            });
        };


        observe(childrenList as IObservableArray<Doc>, change => {
            console.log(childrenList + " has been printed");
            if (change.type === "update") {
                this._reactionDisposers[change.index]();
                console.log(this._data.length); 
                this._reactionDisposers[change.index] = addReaction(change.newValue);
            } else {
                let removed = this._reactionDisposers.splice(change.index, change.removedCount, ...change.added.map(addReaction));
                removed.forEach(disp => disp());
            }
        }, true);

    }

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
        console.log(docs.length +" from time change"); 
        docs.forEach(async (oneDoc, i) => {
            let OD: Doc = await oneDoc;
            let leftKf!: TimeAndPosition;
            let rightKf!: TimeAndPosition;
            let singleFrame: Doc | undefined = undefined;
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
                        console.log(oneKf); 
                        console.log(time); 
                        rightMin = this.calcMinRight(oneKf, time);
                        if (rightMin !== Infinity) {
                            let kf = this._keyframes[i][rightMin] as Doc;
                            rightKf = TimeAndPosition(kf);
                        }
                    } else {
                        singleFrame = singleKf;
                    }
                }
            });
            if (singleFrame) {
                if (true || oneKf[i] !== undefined) {
                    this._keys.map(key => {
                        let temp = OD[key];
                        FieldValue(OD[key]);
                    });
                }
            } else if (leftKf && rightKf) {
                this.interpolate(OD, leftKf, rightKf, this._currentBarX);
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

        //e^x exponential 
        let eExp1 = Math.log(kf2.time);
        let eExp2 = Math.log(kf1.time);


        // e ^ x + pos1, e^x + pos2
        //const ratio = (time - eExp1) / dif_time; 


        //for linaer
        const dif_time = kf2.time - kf1.time;
        const ratio = (time - kf1.time) / dif_time; //linear 

        this._keys.forEach(key => {
            const diff = NumCast(keyFrame2[key]) - NumCast(keyFrame1[key]);
            const adjusted = diff * ratio;
            doc[key] = NumCast(keyFrame1[key]) + adjusted;
        });
    }

    /**
     * when user lifts the pointer. Removes pointer move event and no longer tracks green bar moving
     * @param e react pointer event
     */
    @action
    onInnerPointerUp = (e: React.PointerEvent) => {
        if (this._inner.current) {
            if (!this._isPlaying) {
                this._barMoved = false;
            }
            this._inner.current.removeEventListener("pointermove", this.onInnerPointerMove);
        }
    }

    /**
     * called when user clicks on a certain part of the inner. This will move the green bar to that position. 
     * @param e react pointer event
     */
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
                this._inner.current.removeEventListener("pointermove", this.onInnerPointerMove);
                this._inner.current.addEventListener("pointermove", this.onInnerPointerMove);
                this.timeChange(this._currentBarX);
                console.log("from down")
            }

        }
    }

    /**
     * Called when you drag the green bar across the inner div. 
     * @param e pointer event
     */
    @action
    onInnerPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this._barMoved = true;
        let offsetX = Math.round(e.offsetX); //currentbarX is rounded so it is indexable
        this._currentBarX = offsetX;
        this.timeChange(this._currentBarX);
        console.log("from move"); 
    }

    @observable private _isPlaying = false;

    @action
    onPlay = async (e: React.MouseEvent) => {
        let playButton: HTMLButtonElement = (await this._playButton.current)!;
        if (this._isPlaying) {
            playButton.innerHTML = "Play";
            this._isPlaying = false;
            this._barMoved = false;
        } else {
            playButton.innerHTML = "Stop";
            this._barMoved = true;
            this._isPlaying = true;
            this.changeCurrentX();

        }

    }


    @action
    changeCurrentX = async () => {
        if (this._currentBarX >= 484 && this._isPlaying === true) {
            this._currentBarX = 0;
        }
        if (this._currentBarX <= 484 && this._isPlaying === true) { ///////////////////////////////////////////////////////////////////////////// needs to be width 
            this._currentBarX = this._currentBarX + this._windSpeed;
            setTimeout(this.changeCurrentX, 15);
            this.timeChange(this._currentBarX);
        }
    }


    @action
    windForward = (e: React.MouseEvent) => {
        if (this._windSpeed < 64) { //max speed is 32
            this._windSpeed = this._windSpeed * 2;
        }
    }

    @action
    windBackward = (e: React.MouseEvent) => {
        if (this._windSpeed > 1 / 16) { // min speed is 1/8
            this._windSpeed = this._windSpeed / 2;
        }
    }

    /**
     * creates JSX bar element. 
     * @param width required: the thickness of the bar
     * @param pos optional: the position of the bar
     * @param color option: default is green, but you can choose other colors
     */
    @action
    createBar = (width: number, pos: number = 0, color: string = "green"): JSX.Element => {
        return (
            <div style={{
                height: "100%",
                width: `${width}px`,
                backgroundColor: color,
                transform: `translate(${pos}px)`,
                position: "absolute",
                pointerEvents: "none"
            }}></div>
        );
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


    componentDidMount() {
        if (!this._keyframes) {
            console.log("new data");
            this.props.Document.keyframes = new List<List<Doc>>();
            this.props.Document.dataa = new List<Doc>(); 
        }
    }

    /**
     * removes reaction when the component is removed from the timeline
     */

    componentWillUnmount() {
        this._reactionDisposers.forEach(disp => disp());
        this._reactionDisposers = [];
    }


    /**
     * Displays yellow bars per node when selected
     */
    @action
    displayKeyFrames = (doc: Doc) => {
        let views: (JSX.Element | null)[] = [];

        this._data.forEach((node, i) => {
            if (node === doc) {
                console.log(this._keyframes[i].length); 
                views = this._keyframes[i].map(tp => {
                    let n:Doc = Cast(tp, Doc) as Doc; 
                 
                    console.log(n); 
                    if (n !== undefined) {
                        const timeandpos = TimeAndPosition(n);
                        let time = timeandpos.time;
                        let bar = this.createBar(5, time, "yellow");
                        return bar;
                    }
                    return null;
                });
            }
        });
        return views;
    }

    render() {
        return (
            <div>
                <div className="timeline-container">
                    <div className="timeline">
                        <div className="inner" ref={this._inner} onPointerDown={this.onInnerPointerDown} onPointerUp={this.onInnerPointerUp}>
                            {SelectionManager.SelectedDocuments().map(dv => this.displayKeyFrames(dv.props.Document))}
                            {this._bars.map((data) => {
                                return this.createBar(5, data.x, "yellow");
                            })}
                            {this.createBar(5, this._currentBarX)}

                        </div>
                    </div>
                    <button onClick={this.onRecord}>Record</button>

                    <input placeholder={this._currentBarX.toString()} ref={this._timeInput} onKeyDown={this.onTimeEntered} ></input>
                    <button onClick={this.windBackward}> {"<"}</button>
                    <button onClick={this.onPlay} ref={this._playButton}> Play </button>
                    <button onClick={this.windForward}>{">"}</button>
                </div>
            </div>
        );
    }
}