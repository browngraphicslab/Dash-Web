import * as React from "react";
import * as ReactDOM from "react-dom";
import "./Timeline.scss";
import { CollectionSubView } from "../collections/CollectionSubView";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { observer } from "mobx-react";
import { Track } from "./Track";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, Reaction, IObservableObject } from "mobx";
import { Cast } from "../../../new_fields/Types";
import { SelectionManager } from "../../util/SelectionManager";
import { List } from "../../../new_fields/List";
import { Self } from "../../../new_fields/FieldSymbols";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircle, faPlayCircle, faBackward, faForward, faGripLines } from "@fortawesome/free-solid-svg-icons";
import { DocumentContentsView } from "./DocumentContentsView";
import { FlyoutInfoContext } from "./Keyframe";



@observer
export class Timeline extends CollectionSubView(Document) {
    private readonly DEFAULT_CONTAINER_HEIGHT: number = 300;
    private readonly MIN_CONTAINER_HEIGHT: number = 205;
    private readonly MAX_CONTAINER_HEIGHT: number = 800;


    @observable private _scrubberbox = React.createRef<HTMLDivElement>();
    @observable private _trackbox = React.createRef<HTMLDivElement>();
    @observable private _titleContainer = React.createRef<HTMLDivElement>();
    @observable private _currentBarX: number = 0;
    @observable private _windSpeed: number = 1;
    @observable private _isPlaying: boolean = false;
    @observable private _boxLength: number = 0;
    @observable private _containerHeight: number = this.DEFAULT_CONTAINER_HEIGHT;
    @observable private _nodes: List<Doc> = new List<Doc>();
    @observable private _time = 100000; //DEFAULT

    @observable private _infoContainer = React.createRef<HTMLDivElement>();
    @observable private _ticks: number[] = [];



    @action
    componentDidMount() {
        let scrubber = this._scrubberbox.current!;
        this._boxLength = scrubber.getBoundingClientRect().width;
        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
        if (!children) {
            return;
        }
        let childrenList = ((children[Self] as any).__fields) as List<Doc>;
        this._nodes = (childrenList) as List<Doc>;

        reaction(() => this._time, time => {
            let infoContainer = this._infoContainer.current!;
            let trackbox = this._trackbox.current!;
            this._boxLength = infoContainer.scrollWidth;
            trackbox.style.width = `${this._boxLength}`;
        });

        //check if this is a video frame 
        for (let i = 0; i < this._time;) {
            this._ticks.push(i);
            i += 1000;
        }
    }

    @action
    componentDidUpdate() {
        this._time = 100001;
    }
    componentWillUnmount() {

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
    minimize = (e: React.MouseEvent) => {
        this._containerHeight = 0;
    }

    renderFlyout = ():JSX.Element => {        
        // console.log("rendered"); 

        // let data = React.useContext(FlyoutInfoContext);
        return (
            <div style ={{height:"100px", width:"100px", backgroundColor:"yellow", position:"absolute"}}>
                <p>
                    {/* {data.fadeIn} */}
                </p>
            </div>
        );
    }

  


    render() {
        return (
            <div className="timeline-container" style={{ height: `${this._containerHeight}px` }}>
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
                            return <div className="tick" style={{ transform: `translate(${element / 20}px)`, position: "absolute", pointerEvents: "none" }}> <p>{this.toTime(element)}</p></div>;
                        })}
                    </div>
                    <div className="scrubber" onPointerDown={this.onScrubberDown} style={{ transform: `translate(${this._currentBarX}px)` }}>
                        <div className="scrubberhead"></div>
                    </div>
                    <div className="trackbox" ref={this._trackbox} onPointerDown={this.onPanDown}>
                        {this._nodes.map(doc => {
                            return <Track node={(doc as any).value() as Doc} currentBarX={this._currentBarX} />;
                        })}
                    </div>
                </div>
                <div className="title-container" ref={this._titleContainer}>
                    {this._nodes.map(doc => {
                        return <div className="datapane">
                            <p>{((doc as any).value() as Doc).title}</p>
                        </div>;
                    })}
                </div>
                <div onPointerDown={this.onResizeDown}>
                    <FontAwesomeIcon className="resize" icon={faGripLines} />
                </div>  
                <FlyoutInfoContext.Consumer>
                    {value => (
                    <div style ={{height:"100px", width:"100px", backgroundColor:"yellow", position:"absolute"}}>
                        <p>
                            {value.fadeIn}
                        </p>
                    </div>)}
                </FlyoutInfoContext.Consumer>
            </div>
        );
    }

}