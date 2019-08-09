import * as React from "react";
import "./Timeline.scss";
import { CollectionSubView } from "../collections/CollectionSubView";
import { Document, listSpec } from "../../../new_fields/Schema";
import { observer } from "mobx-react";
import { Track } from "./Track";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, Reaction, IObservableObject, trace, autorun, runInAction } from "mobx";
import { Cast, NumCast, FieldValue, StrCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlayCircle, faBackward, faForward, faGripLines, faArrowUp, faArrowDown, faClock, faPauseCircle } from "@fortawesome/free-solid-svg-icons";
import { ContextMenuProps } from "../ContextMenuItem";
import { ContextMenu } from "../ContextMenu";
import { DocumentManager } from "../../util/DocumentManager";
import { VideoBox } from "../nodes/VideoBox";
import { VideoField } from "../../../new_fields/URLField";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { Transform } from "../../util/Transform";
import { faGrinTongueSquint } from "@fortawesome/free-regular-svg-icons";
import { InkField } from "../../../new_fields/InkField";
import { AddComparisonParameters } from "../../northstar/model/idea/idea";
import { keepAlive } from "mobx-utils";


export interface FlyoutProps {
    x?: number;
    y?: number;
    display?: string;
    regiondata?: Doc;
    regions?: List<Doc>;
}


@observer
export class Timeline extends CollectionSubView(Document) {
    static Instance:Timeline; 
   

    private readonly DEFAULT_CONTAINER_HEIGHT: number = 300;
    private readonly DEFAULT_TICK_SPACING: number = 50;
    private readonly MIN_CONTAINER_HEIGHT: number = 205;
    private readonly MAX_CONTAINER_HEIGHT: number = 800;
    private readonly DEFAULT_TICK_INCREMENT: number = 1000;

    @observable private _isMinimized = false;
    @observable private _tickSpacing = this.DEFAULT_TICK_SPACING;
    @observable private _tickIncrement = this.DEFAULT_TICK_INCREMENT;

    @observable private _scrubberbox = React.createRef<HTMLDivElement>();
    @observable private _scrubber = React.createRef<HTMLDivElement>();
    @observable private _trackbox = React.createRef<HTMLDivElement>();
    @observable private _titleContainer = React.createRef<HTMLDivElement>();
    @observable private _timelineContainer = React.createRef<HTMLDivElement>();

    @observable private _timelineWrapper = React.createRef<HTMLDivElement>();
    @observable private _infoContainer = React.createRef<HTMLDivElement>();


    @observable private _currentBarX: number = 0;
    @observable private _windSpeed: number = 1;
    @observable private _isPlaying: boolean = false; //scrubber playing
    @observable private _isFrozen: boolean = false; //timeline freeze
    @observable private _boxLength: number = 0;
    @observable private _containerHeight: number = this.DEFAULT_CONTAINER_HEIGHT;
    @observable private _time = 100000; //DEFAULT
    @observable private _ticks: number[] = [];
    @observable private _playButton = faPlayCircle; 
    @observable private flyoutInfo: FlyoutProps = { x: 0, y: 0, display: "none", regiondata: new Doc(), regions: new List<Doc>() };

    @computed
    private get children(): List<Doc> {
        let extendedDocument = ["image", "video", "pdf"].includes(StrCast(this.props.Document.type));
       
        if (extendedDocument) {
            if (this.props.Document.data_ext) {
                return Cast((Cast(this.props.Document.data_ext, Doc) as Doc).annotations, listSpec(Doc)) as List<Doc>;
            } else {
                return new List<Doc>();
            }
        }
        return Cast(this.props.Document[this.props.fieldKey], listSpec(Doc)) as List<Doc>;
    }

    @computed
    private get inks(){
        if (this.props.Document.data_ext){        
            let data_ext = Cast(this.props.Document.data_ext, Doc) as Doc; 
            let ink = Cast(data_ext.ink, InkField) as InkField; 
            if (ink){
                return ink.inkData; 
            }
        }
    }

  
    componentDidMount() {
        if (StrCast(this.props.Document.type) === "video") {
            console.log("ran");
            console.log(this.props.Document.duration);
            if (this.props.Document.duration) {
                this._time = Math.round(NumCast(this.props.Document.duration)) * 1000;

                reaction(() => {
                    return NumCast(this.props.Document.curPage);
                }, curPage => {
                    this.changeCurrentBarX(curPage * this._tickIncrement / this._tickSpacing);
                });

            }

        }
        runInAction(() => {

            reaction(() => {
                return this._time;
            }, () => {
                this._ticks = [];
                for (let i = 0; i < this._time;) {
                    this._ticks.push(i);
                    i += this._tickIncrement;
                }
                let trackbox = this._trackbox.current!;
                this._boxLength = this._tickIncrement / 1000 * this._tickSpacing * this._ticks.length;
                trackbox.style.width = `${this._boxLength}`;
                this._scrubberbox.current!.style.width = `${this._boxLength}`;
            }, { fireImmediately: true });
        });
    }

