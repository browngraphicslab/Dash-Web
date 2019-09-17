import * as React from "react";
import {observable, action, runInAction} from "mobx"; 
import {observer} from "mobx-react"; 
import "./TimelineMenu.scss"; 
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faRoad, faClipboard, faPen, faTrash, faTable } from "@fortawesome/free-solid-svg-icons";


@observer
export class TimelineMenu extends React.Component {
    public static Instance:TimelineMenu; 

    @observable private _opacity = 0;
    @observable private _x = 0; 
    @observable private _y = 0; 
    @observable private _currentMenu:JSX.Element[] = []; 

    constructor (props:Readonly<{}>){
        super(props); 
        TimelineMenu.Instance = this; 
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
        this._currentMenu = []; 
        this._x = -1000000; 
        this._y = -1000000; 
    }

    @action
    addItem = (type: "input" | "button", title: string, event: (e:any) => void) => {
        if (type === "input"){
            let inputRef = React.createRef<HTMLInputElement>(); 
            this._currentMenu.push( <div className="timeline-menu-item"><FontAwesomeIcon icon={faClipboard} size="lg"/><input className="timeline-menu-input" ref = {inputRef} placeholder={title} onChange={(e) => {
                let text = e.target.value;
                document.addEventListener("keypress", (e:KeyboardEvent) => {
                    if (e.keyCode === 13) {
                        event(text); 
                        this.closeMenu(); 
                    }
                });
            }}/></div>); 
        } else if (type === "button") {
            let buttonRef = React.createRef<HTMLDivElement>(); 
            this._currentMenu.push( <div className="timeline-menu-item"><FontAwesomeIcon icon={faChartLine}size="lg"/><p className="timeline-menu-desc" onClick={(e) => {
                event(e); 
                this.closeMenu(); 
            }}>{title}</p></div>); 
        }
    }

    @action 
    addMenu = (title:string) => {
        this._currentMenu.unshift(<div className="timeline-menu-header"><p className="timeline-menu-header-desc">{title}</p></div>);     
    }

    render() {
        return (
            <div className="timeline-menu-container" style={{opacity: this._opacity, left: this._x, top: this._y}} >
                {this._currentMenu}
            </div>
        );
    }

}