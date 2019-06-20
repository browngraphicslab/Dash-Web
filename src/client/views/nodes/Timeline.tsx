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

@observer
export class Timeline extends CollectionSubView(Document){

    @observable private _scrubberbox = React.createRef<HTMLDivElement>()
    @observable private _currentBarX:number = 0; 
    @observable private _windSpeed:number = 1; 
    @observable private _isPlaying:boolean = false; 
    @observable private _boxLength:number = 0; 
    @observable private _nodes:List<Doc> = new List<Doc>(); 
    

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
    }

    componentWillUnmount(){
        
    }

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

    @action 
    onScrubberDown = (e:React.PointerEvent) => {
        let scrubberbox = this._scrubberbox.current!;
        let left = scrubberbox.getBoundingClientRect().left;
        let offsetX = Math.round(e.clientX - left);
        this._currentBarX = offsetX; 
    }


    render(){
        return (
            <div className="timeline-container">
                <div className="toolbox">
                <button onClick={this.windBackward}> {"<"}  </button>
                    <button onClick={this.onPlay}> Play </button>
                    <button onClick={this.windForward}> {">"} </button>
                </div>  
                <div className="scrubberbox" onPointerDown={this.onScrubberDown} ref ={this._scrubberbox}>
                    <div className="scrubber" style={{transform:`translate(${this._currentBarX}px)`}}></div>
                </div>
                <div className="trackbox">  
                    {this._nodes.map(doc => {return <Track node={(doc as any).value() as Doc}/>})}
                </div> 
            </div>
        ); 
    }

}