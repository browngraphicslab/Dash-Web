import * as React from "react";
import "./Timeline.scss";
import { listSpec } from "../../../new_fields/Schema";
import { observer } from "mobx-react";
import { Track } from "./Track";
import { observable, action, computed, runInAction, IReactionDisposer, reaction, trace } from "mobx";
import { Cast, NumCast, StrCast, BoolCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlayCircle, faBackward, faForward, faGripLines, faPauseCircle, faEyeSlash, faEye, faCheckCircle, faTimesCircle } from "@fortawesome/free-solid-svg-icons";
import { ContextMenu } from "../ContextMenu";
import { TimelineOverview } from "./TimelineOverview";
import { FieldViewProps } from "../nodes/FieldView";
import { KeyframeFunc } from "./Keyframe";
import { Utils } from "../../../Utils";

/**
 * Timeline class controls most of timeline functions besides individual keyframe and track mechanism. Main functions are 
 * zooming, panning, currentBarX (scrubber movement). Most of the UI stuff is also handled here. You shouldn't really make 
 * any logical changes here. Most work is needed on UI. 
 * 
 * The hierarchy works this way: 
 * 
 *              Timeline.tsx --> Track.tsx --> Keyframe.tsx 
                      |                              |
                      |                   TimelineMenu.tsx (timeline's custom contextmenu)
                      |
                      |
                TimelineOverview.tsx (youtube like dragging thing is play mode, complex dragging thing in editing mode)


    Most style changes are in SCSS file. 
    If you have any questions, email me or text me. 
    @author Andrew Kim 
 */


@observer
export class Timeline extends React.Component<FieldViewProps> {


    //readonly constants
    private readonly DEFAULT_TICK_SPACING: number = 50;
    private readonly MAX_TITLE_HEIGHT = 75;
    private readonly MAX_CONTAINER_HEIGHT: number = 800;
    private readonly DEFAULT_TICK_INCREMENT: number = 1000;

    //height variables
    private DEFAULT_CONTAINER_HEIGHT: number = 330;
    private MIN_CONTAINER_HEIGHT: number = 205;

    //react refs
    @observable private _trackbox = React.createRef<HTMLDivElement>();
    @observable private _titleContainer = React.createRef<HTMLDivElement>();
    @observable private _timelineContainer = React.createRef<HTMLDivElement>();
    @observable private _infoContainer = React.createRef<HTMLDivElement>();
    @observable private _roundToggleRef = React.createRef<HTMLDivElement>();
    @observable private _roundToggleContainerRef = React.createRef<HTMLDivElement>();
    @observable private _timeInputRef = React.createRef<HTMLInputElement>();

    //boolean vars and instance vars 
    @observable private _currentBarX: number = 0;
    @observable private _windSpeed: number = 1;
    @observable private _isPlaying: boolean = false; //scrubber playing
    @observable private _totalLength: number = 0;
    @observable private _visibleLength: number = 0;
    @observable private _visibleStart: number = 0;
    @observable private _containerHeight: number = this.DEFAULT_CONTAINER_HEIGHT;
    @observable private _tickSpacing = this.DEFAULT_TICK_SPACING;
    @observable private _tickIncrement = this.DEFAULT_TICK_INCREMENT;
    @observable private _time = 100000; //DEFAULT
    @observable private _playButton = faPlayCircle;
    @observable private _timelineVisible = false;
    @observable private _mouseToggled = false;
    @observable private _doubleClickEnabled = false;
    @observable private _titleHeight = 0;

    // so a reaction can be made
    @observable public _isAuthoring = this.props.Document.isATOn;

    /**
     * collection get method. Basically defines what defines collection's children. These will be tracked in the timeline. Do not edit. 
     */
    @computed
    private get children(): List<Doc> {
        const extendedDocument = ["image", "video", "pdf"].includes(StrCast(this.props.Document.type));
        if (extendedDocument) {
            if (this.props.Document.data_ext) {
                return Cast((Cast(this.props.Document[Doc.LayoutFieldKey(this.props.Document) + "-annotations"], Doc) as Doc).annotations, listSpec(Doc)) as List<Doc>;
            } else {
                return new List<Doc>();
            }
        }
        return Cast(this.props.Document[this.props.fieldKey], listSpec(Doc)) as List<Doc>;
    }

    /////////lifecycle functions////////////
    componentWillMount() {
        const relativeHeight = window.innerHeight / 20; //sets height to arbitrary size, relative to innerHeight
        this._titleHeight = relativeHeight < this.MAX_TITLE_HEIGHT ? relativeHeight : this.MAX_TITLE_HEIGHT; //check if relHeight is less than Maxheight. Else, just set relheight to max
        this.MIN_CONTAINER_HEIGHT = this._titleHeight + 130; //offset
        this.DEFAULT_CONTAINER_HEIGHT = this._titleHeight * 2 + 130; //twice the titleheight + offset
    }

