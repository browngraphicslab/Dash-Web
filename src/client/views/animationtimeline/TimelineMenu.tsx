import * as React from "react";
import {observable, action, runInAction} from "mobx"; 
import {observer} from "mobx-react"; 
import "./TimelineMenu.scss"; 
import { jSXAttribute } from "babel-types";

/**
 * TimelineMenu: 
 * 
 * 
 * Timeline: 
 *  - 
 * 
 * 
 * Keyframe: 
 *  - Delete keyframe
 *  - Move keyframe
 *  - Edit keyframe (shows schema)
 * 
 * 
 * Region: 
 *  - Add Keyframe 
 *  - Copy Interpolation 
 *  - Copy path
 *  - Add Interpolation 
 *  - Add Path 
 *  - Change fades
 *  - position region 
 *  - duration region 
 *  - 
 */

@observer
export class TimelineMenu extends React.Component {
    public static Instance:TimelineMenu; 

    @observable private _opacity = 0;
    @observable private _x = 0; 
    @observable private _y = 0; 
    @observable private _type: "timeline" | "keyframe" | "region" | "" = ""; 


    constructor (props:Readonly<{}>){
        super(props); 
        TimelineMenu.Instance = this; 
    }
    @action
    pointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener("pointerup", this.pointerUp); 
        document.addEventListener("pointerup", this.pointerUp); 
        document.removeEventListener("pointermove", this.pointerMove); 
        document.addEventListener("pointermove", this.pointerMove); 
         
        
    }
    @action
    pointerMove = (e: PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
    }
    @action
    pointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.pointerMove); 
        document.removeEventListener("pointerup", this.pointerUp); 
    }
    
    @action
    openMenu = (type: "timeline" | "keyframe" | "region", x?:number, y?:number) => {
        this._type = type;
        this._opacity = 1; 
        x ? this._x = x : this._x = 0; 
        y ? this._y = y : this._y = 0; 
    }

    @action
    closeMenu = () => {
        this._opacity = 0; 
    }

    @action
    addEase = (e: React.MouseEvent) => {
        
    }
    @action
    addPath = (e:React.MouseEvent) => {

    }



    render() {
        let menu: (JSX.Element[] | undefined);
        switch(this._type){
            case "keyframe": 
                menu = [ 
                    <button> Show Schema</button>,  
                    <button> Delete Keyframe</button>,
                    <input placeholder="Move Keyframe"/> 
                   
                ]; 
                break; 
            case "region" :
                menu = [
                    <button onClick={this.addEase}>Add Ease</button>,
                    <button onClick={this.addPath}>Add Path</button>,
                    <input placeholder="fadeIn"/>,
                    <input placeholder="fadeOut"/>,
                    <input placeholder="position"/>,
                    <input placeholder="duration"/>,
                ]; 
                break; 
            case "timeline":
                menu = [

                ]; 
                break; 
            default: 
                break; 
            
        }
        return (
            <div className="timeline-menu-container" style={{opacity: this._opacity, left: this._x, top: this._y}} >
                {menu}
            </div>
        );
    }

}