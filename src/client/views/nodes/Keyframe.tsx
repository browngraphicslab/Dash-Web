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

    async componentDidMount() {
        console.log("mounted");
        if (this.props.node){
            let field = FieldValue(this.props.node.creationDate)! as DateField; 
            console.log(field.date.toISOString());
           
         
        }
    }

    componentWillUnmount() {
        
    }
    
    @action
    onPointerEnter = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation(); 
        //console.log("in"); 
        this._display = "block"; 
    }

    @action 
    onPointerOut = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        //console.log("out"); 
        this._display = "none"; 
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


    
   
    render() {
        return (
            <div>
                <div className="bar" style={{ transform: `translate(${this.props.position}px)` }} onPointerOver={this.onPointerEnter} onPointerLeave={this.onPointerOut}>
                    <div className="menubox" style={{display: this._display}}>
                        <table className="menutable">
                            <tr>
                                <th>Time: </th>
                                <input placeholder={this.props.position.toString()}></input>
                            </tr>
                            <tr>
                                <th>Date Created: </th>
                                <th>{(FieldValue(this.props.node!.creationDate)! as DateField).date.toLocaleString()}</th>
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
                        </table> 
                    </div>
                </div>
            </div>
        );
    }
}