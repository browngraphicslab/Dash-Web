import * as React from "react";
import "./Timeline.scss";
import { listSpec } from "../../../new_fields/Schema";
import { observer } from "mobx-react";
import { Track } from "./Track";
import { observable, reaction, action, IReactionDisposer, computed, runInAction, observe } from "mobx";
import { Cast, NumCast, StrCast, BoolCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlayCircle, faBackward, faForward, faGripLines, faArrowUp, faArrowDown, faClock, faPauseCircle, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { ContextMenuProps } from "../ContextMenuItem";
import { ContextMenu } from "../ContextMenu";
import { TimelineOverview } from "./TimelineOverview";
import { FieldViewProps } from "../nodes/FieldView";
import { KeyframeFunc } from "./Keyframe";



export interface FlyoutProps {
    x?: number;
    y?: number;
    display?: string;
    regiondata?: Doc;
    regions?: List<Doc>;
}


@observer
export class Timeline extends React.Component<FieldViewProps> {

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
    @observable private _isFrozen: boolean = true; //timeline freeze
    @observable private _totalLength: number = 0;
    @observable private _visibleLength: number = 0; 
    @observable private _visibleStart: number = 0; 
    @observable private _containerHeight: number = this.DEFAULT_CONTAINER_HEIGHT;
    @observable private _time = 100000; //DEFAULT
    @observable private _ticks: number[] = [];
    @observable private _playButton = faPlayCircle; 
    @observable private _timelineVisible = false; 
    @observable private _mouseToggled = false; 
    @observable private _doubleClickEnabled = false; 
    @observable private _mutationDisposer:MutationObserver[] = []; 
    @observable private _reactionDisposer:IReactionDisposer[] = []; 


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


    componentWillMount() {
        this.props.Document.isAnimating ? this.props.Document.isAnimating = true : this.props.Document.isAnimating = false; 
    }

    componentDidMount() {
        if (StrCast(this.props.Document.type) === "video") {
            console.log("ran");
            console.log(this.props.Document.duration);
            if (this.props.Document.duration) {
                this._time = Math.round(NumCast(this.props.Document.duration)) * 1000;
                this._reactionDisposer.push(reaction(() => {
                    return NumCast(this.props.Document.curPage);
                }, curPage => {
                    if (!this._isPlaying) {
                        this.changeCurrentBarX(curPage * this._tickIncrement / this._tickSpacing); 
                        this.props.Document.curPage = this._currentBarX; 
                        this.play(); 
                    }
                }));
            }
        }
        runInAction(() => {
            this._reactionDisposer.push(reaction(() => {
                return this._time;  
            }, () => {
                this._ticks = [];
                for (let i = 0; i < this._time;) {
                    this._ticks.push(i);
                    i += 1000;
                }
                this._totalLength = this._tickSpacing * (this._time/ this._tickIncrement); 
            }, {fireImmediately:true})); 
            this._totalLength = this._tickSpacing * (this._ticks.length/ this._tickIncrement); 
            this._visibleLength = this._infoContainer.current!.getBoundingClientRect().width; 
            this._visibleStart = this._infoContainer.current!.scrollLeft;   
        });
       

    }

    @action
    changeCurrentBarX = (pixel: number) => {
        pixel <= 0 ? this._currentBarX = 0 : pixel >= this._totalLength ? this._currentBarX = this._totalLength : this._currentBarX = pixel;
    }

    //for playing
    @action
    onPlay = (e: React.MouseEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        this.play(); 
    }

    @action
    play = () => {
        if (this._isPlaying) {
            this._isPlaying = false;
            this._playButton = faPlayCircle; 
        } else {
            this._isPlaying = true;
            this._playButton = faPauseCircle; 
            const playTimeline = () => {
                if (this._isPlaying){
                    if (this._currentBarX >= this._totalLength) {
                        this.changeCurrentBarX(0); 
                    } else {
                        this.changeCurrentBarX(this._currentBarX + this._windSpeed);
                    }                        
                    setTimeout(playTimeline, 15);  
                }
            }; 
            playTimeline(); 
        }
    }



    @action
    windForward = (e: React.MouseEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        if (this._windSpeed < 64) { //max speed is 32
            this._windSpeed = this._windSpeed * 2;
        }
    }

    @action
    windBackward = (e: React.MouseEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
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
        this.changeCurrentBarX(offsetX); 
    }

    @action
    onScrubberClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let scrubberbox = this._scrubberbox.current!;
        let offsetX = (e.clientX - scrubberbox.getBoundingClientRect().left) * this.props.ScreenToLocalTransform().Scale;
        this.changeCurrentBarX(offsetX); 
    }



    @action
    onPanDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let clientX = e.clientX; 
        if (this._doubleClickEnabled){
            this._doubleClickEnabled = false; 
        } else {
            setTimeout(() => {if(!this._mouseToggled && this._doubleClickEnabled) this.changeCurrentBarX(this._trackbox.current!.scrollLeft + clientX -  this._trackbox.current!.getBoundingClientRect().left); 
                this._mouseToggled = false;
                this._doubleClickEnabled = false;}, 200); 
            this._doubleClickEnabled = true; 
            document.addEventListener("pointermove", this.onPanMove);
            document.addEventListener("pointerup", () => {
                document.removeEventListener("pointermove", this.onPanMove);
                if (!this._doubleClickEnabled) {
                    this._mouseToggled = false; 
                }
            });

        }
    }

    @action
    onPanMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.movementX !== 0 || e.movementY !== 0) {
            this._mouseToggled = true; 
        }
        let trackbox = this._trackbox.current!;
        let titleContainer = this._titleContainer.current!;
        this.movePanX(this._visibleStart - e.movementX);
        trackbox.scrollTop = trackbox.scrollTop - e.movementY;
        titleContainer.scrollTop = titleContainer.scrollTop - e.movementY;
    }
    @action 
    movePanX = (pixel:number) => {
        let infoContainer = this._infoContainer.current!;
        infoContainer.scrollLeft = pixel; 
        this._visibleStart = infoContainer.scrollLeft;
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
    toReadTime = (time: number): string => {
        const inSeconds = time / 1000;
        let min: (string | number) = Math.floor(inSeconds / 60);
        let sec: (string | number) = inSeconds % 60;

        if (Math.floor(sec / 10) === 0) {
            sec = "0" + sec;
        }
        return `${min}:${sec}`;
    }

    timelineContextMenu = (e:MouseEvent): void => {
        let subitems: ContextMenuProps[] = [];
        let timelineContainer = this._timelineWrapper.current!;
        subitems.push({
            description: "Pin to Top", event: action(() => {
                if (!this._isFrozen) {
                    timelineContainer.style.left = "0px";
                    timelineContainer.style.top = "0px";
                    timelineContainer.style.transition = "none";
                }
            }), icon: faArrowUp
        });
        subitems.push({
            description: this._isFrozen ? "Unfreeze Timeline" : "Freeze Timeline", event: action(() => {
                this._isFrozen = !this._isFrozen; 
            }), icon: "thumbtack"
        });
        subitems.push({
            description: this._timelineVisible ? "Hide Timeline" : "Show Timeline", event: action(() => {
                this._timelineVisible = !this._timelineVisible; 
            }), icon: this._timelineVisible ? faEyeSlash : "eye"
        }); 
        subitems.push({ description: BoolCast(this.props.Document.isAnimating) ? "Enter Play Mode" : "Enter Authoring Mode", event: () => {
            BoolCast(this.props.Document.isAnimating) ? this.props.Document.isAnimating = false : this.props.Document.isAnimating = true;}
            , icon:BoolCast(this.props.Document.isAnimating) ? "play" : "edit"}); 
        ContextMenu.Instance.addItem({ description: "Timeline Funcs...", subitems: subitems, icon: faClock });
    }

    @action
    onWheelZoom = (e: React.WheelEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        let offset = e.clientX - this._infoContainer.current!.getBoundingClientRect().left; 
        let prevTime = KeyframeFunc.convertPixelTime(this._visibleStart + offset, "mili", "time", this._tickSpacing, this._tickIncrement); 
        e.deltaY < 0 ? this.zoom(true) : this.zoom(false); 
        let currPixel = KeyframeFunc.convertPixelTime(prevTime, "mili", "pixel", this._tickSpacing, this._tickIncrement); 
        this._infoContainer.current!.scrollLeft = currPixel - offset; 
        this._visibleStart = currPixel - offset; 
    }

    @action
    zoom = (dir: boolean) => {
        let spacingChange = this._tickSpacing; 
        let incrementChange = this._tickIncrement; 
        if (dir){
            if (!(this._tickSpacing === 100 && this._tickIncrement === 1000)){
                if (this._tickSpacing >= 100) {
                    incrementChange /= 2; 
                    spacingChange = 50; 
                } else {
                    spacingChange += 5; 
                }
            } 
        } else {
            if (this._tickSpacing <= 50) {
                spacingChange = 100; 
                incrementChange *= 2; 
            } else {
                spacingChange -= 5; 
            }
        }
        let finalLength = spacingChange * (this._time / incrementChange);  
        if (finalLength >= this._infoContainer.current!.getBoundingClientRect().width){
            this._totalLength = finalLength; 
            this._tickSpacing = spacingChange; 
            this._tickIncrement = incrementChange; 
        }
    }

    private timelineToolBox = (scale:number) => {
        let size = 50 * scale; //50 is default
        return (
        <div key="timeline_toolbox" className="timeline-toolbox" style={{height:`${size}px`}}>
                <div key="timeline_windBack" onClick={this.windBackward}> <FontAwesomeIcon icon={faBackward} style={{height:`${size}px`, width: `${size}px`}} /> </div>
                <div key =" timeline_play" onClick={this.onPlay}> <FontAwesomeIcon icon={this._playButton} style={{height:`${size}px`, width: `${size}px`}}  /> </div>
                <div key="timeline_windForward" onClick={this.windForward}> <FontAwesomeIcon icon={faForward} style={{height:`${size}px`, width: `${size}px`}}  /> </div>
                <TimelineOverview scale={scale} currentBarX={this._currentBarX} totalLength={this._totalLength} visibleLength={this._visibleLength} visibleStart={this._visibleStart} changeCurrentBarX={this.changeCurrentBarX} movePanX={this.movePanX}/> 
        </div>
        );
    }
    render() {
        return (
            <div style={{visibility: this._timelineVisible ? "visible" : "hidden"}}>
                <div key="timeline_wrapper" style={{visibility: BoolCast(this.props.Document.isAnimating && this._timelineVisible) ? "visible" :"hidden", left: "0px", top: "0px", position: "absolute", width: "100%", transform: "translate(0px, 0px)"}} ref={this._timelineWrapper}>
                    <button key="timeline_minimize" className="minimize" onClick={this.minimize}>Minimize</button>
                    <div key="timeline_container" className="timeline-container" style={{ height: `${this._containerHeight}px`, left: "0px", top: "30px" }} ref={this._timelineContainer} onPointerDown={this.onTimelineDown}>
                        {this.timelineToolBox(0.5)}
                        <div key ="timeline_info"className="info-container" ref={this._infoContainer} onWheel={this.onWheelZoom}>
                            <div key="timeline_scrubberbox" className="scrubberbox" ref={this._scrubberbox} style={{width: `${this._totalLength}px`}} onClick={this.onScrubberClick}>
                                {this._ticks.map(element => {
                                    if(element % this._tickIncrement === 0) return <div className="tick" style={{ transform: `translate(${(element / this._tickIncrement)* this._tickSpacing}px)`, position: "absolute", pointerEvents: "none" }}> <p>{this.toReadTime(element)}</p></div>;
                                })}
                            </div>
                            <div key="timeline_scrubber" className="scrubber" ref={this._scrubber} onPointerDown={this.onScrubberDown} style={{ transform: `translate(${this._currentBarX}px)` }}>
                                <div key="timeline_scrubberhead" className="scrubberhead"></div>
                            </div>
                            <div key="timeline_trackbox" className="trackbox" ref={this._trackbox} onPointerDown={this.onPanDown} style={{width: `${this._totalLength}px`}}>
                                {DocListCast(this.children).map(doc => <Track node={doc} currentBarX={this._currentBarX} changeCurrentBarX={this.changeCurrentBarX} transform={this.props.ScreenToLocalTransform()} time={this._time} tickSpacing = {this._tickSpacing} tickIncrement ={this._tickIncrement} collection = {this.props.Document}/>)}
                            </div>
                        </div>
                        <div key="timeline_title"className="title-container" ref={this._titleContainer}>
                            {DocListCast(this.children).map(doc => <div className="datapane"><p>{doc.title}</p></div>)}
                        </div>
                        <div key="timeline_resize" onPointerDown={this.onResizeDown}>
                            <FontAwesomeIcon className="resize" icon={faGripLines} />
                        </div>
                    </div>
                </div>
                {BoolCast(this.props.Document.isAnimating) ? <div></div>: this.timelineToolBox(1) }
            </div>
        );
    }
}