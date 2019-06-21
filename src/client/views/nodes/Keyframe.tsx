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
    
    @action
    onPointerEnter = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation(); 
        //this._display = "block"; 
    }

    @action 
    onPointerOut = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        //this._display = "none"; 
    }

    @action 
    onBarPointerDown = (e: React.PointerEvent) => {
        console.log(e.clientX); 
        this._position = e.clientX; 
    }

    @action 
    onKeyDown = (e: React.KeyboardEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        console.log("pressed");
        if (e.keyCode === 13){
            console.log("hellow"); 
        }
    }

    @action 
    onPointerDown = (e:React.PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
    }

    @action 
    onResizeLeft = (e:React.PointerEvent)=>{
        e.preventDefault(); 
        let bar = this._bar.current!; 
        document.addEventListener("pointermove", this.onDragResizeLeft); 
    }

    @action 
    onDragResizeLeft = (e:PointerEvent)=>{
        e.preventDefault(); 
        e.stopPropagation();
        console.log("Dragging");
        let bar = this._bar.current!; 
        let barX = bar.getBoundingClientRect().left; 
        let offset = barX - e.clientX; 
        bar.style.width = `${bar.getBoundingClientRect().width + offset}px`; 
        bar.style.transform = `translate(${e.clientX})`; 
        document.addEventListener("pointerup", this.onResizeFinished); 
    }

    @action 
    onResizeFinished =(e:PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        let bar = this._bar.current!; 
        document.removeEventListener("pointermove", this.onDragResizeLeft); 
        document.removeEventListener("pointermove", this.onDragResizeRight); 
    }
   
    @action 
    onResizeRight = (e:React.PointerEvent)=> {
        e.preventDefault(); 
        e.stopPropagation(); 
        let bar = this._bar.current!; 
        document.addEventListener("pointermove", this.onDragResizeRight); 
    }

    @action 
    onDragResizeRight = (e:PointerEvent) => {
        e.preventDefault();  
        e.stopPropagation(); 
        let bar = this._bar.current!;  
        let barX = bar.getBoundingClientRect().right; 
        let offset = e.clientX - barX; 
        bar.style.width = `${bar.getBoundingClientRect().width + offset}px`; 
        document.addEventListener("pointerup", this.onResizeFinished); 
    }

    @action
    onResizeOut = (e:React.PointerEvent)=>{
        let bar = this._bar.current!; 
        document.addEventListener("pointerup", this.onDragResizeRight); 
    }


    @action 
    changeFlyoutContent = () => {

    }
    
    @action
    onHover = (e:React.PointerEvent) => {

    }
    
    render() {
        return (
            <div>
                <div className="bar" ref={this._bar} style={{ transform: `translate(${this._position - (this._duration/2)}px)`, width:`${this._duration}px`}} onPointerDown={this.onBarPointerDown}>
                    <div className="leftResize" onPointerDown={this.onResizeLeft}  ></div>
                    <div className="rightResize" onPointerDown={this.onResizeRight} onPointerOut={this.onResizeOut}></div>
                    <div className="menubox" style={{display: this._display}}>       
                    </div>
                </div>
            </div>
        );
    }
}