    componentDidMount() {
        runInAction(() => {
            if (!this.props.Document.AnimationLength) { //if animation length did not exist
                this.props.Document.AnimationLength = this._time; //set it to default time
            } else {
                this._time = NumCast(this.props.Document.AnimationLength); //else, set time to animationlength stored from before
            }
            this._totalLength = this._tickSpacing * (this._time / this._tickIncrement); //the entire length of the timeline div (actual div part itself)
            this._visibleLength = this._infoContainer.current!.getBoundingClientRect().width; //the visible length of the timeline (the length that you current see)
            this._visibleStart = this._infoContainer.current!.scrollLeft; //where the div starts
            this.props.Document.isATOn = !this.props.Document.isATOn; //turns the boolean on, saying AT (animation timeline) is on
            this.toggleHandle();
        });
    }

    componentWillUnmount() {
        runInAction(() => {
            this.props.Document.AnimationLength = this._time; //save animation length
        });
    }
    /////////////////////////////////////////////////

    /**
     * React Functional Component
     * Purpose: For drawing Tick marks across the timeline in authoring mode
     */
    @action
    drawTicks = () => {
        const ticks = [];
        for (let i = 0; i < this._time / this._tickIncrement; i++) {
            ticks.push(<div key={Utils.GenerateGuid()} className="tick" style={{ transform: `translate(${i * this._tickSpacing}px)`, position: "absolute", pointerEvents: "none" }}> <p className="number-label">{this.toReadTime(i * this._tickIncrement)}</p></div>);
        }
        return ticks;
    }

    /**
     * changes the scrubber to actual pixel position
     */
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

    /**
     * when playbutton is clicked
     */
    @action
    play = () => {
        if (this._isPlaying) {
            this._isPlaying = false;
            this._playButton = faPlayCircle;
        } else {
            this._isPlaying = true;
            this._playButton = faPauseCircle;
            const playTimeline = () => {
                if (this._isPlaying) {
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


    /**
     * fast forward the timeline scrubbing
     */
    @action
    windForward = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._windSpeed < 64) { //max speed is 32 
            this._windSpeed = this._windSpeed * 2;
        }
    }

    /**
     * rewind the timeline scrubbing 
     */
    @action
    windBackward = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._windSpeed > 1 / 16) { // min speed is 1/8
            this._windSpeed = this._windSpeed / 2;
        }
    }

