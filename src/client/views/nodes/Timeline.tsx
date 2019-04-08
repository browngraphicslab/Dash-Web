import * as React from "react"
import * as ReactDOM from "react-dom"
import { observer } from "mobx-react"
import { observable } from "mobx"
import { TimelineField } from "../../../fields/TimelineField";
import "./Timeline.scss"



@observer
export class Timeline extends React.Component<TimelineField>{

    private _isRecording = false; 
    onRecord = (e:React.MouseEvent) => {
        this._isRecording = true; 
    }

    onStop = (e:React.MouseEvent) => {
        this._isRecording = false; 
    }

    render() {
        return (
            <div>
                <div className="timeline-container"> 
                    <div className="timeline">

                    </div> 
                    <button onClick = {this.onRecord}>Record</button>
                    <button onClick = {this.onStop}> Stop </button>
                </div>
            </div>
        )
    }
}