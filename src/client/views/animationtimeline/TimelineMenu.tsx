import * as React from "react";
import {observable, action, runInAction} from "mobx"; 
import {observer} from "mobx-react"; 
import "./TimelineMenu.scss"; 
import { jSXAttribute } from "babel-types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faRoad, faClipboard, faPen, faTrash, faTable } from "@fortawesome/free-solid-svg-icons";
import { AddComparisonResult } from "../../northstar/model/idea/idea";


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
    @observable private _currentMenu:JSX.Element[] = []; 
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
    openMenu = (x?:number, y?:number) => {
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

    addItem = (type: "input" | "button", title: string, event: (e:any) => void) => {
        if (type === "input"){
            let ref = React.createRef<HTMLInputElement>(); 
            let text = ""; 
            return <div className="timeline-menu-item"><FontAwesomeIcon icon={faClipboard} size="lg"/><input className="timeline-menu-input" ref = {ref} placeholder={title} onChange={(e) => {text = e.target.value;}} onKeyDown={(e:React.KeyboardEvent) => {
                if(e.keyCode === 13){
                    event(text); 
                }}}/></div>; 
        } else if (type === "button") {
            let ref = React.createRef<HTMLDivElement>(); 
            return <div className="timeline-menu-item"><FontAwesomeIcon icon={faChartLine}size="lg"/><p className="timeline-menu-desc" onClick={event}>{title}</p></div>; 
        }
        return <div></div>; 
    }

    @action 
    addMenu = (title:string, items: JSX.Element[]) => {
        items.unshift(<div className="timeline-menu-header"><p className="timeline-menu-header-desc">{title}</p></div>); 
        this._currentMenu = items;  
    }

    render() {
        // let menu: (JSX.Element[] | undefined);
        // switch(this._type){
        //     case "keyframe": 
        //         menu = [ 
        //             <div className="timeline-menu-header"><p className="timeline-menu-header-desc">Keyframe</p></div>, 
        //             <div className="timeline-menu-item"><FontAwesomeIcon icon={faTable} size="lg"/><p className="timeline-menu-desc">Show Data</p> </div>, 
        //             <div className="timeline-menu-item"><FontAwesomeIcon icon={faTrash} size="lg"/><p className="timeline-menu-desc"> Delete</p></div>,
        //             <div className="timeline-menu-item"><FontAwesomeIcon icon={faClipboard} size="lg"/><input className="timeline-menu-input"placeholder="Move Keyframe"/></div> 
                   
        //         ]; 
        //         break; 
        //     case "region" :
        //         menu = [
        //             <div className="timeline-menu-header"><p className="timeline-menu-header-desc">Region</p></div>, 
        //             <div className="timeline-menu-item"><FontAwesomeIcon icon={faChartLine}size="lg"/><p className="timeline-menu-desc" onClick={this.addEase}>Add Ease</p></div>,
        //             <div className="timeline-menu-item"><FontAwesomeIcon icon={faPen} size="lg"/><p className="timeline-menu-desc"onClick={this.addPath}>Add Path</p></div>,
        //             <div className="timeline-menu-item"><FontAwesomeIcon icon={faClipboard} size="lg"/><input className="timeline-menu-input"placeholder="fadeIn"/> </div>,
        //             <div className="timeline-menu-item"><FontAwesomeIcon icon={faClipboard} size="lg"/><input className="timeline-menu-input"placeholder="fadeOut"/></div>,
        //             <div className="timeline-menu-item"><FontAwesomeIcon icon={faClipboard} size="lg"/><input className="timeline-menu-input"placeholder="position"/></div>,
        //             <div className="timeline-menu-item"><FontAwesomeIcon icon={faClipboard} size="lg"/><input className="timeline-menu-input"placeholder="duration"/></div>,
        //         ]; 
        //         break; 
        //     case "timeline":
        //         menu = [

        //         ]; 
        //         break; 
        //     default: 
        //         break; 
            
        // }
        return (
            <div className="timeline-menu-container" style={{opacity: this._opacity, left: this._x, top: this._y}} >
                {this._currentMenu}
            </div>
        );
    }

}