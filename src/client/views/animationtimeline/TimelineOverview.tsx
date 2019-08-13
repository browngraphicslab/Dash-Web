import * as React from "react"; 
import {observable, action} from "mobx"; 
import {observer} from "mobx-react";
import "./TimelineOverview.scss"; 



interface TimelineOverviewProps{
    totalLength: number; 
    visibleLength:number; 
    visibleStart:number;
    currentBarX:number; 
    changeCurrentBarX: (pixel:number) => void; 
    movePanX: (pixel:number) => any;
}


@observer
export class TimelineOverview extends React.Component<TimelineOverviewProps>{
    @observable private _visibleRef = React.createRef<HTMLDivElement>(); 
    @observable private _scrubberRef = React.createRef<HTMLDivElement>(); 
    
    @action
    onPointerDown = (e:React.PointerEvent) => {
        document.removeEventListener("pointermove", this.onPanX); 
        document.removeEventListener("pointerup", this.onPointerUp); 
        document.addEventListener("pointermove", this.onPanX); 
        document.addEventListener("pointerup", this.onPointerUp); 
    }

    @action
    onPanX = (e: PointerEvent) => {
        let movX = (this.props.visibleStart / this.props.totalLength)* 300 + e.movementX; 
        this.props.movePanX((movX / 300) * this.props.totalLength); 
    }

    @action
    onPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPanX); 
        document.removeEventListener("pointerup", this.onPointerUp); 
    }

    @action
    onScrubberDown = ( e:React.PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        document.removeEventListener("pointermove", this.onScrubberMove); 
        document.removeEventListener("pointerup", this.onScrubberUp); 
        document.addEventListener("pointermove", this.onScrubberMove); 
        document.addEventListener("pointerup", this.onScrubberUp);
    }

    @action
    onScrubberMove = (e: PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        let scrubberRef = this._scrubberRef.current!; 
        let left = scrubberRef.getBoundingClientRect().left; 
        let offsetX = Math.round(e.clientX - left); 
        this.props.changeCurrentBarX(((offsetX / 300) * this.props.totalLength) + this.props.currentBarX); 
    }

    @action
    onScrubberUp = (e:PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        document.removeEventListener("pointermove", this.onScrubberMove); 
        document.removeEventListener("pointerup", this.onScrubberUp);
    }

    render(){
        return(
            <div key="timeline-overview-container" className="timeline-overview-container">
                <div ref={this._visibleRef} key="timeline-overview-visible" className="timeline-overview-visible" style={{marginLeft:`${(this.props.visibleStart / this.props.totalLength)* 300}px`, width:`${(this.props.visibleLength / this.props.totalLength) * 300}px`}} onPointerDown={this.onPointerDown}></div>
                <div ref={this._scrubberRef} key="timeline-overview-scrubber-container" className="timeline-overview-scrubber-container" style={{marginLeft:`${(this.props.currentBarX / this.props.totalLength) * 300}px`}} onPointerDown={this.onScrubberDown}>
                    <div key="timeline-overview-scrubber-head" className="timeline-overview-scrubber-head"></div>
                </div>
            </div>
        ); 
    }

}


