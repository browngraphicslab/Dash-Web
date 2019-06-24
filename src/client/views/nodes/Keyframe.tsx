import * as React from "react";
import * as ReactDOM from "react-dom";
import "./Keyframe.scss";
import "./../globalCssVariables.scss"; 
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS } from "mobx";
import { Doc } from "../../../new_fields/Doc";
import { auto } from "async";
import { Cast, FieldValue, StrCast } from "../../../new_fields/Types";
import { StandardLonghandProperties } from "csstype";
import { runInThisContext } from "vm";
import { DateField } from "../../../new_fields/DateField";
import { DocumentManager } from "../../util/DocumentManager";
import { DocumentView } from "./DocumentView";
import { anchorPoints, Flyout } from "../TemplateMenu";
import { LinkMenu } from "./LinkMenu";
import { faCircle } from "@fortawesome/free-solid-svg-icons";




interface IProp {
    node: Doc;
}

@observer
export class Keyframe extends React.Component<IProp> {

    @observable private _display:string = "none"; 
    @observable private _duration:number = 200; 
    @observable private _bar = React.createRef<HTMLDivElement>(); 
    @observable private _data:Doc = new Doc(); 
    @observable private _position:number = 0;   
    @observable private _keyframes:number[] = []; 



    @action
    componentDidMount() {
        let dv:DocumentView = DocumentManager.Instance.getDocumentView(this.props.node!)!;
        this._data = new Doc(); 
        this._position = this.props.node.currentBarX as number; 
        this._data.duration = 200; 
        this._data.start = this._position - (this._duration/2); 
        this._data.end = this._position + (this._duration/2); 
     }

    componentWillUnmount() {
        
    }
    
    // @action
    // onPointerEnter = (e: React.PointerEvent) => {
    //     e.preventDefault();
    //     e.stopPropagation(); 
    //     //this._display = "block"; 
    // }

    // @action 
    // onPointerOut = (e: React.PointerEvent) => {
    //     e.preventDefault();
    //     e.stopPropagation();
    //     //this._display = "none"; 
    // }

    @action 
    onBarPointerDown = (e: React.PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        document.addEventListener("pointermove", this.onBarPointerMove); 
        document.addEventListener("pointerup", (e:PointerEvent) => {
            document.removeEventListener("pointermove", this.onBarPointerMove); 
        }); 
    }

    @action 
    onBarPointerMove = (e:PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        if (this._position >= 0){
            let futureX = this._position + e.movementX; 
            if (futureX <= 0){
                this._position = 0; 
            } else{
                this._position += e.movementX; 
            }
        }
    }

    @action 
    onResizeLeft = (e:React.PointerEvent)=>{
        e.preventDefault(); 
        e.stopPropagation(); 
        document.addEventListener("pointermove", this.onDragResizeLeft); 
        document.addEventListener("pointerup", ()=>{
            document.removeEventListener("pointermove", this.onDragResizeLeft);
        }); 
    }

    @action 
    onResizeRight = (e:React.PointerEvent)=> {
        e.preventDefault(); 
        e.stopPropagation(); 
        document.addEventListener("pointermove", this.onDragResizeRight); 
        document.addEventListener("pointerup", ()=>{
            document.removeEventListener("pointermove", this.onDragResizeRight);
        }); 
    }

    @action 
    onDragResizeLeft = (e:PointerEvent)=>{
        e.preventDefault(); 
        e.stopPropagation();     
        let bar = this._bar.current!;  
        let barX = bar.getBoundingClientRect().left; 
        let offset = e.clientX - barX; 
        this._duration -= offset; 
        this._position += offset; 
    }
   
    
    @action 
    onDragResizeRight = (e:PointerEvent) => {
        e.preventDefault();  
        e.stopPropagation(); 
        let bar = this._bar.current!;  
        let barX = bar.getBoundingClientRect().right; 
        let offset = e.clientX - barX; 
        console.log(offset); 
        this._duration += offset; 
    }

    createDivider = (type?: string):JSX.Element => {
        if (type === "left"){
            return <div className="divider" style={{right:"0px"}}></div>; 
        } else if (type === "right"){
            return <div className="divider" style={{left:"0px"}}> </div>; 
        }
        return <div className="divider"></div>; 
    }

    @action
    createKeyframe = (e: React.MouseEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        let mouse = e.nativeEvent; 
        this._keyframes.push(mouse.offsetX); 
    }

    render() {
        return (
            <div>
                <div className="bar" ref={this._bar} style={{ transform: `translate(${this._position}px)`, width:`${this._duration}px`}} onPointerDown={this.onBarPointerDown} onDoubleClick={this.createKeyframe}>
                    <div className="leftResize" onPointerDown={this.onResizeLeft} ></div>
                    <div className="rightResize" onPointerDown={this.onResizeRight}></div>
                    {/* <div className="menubox" style={{display: this._display}}></div> */}
                    <div className="fadeLeft" style={{width:`${20}px`}}>{this.createDivider("left")}</div>
                    <div className="fadeRight" style={{width:`${20}px`}}>{this.createDivider("right")}</div>    
                    {this._keyframes.map(kf => {return <div className="keyframe" style={{left: `${kf}px`}}>
                        {this.createDivider()}
                        <div className="keyframeCircle"></div>
                    </div>})}
                    {this.createDivider("left")}
                    {this.createDivider("right")}
                </div>
            </div>
        );
    }
}