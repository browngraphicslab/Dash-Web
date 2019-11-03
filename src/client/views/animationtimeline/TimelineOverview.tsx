import * as React from "react"; 
import {observable, action} from "mobx"; 
import {observer} from "mobx-react";
import "./TimelineOverview.scss"; 



interface TimelineOverviewProps{
    totalLength: number; 
    visibleLength:number; 
    visibleStart:number;
    currentBarX:number;
    isAuthoring: boolean;  
    changeCurrentBarX: (pixel:number) => void; 
    movePanX: (pixel:number) => any;
}


@observer
export class TimelineOverview extends React.Component<TimelineOverviewProps>{
    @observable private _visibleRef = React.createRef<HTMLDivElement>(); 
    @observable private _scrubberRef = React.createRef<HTMLDivElement>(); 
    private readonly DEFAULT_HEIGHT = 50; 
    private readonly DEFAULT_WIDTH = 300; 

    @action
    onPointerDown = (e:React.PointerEvent) => {
        e.stopPropagation(); 
        e.preventDefault(); 
        document.removeEventListener("pointermove", this.onPanX); 
        document.removeEventListener("pointerup", this.onPointerUp); 
        document.addEventListener("pointermove", this.onPanX); 
        document.addEventListener("pointerup", this.onPointerUp); 
    }

    @action
    onPanX = (e: PointerEvent) => {
        e.stopPropagation(); 
        e.preventDefault(); 
        let movX = (this.props.visibleStart / this.props.totalLength)* (this.DEFAULT_WIDTH) + e.movementX; 
        this.props.movePanX((movX / (this.DEFAULT_WIDTH )) * this.props.totalLength); 
    }

    @action
    onPointerUp = (e: PointerEvent) => {
        e.stopPropagation(); 
        e.preventDefault(); 
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
        this.props.changeCurrentBarX((offsetX / (this.DEFAULT_WIDTH) * this.props.totalLength) + this.props.currentBarX); 
    }

    @action
    onScrubberUp = (e:PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        document.removeEventListener("pointermove", this.onScrubberMove); 
        document.removeEventListener("pointerup", this.onScrubberUp);
    }

    render(){
        let timeline = this.props.isAuthoring ? [
            <div key="timeline-overview-container" className="timeline-overview-container">
                <div ref={this._visibleRef} key="timeline-overview-visible" className="timeline-overview-visible" style={{left:`${(Math.round(this.props.visibleStart) / Math.round(this.props.totalLength)) * 296}px`, width:`${(Math.round(this.props.visibleLength) / Math.round(this.props.totalLength)) * 296}px`}} onPointerDown={this.onPointerDown}></div>,
                <div ref={this._scrubberRef} key="timeline-overview-scrubber-container" className="timeline-overview-scrubber-container" style={{left:`${(this.props.currentBarX / this.props.totalLength) * 294}px`}} onPointerDown={this.onScrubberDown}>
                    <div key="timeline-overview-scrubber-head" className="timeline-overview-scrubber-head"></div>
                </div>            
            </div>
        ] : [
            <div className="timeline-play-bar">
                <div ref={this._scrubberRef} className="timeline-play-head" style={{left:`${(this.props.currentBarX / this.props.totalLength) * 294}px`}} onPointerDown={this.onScrubberDown}></div>
            </div>,
            <div className="timeline-play-tail" style={{width: `${(this.props.currentBarX / this.props.totalLength) * 294}px`}}></div>
        ]; 
        return(
            <div>
                {timeline}
            </div>
        ); 
    }

}


