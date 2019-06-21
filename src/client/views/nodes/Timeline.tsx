import * as React from "react"; 
import * as ReactDOM from "react-dom"; 
import "./Timeline.scss"; 
import { CollectionSubView } from "../collections/CollectionSubView";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { observer} from "mobx-react";
import { Track } from "./Track";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, Reaction } from "mobx";
import { Cast } from "../../../new_fields/Types";
import { SelectionManager } from "../../util/SelectionManager";
import { List } from "../../../new_fields/List";
import { Self } from "../../../new_fields/FieldSymbols";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircle, faPlayCircle, faBackward, faForward } from "@fortawesome/free-solid-svg-icons";



@observer
export class Timeline extends CollectionSubView(Document){

    @observable private _scrubberbox = React.createRef<HTMLDivElement>()
    @observable private _currentBarX:number = 0; 
    @observable private _windSpeed:number = 1; 
    @observable private _isPlaying:boolean = false; 
    @observable private _boxLength:number = 0; 
    @observable private _nodes:List<Doc> = new List<Doc>(); 
    @observable private _time = 100000; //DEFAULT

    @observable private _ticks: number[] = []; 
    private _reactionDisposers: IReactionDisposer[] = [];


    @action
    componentDidMount(){
        let scrubber = this._scrubberbox.current!; 
        this._boxLength = scrubber.getBoundingClientRect().width; 
        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc));
        if (!children) {
            return;
        }
        let childrenList = ((children[Self] as any).__fields) as List<Doc>;
        this._nodes = (childrenList) as List<Doc>;


        //check if this is a video frame 

        let boxWidth = scrubber.getBoundingClientRect().width; 
        for (let i = 0; i < this._time; ) {
            this._ticks.push(i); 
            i += 1000; 
        }
        
    }

    componentWillUnmount(){
        
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
        if (this._currentBarX >= this._boxLength && this._isPlaying) {
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
    onScrubberDown = (e:React.PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        let scrubberbox = this._scrubberbox.current!;
        //let left = scrubberbox.getBoundingClientRect().left;
        
        //let offsetX = Math.round(e.clientX - left);
        let mouse = e.nativeEvent; 
        this._currentBarX = mouse.offsetX; 
        document.addEventListener("pointermove", this.onScrubberMove); 
        document.addEventListener("pointerup", this.onScrubberFinished); 
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

    onScrubberFinished = (e: PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        let scrubberbox = this._scrubberbox.current!; 
        document.removeEventListener("pointermove", this.onScrubberMove); 
    }

    toTime = (time:number):string => {
        const inSeconds = time / 1000; 
        let min:(string|number) = Math.floor(inSeconds / 60); 
        let sec:(string|number) = inSeconds % 60; 

        if (Math.floor(sec/10) === 0){
            sec = "0" + sec; 
        }
        return `${min}:${sec}`; 
        
    }


    render(){
        return (
            <div className="timeline-container">
                <div className="toolbox">
                    <div onClick={this.windBackward}> <FontAwesomeIcon icon={faBackward} size="lg"/> </div>  
                    <div onClick={this.onPlay}> <FontAwesomeIcon icon={faPlayCircle} size="lg"/> </div>
                    <div onClick={this.windForward}> <FontAwesomeIcon icon={faForward} size="lg"/> </div>
                </div>  
                <div></div>
                <div className="scrubberbox" ref ={this._scrubberbox}>
                    {this._ticks.map(element => {return <div className="tick" style={{transform:`translate(${element / 20}px)`, position:"absolute"}}> <p>{this.toTime(element)}</p></div>})}
                    
                </div>
                <div className="scrubber" onPointerDown = {this.onScrubberDown} style={{transform:`translate(${this._currentBarX}px)`}}>
                    <FontAwesomeIcon className="scrubberhead" icon={faCircle}/>;
                </div>
                <div className="trackbox">  
                    {this._nodes.map(doc => {return <Track node={(doc as any).value() as Doc}/>;})}
                </div> 
            </div>
        ); 
    }

}