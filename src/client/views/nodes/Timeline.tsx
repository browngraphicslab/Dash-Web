import * as React from "react";
import "./Timeline.scss";
import { CollectionSubView } from "../collections/CollectionSubView";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { observer } from "mobx-react";
import { Track } from "./Track";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, Reaction, IObservableObject, trace, autorun, runInAction } from "mobx";
import { Cast, NumCast } from "../../../new_fields/Types";
import { SelectionManager } from "../../util/SelectionManager";
import { List } from "../../../new_fields/List";
import { Self } from "../../../new_fields/FieldSymbols";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircle, faPlayCircle, faBackward, faForward, faGripLines } from "@fortawesome/free-solid-svg-icons";
import { DocumentContentsView } from "./DocumentContentsView";
import { ContextMenuProps } from "../ContextMenuItem";
import { ContextMenu } from "../ContextMenu";
import { string } from "prop-types";
import { checkIfStateModificationsAreAllowed } from "mobx/lib/internal";
import { SelectorContextMenu } from "../collections/ParentDocumentSelector";


export interface FlyoutProps {
    x?: number;
    y?: number;
    display?: string;
    regiondata?: Doc;
    regions?: List<Doc>;
}


@observer
export class Timeline extends CollectionSubView(Document) {
    private readonly DEFAULT_CONTAINER_HEIGHT: number = 300;
    private readonly DEFAULT_TICK_SPACING: number = 50;
    private readonly MIN_CONTAINER_HEIGHT: number = 205;
    private readonly MAX_CONTAINER_HEIGHT: number = 800;

    @observable private _isMinimized = false;
    @observable private _tickSpacing = this.DEFAULT_TICK_SPACING;

    @observable private _scrubberbox = React.createRef<HTMLDivElement>();
    @observable private _scrubber = React.createRef<HTMLDivElement>();
    @observable private _trackbox = React.createRef<HTMLDivElement>();
    @observable private _titleContainer = React.createRef<HTMLDivElement>();
    @observable private _timelineContainer = React.createRef<HTMLDivElement>();
    @observable private _timeInput = React.createRef<HTMLInputElement>();
    @observable private _durationInput = React.createRef<HTMLInputElement>();
    @observable private _fadeInInput = React.createRef<HTMLInputElement>();
    @observable private _fadeOutInput = React.createRef<HTMLInputElement>();
    @observable private _timelineWrapper = React.createRef<HTMLDivElement>(); 


    @observable private _currentBarX: number = 0;
    @observable private _windSpeed: number = 1;
    @observable private _isPlaying: boolean = false;
    @observable private _boxLength: number = 0;
    @observable private _containerHeight: number = this.DEFAULT_CONTAINER_HEIGHT;
    @observable private _nodes: List<Doc> = new List<Doc>();
    @observable private _time = 100000; //DEFAULT

    @observable private _infoContainer = React.createRef<HTMLDivElement>();
    @observable private _ticks: number[] = [];

    @observable private flyoutInfo: FlyoutProps = { x: 0, y: 0, display: "none", regiondata: new Doc(), regions: new List<Doc>() };

    private block = false;
    componentWillMount() {
        console.log(this._ticks.length);
        runInAction(() => {
            //check if this is a video frame 
            for (let i = 0; i < this._time;) {
                this._ticks.push(i);
                i += 1000;
            }
        });
    }
    componentDidMount() {
        runInAction(() => {
            let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
            if (!children) {
                return;
            }
            let childrenList = children;
            this._nodes = childrenList;
        });
        this.initialize();
    }



    componentDidUpdate() {
        runInAction(() => this._time = 100001);
    }

    componentWillUnmount() {
        document.removeEventListener("pointerdown", this.closeFlyout);
    }
    initialize = action(() => {
        let scrubber = this._scrubberbox.current!;
        this._boxLength = scrubber.getBoundingClientRect().width;


        reaction(() => this._time, time => {
            let infoContainer = this._infoContainer.current!;
            let trackbox = this._trackbox.current!;
            this._boxLength = infoContainer.scrollWidth;
            trackbox.style.width = `${this._boxLength}`;
        });

        document.addEventListener("pointerdown", this.closeFlyout);
    });

