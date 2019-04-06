import * as React from "react"
import * as ReactDOM from "react-dom"
import {observer} from "mobx-react"
import {observable} from "mobx"
import { TimelineField } from "../../../fields/TimelineField";



@observer
export class Timeline extends React.Component<TimelineField>{

    render(){
        return(
        <div>
            <h1 style={{left: `${window.pageXOffset} - 0px`, top: "100px", position:"absolute"}}> hi</h1>
        </div>)
    }
}