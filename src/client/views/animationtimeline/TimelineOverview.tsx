import * as React from "react"; 
import {observable} from "mobx"; 
import {observer} from "mobx-react";
import "./TimelineOverview.scss"; 



interface TimelineOverviewProps{
    totalLength: number; 
    visibleLength:number; 
    visibleStart:number;
    changeCurrentBarX: (x:number) => any; 
}


export class TimelineOverview extends React.Component<TimelineOverviewProps>{


    render(){
        return(
            <div key="timeline-overview-container" className="timeline-overview-container">
                <div key="timeline-overview-visible" className="timeline-overview-visible" style={{left:`${this.props.visibleStart}px`, width:`${this.props.visibleLength}px`}}></div>
                <div key="timeline-overview-scrubber-container" className="timeline-overview-scrubber-container">
                    <div key="timeline-overview-scrubber-head" className="timeline-overview-scrubber-head"></div>
                    <div key="timeline-overview-scrubber-tail" className="tiemline-overview-scrubber-tail"></div>
                </div>
            </div>
        ); 
    }

}