    @action
    changeCurrentBarX = (x: number) => {
        this._currentBarX = x;
    }
    @action
    onFlyoutDown = (e: React.PointerEvent) => {
        this.flyoutInfo.display = "block";
        this.block = true;
    }

    @action
    closeFlyout = (e: PointerEvent) => {
        if (this.block) {
            this.block = false;
            return;
        }
        this.flyoutInfo.display = "none";
    }


    //for playing
    @action
    onPlay = async (e: React.MouseEvent) => {
        if (this._isPlaying) {
            this._isPlaying = false;
        } else {
            this._isPlaying = true;
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
        let offsetX = Math.round(e.clientX - left);
        this._currentBarX = offsetX;
    }

    @action
    onScrubberClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let scrubberbox = this._scrubberbox.current!;
        let offset = scrubberbox.scrollLeft + e.clientX - scrubberbox.getBoundingClientRect().left;
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
        let offset = e.clientY - this._containerHeight;
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
        //e.stopPropagation();
        if (e.nativeEvent.which === 1){
            document.addEventListener("pointermove", this.onTimelineMove);
            document.addEventListener("pointerup", () => { document.removeEventListener("pointermove", this.onTimelineMove);});
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
        this.setPlacementHighlight(0, 0, 1000, 1000); // do something with setting the placement highlighting
    }

    @action
    minimize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let timelineContainer = this._timelineContainer.current!;
        if (this._isMinimized) {
            this._isMinimized = false;
            timelineContainer.style.transform = `translate(0px, 0px)`;
        } else {
            this._isMinimized = true;
            timelineContainer.style.transform = `translate(0px, ${- this._containerHeight - 30}px)`;
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

    @action
    getFlyout = (props: FlyoutProps) => {
        for (const [k, v] of Object.entries(props)) {
            (this.flyoutInfo as any)[k] = v;
        }

    }

    timelineContextMenu = (e: React.MouseEvent): void => {
        let subitems: ContextMenuProps[] = [];
        let timelineContainer = this._timelineWrapper.current!;
        subitems.push({ description: "Pin to Top", event: action(() => { 
            timelineContainer.style.transition = "top 1000ms ease-in, left 1000ms ease-in";  //?????
            timelineContainer.style.left = "0px"; 
            timelineContainer.style.top = "0px"; 
            timelineContainer.style.transition = "none"; 


        }), icon: "pinterest" });
        subitems.push({
            description: "Pin to Bottom", event: action(() => {
                console.log(timelineContainer.getBoundingClientRect().bottom); 
                timelineContainer.style.transform = `translate(0px, ${e.pageY - this._containerHeight}px)`;
            }), icon: "pinterest"
        });
        ContextMenu.Instance.addItem({ description: "Timeline Funcs...", subitems: subitems });
    }

    @action
    changeTime = (e: React.KeyboardEvent) => {
        let time = this._timeInput.current!;
        if (e.keyCode === 13) {
            if (!Number.isNaN(Number(time.value))) {
                this.flyoutInfo.regiondata!.position = Number(time.value) / 1000 * this._tickSpacing;
                time.placeholder = time.value + "ms";
                time.value = "";
            }
        }
    }


    @action
    changeDuration = (e: React.KeyboardEvent) => {
        let duration = this._durationInput.current!;
        if (e.keyCode === 13) {
            if (!Number.isNaN(Number(duration.value))) {
                this.flyoutInfo.regiondata!.duration = Number(duration.value) / 1000 * this._tickSpacing;
                duration.placeholder = duration.value + "ms";
                duration.value = "";
            }
        }
    }

    @action
    changeFadeIn = (e: React.KeyboardEvent) => {
        let fadeIn = this._fadeInInput.current!;
        if (e.keyCode === 13) {
            if (!Number.isNaN(Number(fadeIn.value))) {
                this.flyoutInfo.regiondata!.fadeIn = Number(fadeIn.value);
                fadeIn.placeholder = fadeIn.value + "ms";
                fadeIn.value = "";
            }
        }
    }

    @action
    changeFadeOut = (e: React.KeyboardEvent) => {
        let fadeOut = this._fadeOutInput.current!;
        if (e.keyCode === 13) {
            if (!Number.isNaN(Number(fadeOut.value))) {
                this.flyoutInfo.regiondata!.fadeOut = Number(fadeOut.value);
                fadeOut.placeholder = fadeOut.value + "ms";
                fadeOut.value = "";
            }
        }
    }
    private setPlacementHighlight = (x = 0, y = 0, height:(string| number) = 0, width:(string | number) = 0):JSX.Element => {
        return <div className="placement-highlight" style ={{height: `${height}px`, width: `${width}px`, transform:`translate(${x}px, ${y}px)`}}></div>; 
    }

    render() {
        return (
            <div style={{left:"0px", top: "0px", position:"absolute", width:"100%", transform:"translate(0px, 0px)"}} ref = {this._timelineWrapper}>
            {this.setPlacementHighlight(0,0,300,400)}
                <button className="minimize" onClick={this.minimize}>Minimize</button>
                <div className="flyout-container" style={{ left: `${this.flyoutInfo.x}px`, top: `${this.flyoutInfo.y}px`, display: `${this.flyoutInfo.display!}` }} onPointerDown={this.onFlyoutDown}>
                    <FontAwesomeIcon className="flyout" icon="comment-alt" color="grey" />
                    <div className="text-container">
                        <p>Time:</p>
                        <p>Duration:</p>
                        <p>Fade-in</p>
                        <p>Fade-out</p>
                    </div>
                    <div className="input-container">
                        <input ref={this._timeInput} type="text" placeholder={`${Math.round(NumCast(this.flyoutInfo.regiondata!.position) / this._tickSpacing * 1000)}ms`} onKeyDown={this.changeTime} />
                        <input ref={this._durationInput} type="text" placeholder={`${Math.round(NumCast(this.flyoutInfo.regiondata!.duration) / this._tickSpacing * 1000)}ms`} onKeyDown={this.changeDuration} />
                        <input ref={this._fadeInInput} type="text" placeholder={`${Math.round(NumCast(this.flyoutInfo.regiondata!.fadeIn))}ms`} onKeyDown={this.changeFadeIn} />
                        <input ref={this._fadeOutInput} type="text" placeholder={`${Math.round(NumCast(this.flyoutInfo.regiondata!.fadeOut))}ms`} onKeyDown={this.changeFadeOut} />
                    </div>
                    <button onClick={action((e: React.MouseEvent) => { this.flyoutInfo.regions!.splice(this.flyoutInfo.regions!.indexOf(this.flyoutInfo.regiondata!), 1); this.flyoutInfo.display = "none"; })}>delete</button>
                </div>
                <div className="timeline-container" style={{ height: `${this._containerHeight}px`, left:"0px", top:"0px" }} ref={this._timelineContainer}onPointerDown={this.onTimelineDown} onContextMenu={this.timelineContextMenu}>
                    <div className="toolbox">
                        <div onClick={this.windBackward}> <FontAwesomeIcon icon={faBackward} size="2x" /> </div>
                        <div onClick={this.onPlay}> <FontAwesomeIcon icon={faPlayCircle} size="2x" /> </div>
                        <div onClick={this.windForward}> <FontAwesomeIcon icon={faForward} size="2x" /> </div>
                        {/* <div>
                            <p>Timeline Overview</p>
                            <div className="overview"></div>
                        </div> */}
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
                            {DocListCast(this._nodes).map(doc => {
                                return <Track node={doc} currentBarX={this._currentBarX} changeCurrentBarX={this.changeCurrentBarX} setFlyout={this.getFlyout} />;
                            })}
                        </div>
                    </div>
                    <div className="title-container" ref={this._titleContainer}>
                        {DocListCast(this._nodes).map(doc => {
                            return <div className="datapane">
                                <p>{doc.title}</p>
                            </div>;
                        })}
                    </div>
                    <div onPointerDown={this.onResizeDown}>
                        <FontAwesomeIcon className="resize" icon={faGripLines} />
                    </div>
                </div>

            </div>
        );
    }

}