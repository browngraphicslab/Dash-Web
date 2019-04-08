import * as React from "react"
import * as ReactDOM from "react-dom"
import { observer } from "mobx-react"
import { observable } from "mobx"
import { TimelineField } from "../../../fields/TimelineField";
import "./Timeline.scss"



@observer
export class Timeline extends React.Component<TimelineField>{

    render() {
        return (
            <div>
                <div className="timeline-container"> 
                    <div className="timeline">
                       

                    </div> 
                    <button>Record</button>
                    <button> Stop </button>
                </div>
            </div>
        )
    }
}