    /**
     * scrubber down 
     */
    @action
    onScrubberDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener("pointermove", this.onScrubberMove);
        document.addEventListener("pointerup", () => {
            document.removeEventListener("pointermove", this.onScrubberMove);
        });
    }

    /**
     * when there is any scrubber movement
     */
    @action
    onScrubberMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const scrubberbox = this._infoContainer.current!;
        const left = scrubberbox.getBoundingClientRect().left;
        const offsetX = Math.round(e.clientX - left) * this.props.ScreenToLocalTransform().Scale;
        this.changeCurrentBarX(offsetX + this._visibleStart); //changes scrubber to clicked scrubber position
    }

    /**
     * when panning the timeline (in editing mode)
     */
    @action
    onPanDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const clientX = e.clientX;
        if (this._doubleClickEnabled) {
            this._doubleClickEnabled = false;
        } else {
            setTimeout(() => {
                if (!this._mouseToggled && this._doubleClickEnabled) this.changeCurrentBarX(this._trackbox.current!.scrollLeft + clientX - this._trackbox.current!.getBoundingClientRect().left);
                this._mouseToggled = false;
                this._doubleClickEnabled = false;
            }, 200);
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

    /**
     * when moving the timeline (in editing mode)
     */
    @action
    onPanMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.movementX !== 0 || e.movementY !== 0) {
            this._mouseToggled = true;
        }
        const trackbox = this._trackbox.current!;
        const titleContainer = this._titleContainer.current!;
        this.movePanX(this._visibleStart - e.movementX);
        trackbox.scrollTop = trackbox.scrollTop - e.movementY;
        titleContainer.scrollTop = titleContainer.scrollTop - e.movementY;
        if (this._visibleStart + this._visibleLength + 20 >= this._totalLength) {
            this._visibleStart -= e.movementX;
            this._totalLength -= e.movementX;
            this._time -= KeyframeFunc.convertPixelTime(e.movementX, "mili", "time", this._tickSpacing, this._tickIncrement);
            this.props.Document.AnimationLength = this._time;
        }

    }


    @action
    movePanX = (pixel: number) => {
        const infoContainer = this._infoContainer.current!;
        infoContainer.scrollLeft = pixel;
        this._visibleStart = infoContainer.scrollLeft;
    }

    /**
     * resizing timeline (in editing mode) (the hamburger drag icon)
     */
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
        const offset = e.clientY - this._timelineContainer.current!.getBoundingClientRect().bottom;
        // let offset = 0;
        if (this._containerHeight + offset <= this.MIN_CONTAINER_HEIGHT) {
            this._containerHeight = this.MIN_CONTAINER_HEIGHT;
        } else if (this._containerHeight + offset >= this.MAX_CONTAINER_HEIGHT) {
            this._containerHeight = this.MAX_CONTAINER_HEIGHT;
        } else {
            this._containerHeight += offset;
        }
    }

    /**
     * for displaying time to standard min:sec
     */
    @action
    toReadTime = (time: number): string => {
        time = time / 1000;
        const inSeconds = Math.round(time * 100) / 100;

        const min: (string | number) = Math.floor(inSeconds / 60);
        const sec: (string | number) = (Math.round((inSeconds % 60) * 100) / 100);
        let secString = sec.toFixed(2);

        if (Math.floor(sec / 10) === 0) {
            secString = "0" + secString;
        }

        return `${min}:${secString}`;
    }


    /**
     * context menu function. 
     * opens the timeline or closes the timeline. 
     * Used in: Freeform
     */
    timelineContextMenu = (e: React.MouseEvent): void => {
        ContextMenu.Instance.addItem({
            description: (this._timelineVisible ? "Close" : "Open") + " Animation Timeline", event: action(() => {
                this._timelineVisible = !this._timelineVisible;
            }), icon: this._timelineVisible ? faEyeSlash : faEye
        });
    }


    /**
     * timeline zoom function 
     * use mouse middle button to zoom in/out the timeline
     */
    @action
    onWheelZoom = (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const offset = e.clientX - this._infoContainer.current!.getBoundingClientRect().left;
        const prevTime = KeyframeFunc.convertPixelTime(this._visibleStart + offset, "mili", "time", this._tickSpacing, this._tickIncrement);
        const prevCurrent = KeyframeFunc.convertPixelTime(this._currentBarX, "mili", "time", this._tickSpacing, this._tickIncrement);
        e.deltaY < 0 ? this.zoom(true) : this.zoom(false);
        const currPixel = KeyframeFunc.convertPixelTime(prevTime, "mili", "pixel", this._tickSpacing, this._tickIncrement);
        const currCurrent = KeyframeFunc.convertPixelTime(prevCurrent, "mili", "pixel", this._tickSpacing, this._tickIncrement);
        this._infoContainer.current!.scrollLeft = currPixel - offset;
        this._visibleStart = currPixel - offset > 0 ? currPixel - offset : 0;
        this._visibleStart += this._visibleLength + this._visibleStart > this._totalLength ? this._totalLength - (this._visibleStart + this._visibleLength) : 0;
        this.changeCurrentBarX(currCurrent);
    }

    /**
     * zooming mechanism (increment and spacing changes)
     */
    @action
    zoom = (dir: boolean) => {
        let spacingChange = this._tickSpacing;
        let incrementChange = this._tickIncrement;
        if (dir) {
            if (!(this._tickSpacing === 100 && this._tickIncrement === 1000)) {
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
        const finalLength = spacingChange * (this._time / incrementChange);
        if (finalLength >= this._infoContainer.current!.getBoundingClientRect().width) {
            this._totalLength = finalLength;
            this._tickSpacing = spacingChange;
            this._tickIncrement = incrementChange;
        }
    }

    /**
     * tool box includes the toggle buttons at the top of the timeline (both editing mode and play mode)
     */
    private timelineToolBox = (scale: number, totalTime: number) => {
        const size = 40 * scale; //50 is default
        const iconSize = 25;

        //decides if information should be omitted because the timeline is very small
        // if its less than 950 pixels then it's going to be overlapping
        let shouldCompress = false;
        const width: number = this.props.PanelWidth();
        if (width < 850) {
            shouldCompress = true;
        }

        let modeString, overviewString, lengthString;
        const modeType = this.props.Document.isATOn ? "Author" : "Play";

        if (!shouldCompress) {
            modeString = "Mode: " + modeType;
            overviewString = "Overview:";
            lengthString = "Length: ";
        }
        else {
            modeString = modeType;
            overviewString = "";
            lengthString = "";
        }

        // let rightInfo = this.timeIndicator;

        return (
            <div key="timeline_toolbox" className="timeline-toolbox" style={{ height: `${size}px` }}>
                <div className="playbackControls">
                    <div className="timeline-icon" key="timeline_windBack" onClick={this.windBackward} title="Slow Down Animation"> <FontAwesomeIcon icon={faBackward} style={{ height: `${iconSize}px`, width: `${iconSize}px` }} /> </div>
                    <div className="timeline-icon" key=" timeline_play" onClick={this.onPlay} title="Play/Pause"> <FontAwesomeIcon icon={this._playButton} style={{ height: `${iconSize}px`, width: `${iconSize}px` }} /> </div>
                    <div className="timeline-icon" key="timeline_windForward" onClick={this.windForward} title="Speed Up Animation"> <FontAwesomeIcon icon={faForward} style={{ height: `${iconSize}px`, width: `${iconSize}px` }} /> </div>
                </div>
                <div className="grid-box overview-tool">
                    <div className="overview-box">
                        <div key="overview-text" className="animation-text">{overviewString}</div>
                        <TimelineOverview tickSpacing={this._tickSpacing} tickIncrement={this._tickIncrement} time={this._time} parent={this} isAuthoring={BoolCast(this.props.Document.isATOn)} currentBarX={this._currentBarX} totalLength={this._totalLength} visibleLength={this._visibleLength} visibleStart={this._visibleStart} changeCurrentBarX={this.changeCurrentBarX} movePanX={this.movePanX} />
                    </div>
                    <div className="mode-box overview-tool">
                        <div key="animation-text" className="animation-text">{modeString}</div>
                        <div key="round-toggle" ref={this._roundToggleContainerRef} className="round-toggle">
                            <div key="round-toggle-slider" ref={this._roundToggleRef} className="round-toggle-slider" onPointerDown={this.toggleChecked}> </div>
                        </div>
                    </div>
                    <div className="time-box overview-tool" style={{ display: this._timelineVisible ? "flex" : "none" }}>
                        {this.timeIndicator(lengthString, totalTime)}
                        <div className="resetView-tool" title="Return to Default View" onClick={() => Doc.resetView(this.props.Document)}><FontAwesomeIcon icon="compress-arrows-alt" size="lg" /></div>
                        <div className="resetView-tool" style={{ display: this._isAuthoring ? "flex" : "none" }} title="Set Default View" onClick={() => Doc.setView(this.props.Document)}><FontAwesomeIcon icon="expand-arrows-alt" size="lg" /></div>

                    </div>
                </div>
            </div>
        );
    }

    timeIndicator(lengthString: string, totalTime: number) {
        if (this.props.Document.isATOn) {
            return (
                <div key="time-text" className="animation-text" style={{ visibility: this.props.Document.isATOn ? "visible" : "hidden", display: this.props.Document.isATOn ? "flex" : "none" }}>{`Total: ${this.toReadTime(totalTime)}`}</div>
            );
        }
        else {
            return (
                <div style={{ flexDirection: "column" }}>
                    <div className="animation-text" style={{ fontSize: "10px", width: "100%", display: !this.props.Document.isATOn ? "block" : "none" }}>{`Current: ${this.getCurrentTime()}`}</div>
                    <div className="animation-text" style={{ fontSize: "10px", width: "100%", display: !this.props.Document.isATOn ? "block" : "none" }}>{`Total: ${this.toReadTime(this._time)}`}</div>
                </div>
            );
        }
    }

    /**
     * when the user decides to click the toggle button (either user wants to enter editing mode or play mode)
     */
    @action
    private toggleChecked = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleHandle();
    }

    /**
     * turns on the toggle button (the purple slide button that changes from editing mode and play mode
     */
    private toggleHandle = () => {
        const roundToggle = this._roundToggleRef.current!;
        const roundToggleContainer = this._roundToggleContainerRef.current!;
        const timelineContainer = this._timelineContainer.current!;
        if (BoolCast(this.props.Document.isATOn)) {
            //turning on playmode...
            roundToggle.style.transform = "translate(0px, 0px)";
            roundToggle.style.animationName = "turnoff";
            roundToggleContainer.style.animationName = "turnoff";
            roundToggleContainer.style.backgroundColor = "white";
            timelineContainer.style.top = `${-this._containerHeight}px`;
            this.props.Document.isATOn = false;
            this._isAuthoring = false;
            this.toPlay();
        } else {
            //turning on authoring mode...
            roundToggle.style.transform = "translate(20px, 0px)";
            roundToggle.style.animationName = "turnon";
            roundToggleContainer.style.animationName = "turnon";
            roundToggleContainer.style.backgroundColor = "#9acedf";
            timelineContainer.style.top = "0px";
            this.props.Document.isATOn = true;
            this._isAuthoring = true;
            this.toAuthoring();
        }
    }


    @action.bound
    changeLengths() {
        if (this._infoContainer.current) {
            this._visibleLength = this._infoContainer.current!.getBoundingClientRect().width; //the visible length of the timeline (the length that you current see)
            this._visibleStart = this._infoContainer.current!.scrollLeft; //where the div starts
        }
    }

    // @computed
    getCurrentTime = () => {
        let current = KeyframeFunc.convertPixelTime(this._currentBarX, "mili", "time", this._tickSpacing, this._tickIncrement);
        if (current > this._time) {
            current = this._time;
        }
        return this.toReadTime(current);
    }

    @observable private mapOfTracks: (Track | null)[] = [];

    @action
    findLongestTime = () => {
        let longestTime: number = 0;
        this.mapOfTracks.forEach(track => {
            if (track) {
                const lastTime = track.getLastRegionTime();
                if (this.children.length !== 0) {
                    if (longestTime <= lastTime) {
                        longestTime = lastTime;
                    }
                }
            } else {
                //TODO: remove undefineds and duplicates
            }
        });
        // console.log(longestTime); 
        return longestTime;
    }

    @action
    toAuthoring = () => {
        let longestTime = this.findLongestTime();
        if (longestTime === 0) longestTime = 1;
        const adjustedTime = Math.ceil(longestTime / 100000) * 100000;
        // console.log(adjustedTime); 
        this._totalLength = KeyframeFunc.convertPixelTime(adjustedTime, "mili", "pixel", this._tickSpacing, this._tickIncrement);
        this._time = adjustedTime;
    }

    @action
    toPlay = () => {
        const longestTime = this.findLongestTime();
        this._time = longestTime;
        this._totalLength = KeyframeFunc.convertPixelTime(this._time, "mili", "pixel", this._tickSpacing, this._tickIncrement);
    }

    /**
     * if you have any question here, just shoot me an email or text. 
     * basically the only thing you need to edit besides render methods in track (individual track lines) and keyframe (green region)
     */
    render() {
        setTimeout(() => {
            this.changeLengths();
            // this.toPlay();
            // this._time = longestTime;
        }, 0);

        const longestTime = this.findLongestTime();
        trace();
        // change visible and total width
        return (
            <div style={{ visibility: this._timelineVisible ? "visible" : "hidden" }}>
                <div key="timeline_wrapper" style={{ visibility: BoolCast(this.props.Document.isATOn && this._timelineVisible) ? "visible" : "hidden", left: "0px", top: "0px", position: "absolute", width: "100%", transform: "translate(0px, 0px)" }}>
                    <div key="timeline_container" className="timeline-container" ref={this._timelineContainer} style={{ height: `${this._containerHeight}px`, top: `0px` }}>
                        <div key="timeline_info" className="info-container" ref={this._infoContainer} onWheel={this.onWheelZoom}>
                            {this.drawTicks()}
                            <div key="timeline_scrubber" className="scrubber" style={{ transform: `translate(${this._currentBarX}px)` }}>
                                <div key="timeline_scrubberhead" className="scrubberhead" onPointerDown={this.onScrubberDown} ></div>
                            </div>
                            <div key="timeline_trackbox" className="trackbox" ref={this._trackbox} onPointerDown={this.onPanDown} style={{ width: `${this._totalLength}px` }}>
                                {DocListCast(this.children).map(doc =>
                                    <Track ref={ref => this.mapOfTracks.push(ref)} node={doc} currentBarX={this._currentBarX} changeCurrentBarX={this.changeCurrentBarX} transform={this.props.ScreenToLocalTransform()} time={this._time} tickSpacing={this._tickSpacing} tickIncrement={this._tickIncrement} collection={this.props.Document} timelineVisible={this._timelineVisible} />
                                )}
                            </div>
                        </div>
                        <div className="currentTime">Current: {this.getCurrentTime()}</div>
                        <div key="timeline_title" className="title-container" ref={this._titleContainer}>
                            {DocListCast(this.children).map(doc => <div style={{ height: `${(this._titleHeight)}px` }} className="datapane" onPointerOver={() => { Doc.BrushDoc(doc); }} onPointerOut={() => { Doc.UnBrushDoc(doc); }}><p>{doc.title}</p></div>)}
                        </div>
                        <div key="timeline_resize" onPointerDown={this.onResizeDown}>
                            <FontAwesomeIcon className="resize" icon={faGripLines} />
                        </div>
                    </div>
                </div>
                {this.timelineToolBox(1, longestTime)}
            </div>
        );
    }
}