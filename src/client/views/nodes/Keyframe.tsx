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



interface IProp {
    collection?: Doc;
    node?: Doc;
    position: number;
}

@observer
export class Keyframe extends React.Component<IProp> {

    @observable private _display:string = "none"; 
    @observable private _duration:number = 200; 
    @observable private _bar = React.createRef<HTMLDivElement>(); 

    componentDidMount() {
        console.log("mounted");
        if (this.props.node){
           
         
        }
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
        let bar = this._bar.current!; 
        bar.addEventListener("pointermove", this.onDragResizeLeft); 
    }

    @action 
    onDragResizeLeft = (e:PointerEvent)=>{
        e.preventDefault(); 
        e.stopPropagation(); 
        let bar = this._bar.current!;  
        let barX = bar.getBoundingClientRect().left; 
        let offset = barX - e.clientX; 
        bar.style.width = `${bar.getBoundingClientRect().width + offset}px`; 
    }

    @action 
    onResizeFinished =(e:React.PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        let bar = this._bar.current!; 
        bar.removeEventListener("pointermove", this.onDragResizeLeft); 
    }
   
    @action 
    onResizeRight = (e:React.PointerEvent)=> {
        e.preventDefault(); 
        e.stopPropagation(); 
        let bar = this._bar.current!; 
        bar.addEventListener("pointermove", this.onDragResizeRight); 
    }

    @action 
    onDragResizeRight = (e:PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        let bar = this._bar.current!;  
        let barX = bar.getBoundingClientRect().right; 
        let offset = e.clientX - barX; 
        bar.style.width = `${bar.getBoundingClientRect().width + offset}px`; 
    }
    
    render() {
        return (
            <div>
                <div className="bar" ref={this._bar} style={{ transform: `translate(${this.props.position - (this._duration/2)}px)`, width:`${this._duration}px`}} onPointerOver={this.onPointerEnter} onPointerLeave={this.onPointerOut}>
                    <div className="leftResize" onPointerDown={this.onResizeLeft} ></div>
                    <div className="rightResize" onPointerDown={this.onResizeRight}></div>
                    <div className="menubox" style={{display: this._display}}>
                        {/* <table className="menutable">
                            <tr>
                                <th>Time: </th>
                                <input placeholder={this.props.position.toString()}></input>
                            </tr>
                            <tr>
                            </tr>
                            <tr>
                                <th onPointerDown={this.onPointerDown}>Title</th>
                                <th>{this.props.node!.title}</th>
                            </tr>
                            <tr>
                                <th>X</th>
                                <th>{this.props.node!.x}</th>
                            </tr>
                            <tr>
                                <th>Y</th>
                                <th>{this.props.node!.y}</th>
                            </tr>
                        </table>  */}
                    </div>
                </div>
            </div>
        );
    }
}