import * as React from "react"
import * as ReactDOM from "react-dom"
import { observer } from "mobx-react"
import { observable, reaction, action} from "mobx"
import "./Timeline.scss"
import { KeyStore } from "../../../fields/KeyStore";
import { Document } from "../../../fields/Document";
import { KeyFrame } from "./KeyFrame";

@observer
export class Timeline extends React.Component{
    @observable private _inner = React.createRef<HTMLDivElement>(); 
    @observable private _isRecording:Boolean = false;
    @observable private _currentBar:any; 

    @action
    onRecord = (e: React.MouseEvent) => {
        this._isRecording = true;
    }

    @action
    onStop = (e: React.MouseEvent) => {
        this._isRecording = false;
    }

    @action
    onInnerPointerDown = (e:React.PointerEvent) => {
        if (this._isRecording) {
            if (this._inner.current){
                if (this._currentBar == null){
                    let mouse = e.nativeEvent; 
                    let _currentBar = document.createElement("div"); 
                    _currentBar.style.height = "100%"; 
                    _currentBar.style.width = "5px"
                    _currentBar.style.left = "mouse.offsetX"; 
                    _currentBar.style.backgroundColor = "white"
                    _currentBar.style.transform = `translate(${mouse.offsetX}px)`; 
                    this._inner.current.appendChild(_currentBar); 
                } else {
                    this._currentBar.remove()
                    this._currentBar = null; 
                }
                
            }
        }
    }


    private _keyFrames:KeyFrame[] = []; 

    componentDidMount() {
        // let doc: Document;
        // let keyFrame = new KeyFrame(); 
        // this._keyFrames.push(keyFrame); 
        // let keys = [KeyStore.X, KeyStore.Y];
        // reaction(() => {
        //     return keys.map(key => doc.GetNumber(key, 0));
        // }, data => {
        //     keys.forEach((key, index) => {
        //         keyFrame.document().SetNumber(key, data[index]);
        //     });
        // });
    }

    render() {
        return (
            <div>
                <div className="timeline-container">
                    <div className="timeline">
                        <div className="inner" ref = {this._inner} onPointerDown  = {this.onInnerPointerDown}>
                        </div>
                    </div>
                    <button>Record</button>
                    <button> Stop </button>
                    <input placeholder="Time"></input>
                </div>
            </div>
        )
    }
}