    @action
    changeCurrentBarX = (x: number) => {
        this._currentBarX = x;
    }

    //for playing
    @action
    onPlay = async (e: React.MouseEvent) => {
        if (this._isPlaying) {
            this._isPlaying = false;
            this._playButton = faPlayCircle; 
        } else {
            this._isPlaying = true;
            this._playButton = faPauseCircle; 
            this.changeCurrentX();
        }
    }

    @action
    changeCurrentX = () => {
        if (this._currentBarX === this._boxLength && this._isPlaying) {
            this._currentBarX = 0;
        }
        if (this._currentBarX <= this._boxLength && this._isPlaying) {
            this._currentBarX = this._currentBarX + this._windSpeed;
            setTimeout(this.changeCurrentX, 15);
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

    //for scrubber action 
    @action
    onScrubberDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener("pointermove", this.onScrubberMove);
        document.addEventListener("pointerup", () => {
            document.removeEventListener("pointermove", this.onScrubberMove);
        });
    }

    @action
    onScrubberMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let scrubberbox = this._scrubberbox.current!;
        let left = scrubberbox.getBoundingClientRect().left;
        let offsetX = Math.round(e.clientX - left) * this.props.ScreenToLocalTransform().Scale;
        this._currentBarX = offsetX;
    }

    @action
    onScrubberClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let scrubberbox = this._scrubberbox.current!;
        let offset = (e.clientX - scrubberbox.getBoundingClientRect().left) * this.props.ScreenToLocalTransform().Scale;
        this._currentBarX = offset;
    }



    @action
    onPanDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener("pointermove", this.onPanMove);
        document.addEventListener("pointerup", () => {
            document.removeEventListener("pointermove", this.onPanMove);
        });
    }

    @action
    onPanMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let infoContainer = this._infoContainer.current!;
        let trackbox = this._trackbox.current!;
        let titleContainer = this._titleContainer.current!;
        infoContainer.scrollLeft = infoContainer.scrollLeft - e.movementX;
        trackbox.scrollTop = trackbox.scrollTop - e.movementY;
        titleContainer.scrollTop = titleContainer.scrollTop - e.movementY;
    }


    @action
    onResizeDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener("pointermove", this.onResizeMove);
        document.addEventListener("pointerup", () => {
            document.removeEventListener("pointermove", this.onResizeMove);
        });
    }

    @action
    onResizeMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let offset = e.clientY - this._timelineContainer.current!.getBoundingClientRect().bottom;
        if (this._containerHeight + offset <= this.MIN_CONTAINER_HEIGHT) {
            this._containerHeight = this.MIN_CONTAINER_HEIGHT;
        } else if (this._containerHeight + offset >= this.MAX_CONTAINER_HEIGHT) {
            this._containerHeight = this.MAX_CONTAINER_HEIGHT;
        } else {
            this._containerHeight += offset;
        }
    }

    @action
    onTimelineDown = (e: React.PointerEvent) => {
        e.preventDefault();
        if (e.nativeEvent.which === 1 && !this._isFrozen) {
            document.addEventListener("pointermove", this.onTimelineMove);
            document.addEventListener("pointerup", () => { document.removeEventListener("pointermove", this.onTimelineMove); });
        }
    }

    @action
    onTimelineMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let timelineContainer = this._timelineWrapper.current!;
        let left = parseFloat(timelineContainer.style.left!);
        let top = parseFloat(timelineContainer.style.top!);
        timelineContainer.style.left = `${left + e.movementX}px`;
        timelineContainer.style.top = `${top + e.movementY}px`;
    }

    @action
    minimize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let timelineContainer = this._timelineContainer.current!;
        if (this._isMinimized) {
            this._isMinimized = false;
            timelineContainer.style.visibility = "visible";
        } else {
            this._isMinimized = true;
            timelineContainer.style.visibility = "hidden";
        }
    }

    @action
    toTime = (time: number): string => {
        const inSeconds = time / 1000;
        let min: (string | number) = Math.floor(inSeconds / 60);
        let sec: (string | number) = inSeconds % 60;

        if (Math.floor(sec / 10) === 0) {
            sec = "0" + sec;
        }
        return `${min}:${sec}`;
    }


    private _freezeText = "Freeze Timeline";

    timelineContextMenu = (e: React.MouseEvent): void => {
        let subitems: ContextMenuProps[] = [];
        let timelineContainer = this._timelineWrapper.current!;
        subitems.push({
            description: "Pin to Top", event: action(() => {
                if (!this._isFrozen) {
                    timelineContainer.style.transition = "top 1000ms ease-in, left 1000ms ease-in";  //?????
                    timelineContainer.style.left = "0px";
                    timelineContainer.style.top = "0px";
                    timelineContainer.style.transition = "none";
                }
            }), icon: faArrowUp
        });
        subitems.push({
            description: "Pin to Bottom", event: action(() => {
                console.log(this.props.Document.y);

                if (!this._isFrozen) {
                    timelineContainer.style.transform = `translate(0px, ${e.pageY - this._containerHeight}px)`;
                }
            }), icon: faArrowDown
        });
        subitems.push({
            description: this._freezeText, event: action(() => {
                if (this._isFrozen) {
                    this._isFrozen = false;
                    this._freezeText = "Freeze Timeline";
                } else {
                    this._isFrozen = true;
                    this._freezeText = "Unfreeze Timeline";
                }
            }), icon: "thumbtack"
        });
        ContextMenu.Instance.addItem({ description: "Timeline Funcs...", subitems: subitems, icon: faClock });
    }



    @action
    getFlyout = (props: FlyoutProps) => {
        for (const [k, v] of Object.entries(props)) {
            (this.flyoutInfo as any)[k] = v;
        }
        console.log(this.flyoutInfo); 
    }

    render() {
        return (
            <div style={{ left: "0px", top: "0px", position: "absolute", width: "100%", transform: "translate(0px, 0px)" }} ref={this._timelineWrapper}>
                <button className="minimize" onClick={this.minimize}>Minimize</button>
                <div className="timeline-container" style={{ height: `${this._containerHeight}px`, left: "0px", top: "30px" }} ref={this._timelineContainer} onPointerDown={this.onTimelineDown} onContextMenu={this.timelineContextMenu}>
                    <div className="toolbox">
                        <div onClick={this.windBackward}> <FontAwesomeIcon icon={faBackward} size="2x" /> </div>
                        <div onClick={this.onPlay}> <FontAwesomeIcon icon={this._playButton} size="2x" /> </div>
                        <div onClick={this.windForward}> <FontAwesomeIcon icon={faForward} size="2x" /> </div>
                    </div>
                    <div className="info-container" ref={this._infoContainer}>
                        <div className="scrubberbox" ref={this._scrubberbox} onClick={this.onScrubberClick}>
                            {this._ticks.map(element => {
                                return <div className="tick" style={{ transform: `translate(${element / 1000 * this._tickSpacing}px)`, position: "absolute", pointerEvents: "none" }}> <p>{this.toTime(element)}</p></div>;
                            })}
                        </div>
                        <div className="scrubber" ref={this._scrubber} onPointerDown={this.onScrubberDown} style={{ transform: `translate(${this._currentBarX}px)` }}>
                            <div className="scrubberhead"></div>
                        </div>
                        <div className="trackbox" ref={this._trackbox} onPointerDown={this.onPanDown}>
                            {DocListCast(this.children).map(doc => <Track node={doc} currentBarX={this._currentBarX} changeCurrentBarX={this.changeCurrentBarX} setFlyout={this.getFlyout} transform={this.props.ScreenToLocalTransform()} collection = {this.props.Document}/>)}
                        </div>
                    </div>
                    <div className="title-container" ref={this._titleContainer}>
                        {DocListCast(this.children).map(doc => <div className="datapane"><p>{doc.title}</p></div>)}
                    </div>
                    <div onPointerDown={this.onResizeDown}>
                        <FontAwesomeIcon className="resize" icon={faGripLines} />
                    </div>
                </div>
            </div>
        );
    }

}


interface TimelineOverviewProps {
    currentBarX: number;
}

class TimelineOverview extends React.Component<TimelineOverviewProps>{

    componentWillMount() {

    }

    render() {
        return (
            <div className="overview">
                <div className="container">
                    <div className="scrubber">
                        <div className="scrubberhead"></div>
                    </div>
                </div>
            </div>
        );
    }
}


class TimelineZoom extends React.Component {
    componentDidMount() {
    }
    render() {
        return (
            <div>

            </div>
        );
    }
}