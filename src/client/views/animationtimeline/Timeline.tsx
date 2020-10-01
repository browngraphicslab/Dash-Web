import { faBackward, faForward, faGripLines, faPauseCircle, faPlayCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc, DocListCast } from "../../../fields/Doc";
import { BoolCast, Cast, NumCast, StrCast } from "../../../fields/Types";
import { Utils, setupMoveUpEvents, emptyFunction, returnFalse } from "../../../Utils";
import { FieldViewProps } from "../nodes/FieldView";
import { KeyframeFunc } from "./Keyframe";
import "./Timeline.scss";
import { TimelineOverview } from "./TimelineOverview";
import { Track } from "./Track";
import clamp from "../../util/clamp";

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
    @observable private _titleHeight = 0;

    /**
     * collection get method. Basically defines what defines collection's children. These will be tracked in the timeline. Do not edit. 
     */
    @computed
    private get children(): Doc[] {
        const annotatedDoc = ["image", "video", "pdf"].includes(StrCast(this.props.Document.type));
        if (annotatedDoc) {
            return DocListCast(this.props.Document[Doc.LayoutFieldKey(this.props.Document) + "-annotations"]);
        }
        return DocListCast(this.props.Document[this.props.fieldKey]);
    }

    /////////lifecycle functions////////////
    @action
    componentDidMount() {
        const relativeHeight = window.innerHeight / 20; //sets height to arbitrary size, relative to innerHeight
        this._titleHeight = relativeHeight < this.MAX_TITLE_HEIGHT ? relativeHeight : this.MAX_TITLE_HEIGHT; //check if relHeight is less than Maxheight. Else, just set relheight to max
        this.MIN_CONTAINER_HEIGHT = this._titleHeight + 130; //offset
        this.DEFAULT_CONTAINER_HEIGHT = this._titleHeight * 2 + 130; //twice the titleheight + offset
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
    }

    componentWillUnmount() {
        this.props.Document.AnimationLength = this._time; //save animation length
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
    onPlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.play();
    }

    /**
     * when playbutton is clicked
     */
    @action
    play = () => {
        const playTimeline = () => {
            if (this._isPlaying) {
                this.changeCurrentBarX(this._currentBarX >= this._totalLength ? 0 : this._currentBarX + this._windSpeed);
                setTimeout(playTimeline, 15);
            }
        };
        this._isPlaying = !this._isPlaying;
        this._playButton = this._isPlaying ? faPauseCircle : faPlayCircle;
        this._isPlaying && playTimeline();
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
        setupMoveUpEvents(this, e, this.onScrubberMove, emptyFunction, emptyFunction);
    }

    /**
     * when there is any scrubber movement
     */
    @action
    onScrubberMove = (e: PointerEvent) => {
        const scrubberbox = this._infoContainer.current!;
        const left = scrubberbox.getBoundingClientRect().left;
        const offsetX = Math.round(e.clientX - left) * this.props.ScreenToLocalTransform().Scale;
        this.changeCurrentBarX(offsetX + this._visibleStart); //changes scrubber to clicked scrubber position
        return false;
    }

    /**
     * when panning the timeline (in editing mode)
     */
    @action
    onPanDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, this.onPanMove, emptyFunction, (e) =>
            this.changeCurrentBarX(this._trackbox.current!.scrollLeft + e.clientX - this._trackbox.current!.getBoundingClientRect().left));
    }

    /**
     * when moving the timeline (in editing mode)
     */
    @action
    onPanMove = (e: PointerEvent) => {
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
        return false;
    }


    @action
    movePanX = (pixel: number) => {
        this._infoContainer.current!.scrollLeft = pixel;
        this._visibleStart = this._infoContainer.current!.scrollLeft;
    }

    /**
     * resizing timeline (in editing mode) (the hamburger drag icon)
     */
    onResizeDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, action((e) => {
            const offset = e.clientY - this._timelineContainer.current!.getBoundingClientRect().bottom;
            this._containerHeight = clamp(this.MIN_CONTAINER_HEIGHT, this._containerHeight + offset, this.MAX_CONTAINER_HEIGHT);
            return false;
        }), emptyFunction, emptyFunction);
    }

    /**
     * for displaying time to standard min:sec
     */
    @action
    toReadTime = (time: number): string => {
        time = time / 1000;
        const inSeconds = Math.round(time * 100) / 100;

        const min = Math.floor(inSeconds / 60);
        const sec = (Math.round((inSeconds % 60) * 100) / 100);
        let secString = sec.toFixed(2);

        if (Math.floor(sec / 10) === 0) {
            secString = "0" + secString;
        }

        return `${min}:${secString}`;
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
        this.zoom(e.deltaY < 0);
        const currPixel = KeyframeFunc.convertPixelTime(prevTime, "mili", "pixel", this._tickSpacing, this._tickIncrement);
        const currCurrent = KeyframeFunc.convertPixelTime(prevCurrent, "mili", "pixel", this._tickSpacing, this._tickIncrement);
        this._infoContainer.current!.scrollLeft = currPixel - offset;
        this._visibleStart = currPixel - offset > 0 ? currPixel - offset : 0;
        this._visibleStart += this._visibleLength + this._visibleStart > this._totalLength ? this._totalLength - (this._visibleStart + this._visibleLength) : 0;
        this.changeCurrentBarX(currCurrent);
    }


    resetView(doc: Doc) {
        doc._panX = doc._customOriginX ?? 0;
        doc._panY = doc._customOriginY ?? 0;
        doc._viewScale = doc._customOriginScale ?? 1;
    }

    setView(doc: Doc) {
        doc._customOriginX = doc._panX;
        doc._customOriginY = doc._panY;
        doc._customOriginScale = doc._viewScale;
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
        const width: number = this.props.PanelWidth();
        const modeType = this.props.Document.isATOn ? "Author" : "Play";

        //decides if information should be omitted because the timeline is very small
        // if its less than 950 pixels then it's going to be overlapping
        let modeString = modeType, overviewString = "", lengthString = "";
        if (width < 850) {
            modeString = "Mode: " + modeType;
            overviewString = "Overview:";
            lengthString = "Length: ";
        }

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
                    <div className="time-box overview-tool" style={{ display: "flex" }}>
                        {this.timeIndicator(lengthString, totalTime)}
                        <div className="resetView-tool" title="Return to Default View" onClick={() => this.resetView(this.props.Document)}><FontAwesomeIcon icon="compress-arrows-alt" size="lg" /></div>
                        <div className="resetView-tool" style={{ display: this.props.Document.isATOn ? "flex" : "none" }} title="Set Default View" onClick={() => this.setView(this.props.Document)}><FontAwesomeIcon icon="expand-arrows-alt" size="lg" /></div>
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
            const ctime = `Current: ${this.getCurrentTime()}`;
            const ttime = `Total: ${this.toReadTime(this._time)}`;
            return (
                <div style={{ flexDirection: "column" }}>
                    <div className="animation-text" style={{ fontSize: "10px", width: "100%", display: !this.props.Document.isATOn ? "block" : "none" }}>
                        {ctime}
                    </div>
                    <div className="animation-text" style={{ fontSize: "10px", width: "100%", display: !this.props.Document.isATOn ? "block" : "none" }}>
                        {ttime}
                    </div>
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

        this.props.Document.isATOn = !this.props.Document.isATOn;
        if (!BoolCast(this.props.Document.isATOn)) {
            //turning on playmode...
            roundToggle.style.transform = "translate(0px, 0px)";
            roundToggle.style.animationName = "turnoff";
            roundToggleContainer.style.animationName = "turnoff";
            roundToggleContainer.style.backgroundColor = "white";
            timelineContainer.style.top = `${-this._containerHeight}px`;
            this.toPlay();
        } else {
            //turning on authoring mode...
            roundToggle.style.transform = "translate(20px, 0px)";
            roundToggle.style.animationName = "turnon";
            roundToggleContainer.style.animationName = "turnon";
            roundToggleContainer.style.backgroundColor = "#9acedf";
            timelineContainer.style.top = "0px";
            this.toAuthoring();
        }
    }


    @action.bound
    changeLengths() {
        if (this._infoContainer.current) {
            this._visibleLength = this._infoContainer.current.getBoundingClientRect().width; //the visible length of the timeline (the length that you current see)
            this._visibleStart = this._infoContainer.current.scrollLeft; //where the div starts
        }
    }

    // @computed
    getCurrentTime = () => {
        const current = KeyframeFunc.convertPixelTime(this._currentBarX, "mili", "time", this._tickSpacing, this._tickIncrement);
        return this.toReadTime(current > this._time ? this._time : current);
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
        return longestTime;
    }

    @action
    toAuthoring = () => {
        this._time = Math.ceil((this.findLongestTime() ?? 1) / 100000) * 100000;
        this._totalLength = KeyframeFunc.convertPixelTime(this._time, "mili", "pixel", this._tickSpacing, this._tickIncrement);
    }

    @action
    toPlay = () => {
        this._time = this.findLongestTime();
        this._totalLength = KeyframeFunc.convertPixelTime(this._time, "mili", "pixel", this._tickSpacing, this._tickIncrement);
    }

    /**
     * if you have any question here, just shoot me an email or text. 
     * basically the only thing you need to edit besides render methods in track (individual track lines) and keyframe (green region)
     */
    render() {
        setTimeout(() => this.changeLengths(), 0);

        // change visible and total width
        return (
            <div style={{ visibility: "visible" }}>
                <div key="timeline_wrapper" style={{ visibility: this.props.Document.isATOn ? "visible" : "hidden", left: "0px", top: "0px", position: "absolute", width: "100%", transform: "translate(0px, 0px)" }}>
                    <div key="timeline_container" className="timeline-container" ref={this._timelineContainer} style={{ height: `${this._containerHeight}px`, top: `0px` }}>
                        <div key="timeline_info" className="info-container" onPointerDown={this.onPanDown} ref={this._infoContainer} onWheel={this.onWheelZoom}>
                            {this.drawTicks()}
                            <div key="timeline_scrubber" className="scrubber" style={{ transform: `translate(${this._currentBarX}px)` }}>
                                <div key="timeline_scrubberhead" className="scrubberhead" onPointerDown={this.onScrubberDown} ></div>
                            </div>
                            <div key="timeline_trackbox" className="trackbox" ref={this._trackbox} style={{ width: `${this._totalLength}px` }}>
                                {this.children.map(doc =>
                                    <Track ref={ref => this.mapOfTracks.push(ref)} node={doc} currentBarX={this._currentBarX} changeCurrentBarX={this.changeCurrentBarX} transform={this.props.ScreenToLocalTransform()} time={this._time} tickSpacing={this._tickSpacing} tickIncrement={this._tickIncrement} collection={this.props.Document} timelineVisible={true} />
                                )}
                            </div>
                        </div>
                        <div className="currentTime">Current: {this.getCurrentTime()}</div>
                        <div key="timeline_title" className="title-container" ref={this._titleContainer}>
                            {this.children.map(doc => <div style={{ height: `${(this._titleHeight)}px` }} className="datapane" onPointerOver={() => { Doc.BrushDoc(doc); }} onPointerOut={() => { Doc.UnBrushDoc(doc); }}><p>{doc.title}</p></div>)}
                        </div>
                        <div key="timeline_resize" onPointerDown={this.onResizeDown}>
                            <FontAwesomeIcon className="resize" icon={faGripLines} />
                        </div>
                    </div>
                </div>
                {this.timelineToolBox(1, this.findLongestTime())}
            </div>
        );
    }
}