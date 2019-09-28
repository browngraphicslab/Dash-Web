import * as React from "react"; 
import {observable, action} from "mobx"; 
import {observer} from "mobx-react";
import "./TimelineOverview.scss"; 



interface TimelineOverviewProps{
    scale: number; 
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
        let movX = (this.props.visibleStart / this.props.totalLength)* (this.DEFAULT_WIDTH * this.props.scale) + e.movementX; 
        this.props.movePanX((movX / (this.DEFAULT_WIDTH * this.props.scale)) * this.props.totalLength); 
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
        this.props.changeCurrentBarX(((offsetX / (this.DEFAULT_WIDTH * this.props.scale)) * this.props.totalLength) + this.props.currentBarX); 
    }

    @action
    onScrubberUp = (e:PointerEvent) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        document.removeEventListener("pointermove", this.onScrubberMove); 
        document.removeEventListener("pointerup", this.onScrubberUp);
    }

    render(){
        console.log("rendered"); 
        console.log(this.props.visibleStart); 
        return(
            <div key="timeline-overview-container" className="timeline-overview-container" style={{height: `${this.DEFAULT_HEIGHT * this.props.scale * 0.8}px` ,width:`${this.DEFAULT_WIDTH * this.props.scale}`}}>
                <div ref={this._visibleRef} key="timeline-overview-visible" className="timeline-overview-visible" style={{marginLeft:`${(this.props.visibleStart / this.props.totalLength)* this.DEFAULT_WIDTH * this.props.scale}px`, width:`${(this.props.visibleLength / this.props.totalLength) * this.DEFAULT_WIDTH * this.props.scale}px`}} onPointerDown={this.onPointerDown}></div>
                <div ref={this._scrubberRef} key="timeline-overview-scrubber-container" className="timeline-overview-scrubber-container" style={{marginLeft:`${(this.props.currentBarX / this.props.totalLength) * this.DEFAULT_WIDTH * this.props.scale}px`, marginTop: `${-this.DEFAULT_HEIGHT * this.props.scale * 0.8}px`}} onPointerDown={this.onScrubberDown}>
                    <div key="timeline-overview-scrubber-head" className="timeline-overview-scrubber-head" style={{}}></div>
                </div>
            </div>
        ); 
    }

}


