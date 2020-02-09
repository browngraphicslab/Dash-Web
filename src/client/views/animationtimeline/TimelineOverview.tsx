import * as React from "react";
import { observable, action, computed, runInAction, reaction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import "./TimelineOverview.scss";
import * as $ from 'jquery';
import { Timeline } from "./Timeline";
import { Keyframe, KeyframeFunc } from "./Keyframe";


interface TimelineOverviewProps {
    totalLength: number;
    visibleLength: number;
    visibleStart: number;
    currentBarX: number;
    isAuthoring: boolean;
    parent: Timeline;
    changeCurrentBarX: (pixel: number) => void;
    movePanX: (pixel: number) => any;
    time: number;
    tickSpacing: number;
    tickIncrement: number;
}


@observer
export class TimelineOverview extends React.Component<TimelineOverviewProps>{
    @observable private _visibleRef = React.createRef<HTMLDivElement>();
    @observable private _scrubberRef = React.createRef<HTMLDivElement>();
    @observable private overviewBarWidth: number = 0;
    @observable private playbarWidth: number = 0;
    @observable private activeOverviewWidth: number = 0;
    @observable private _authoringReaction?: IReactionDisposer;
    @observable private visibleTime: number = 0;
    @observable private currentX: number = 0;
    @observable private visibleStart: number = 0;
    private readonly DEFAULT_HEIGHT = 50;
    private readonly DEFAULT_WIDTH = 300;

    componentDidMount = () => {
        this.setOverviewWidth();

        this._authoringReaction = reaction(
            () => this.props.parent._isAuthoring,
            () => {
                if (!this.props.parent._isAuthoring) {
                    runInAction(() => {
                        this.setOverviewWidth();
                    });
                }
            },
        );
    }

    componentWillUnmount = () => {
        this._authoringReaction && this._authoringReaction();
    }

    @action
    setOverviewWidth() {
        const width1 = $("#timelineOverview").width();
        const width2 = $("#timelinePlay").width();
        if (width1 && width1 !== 0) this.overviewBarWidth = width1;
        if (width2 && width2 !== 0) this.playbarWidth = width2;

        if (this.props.isAuthoring) {
            this.activeOverviewWidth = this.overviewBarWidth;
        }
        else {
            this.activeOverviewWidth = this.playbarWidth;
        }
    }

    @action
    onPointerDown = (e: React.PointerEvent) => {
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
        const movX = (this.props.visibleStart / this.props.totalLength) * (this.DEFAULT_WIDTH) + e.movementX;
        this.props.movePanX((movX / (this.DEFAULT_WIDTH)) * this.props.totalLength);
    }

    @action
    onPointerUp = (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("pointermove", this.onPanX);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    @action
    onScrubberDown = (e: React.PointerEvent) => {
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
        const scrubberRef = this._scrubberRef.current!;
        const left = scrubberRef.getBoundingClientRect().left;
        const offsetX = Math.round(e.clientX - left);
        this.props.changeCurrentBarX((((offsetX) / this.activeOverviewWidth) * this.props.totalLength) + this.props.currentBarX);
    }

    @action
    onScrubberUp = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onScrubberMove);
        document.removeEventListener("pointerup", this.onScrubberUp);
    }

    @action
    getTimes() {
        const vis = KeyframeFunc.convertPixelTime(this.props.visibleLength, "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        const x = KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        const start = KeyframeFunc.convertPixelTime(this.props.visibleStart, "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        this.visibleTime = vis;
        this.currentX = x;
        this.visibleStart = start;
    }

    render() {
        this.setOverviewWidth();
        this.getTimes();

        const percentVisible = this.visibleTime / this.props.time;
        const visibleBarWidth = percentVisible * this.activeOverviewWidth;

        const percentScrubberStart = this.currentX / this.props.time;
        let scrubberStart = this.props.currentBarX / this.props.totalLength * this.activeOverviewWidth;
        if (scrubberStart > this.activeOverviewWidth) scrubberStart = this.activeOverviewWidth; 

        const percentBarStart = this.visibleStart / this.props.time;
        const barStart = percentBarStart * this.activeOverviewWidth;

        let playWidth = (this.props.currentBarX / this.props.totalLength) * this.activeOverviewWidth; 
        if (playWidth > this.activeOverviewWidth) playWidth = this.activeOverviewWidth; 

        const timeline = this.props.isAuthoring ? [

            <div key="timeline-overview-container" className="timeline-overview-container overviewBar" id="timelineOverview">
                <div ref={this._visibleRef} key="timeline-overview-visible" className="timeline-overview-visible" style={{ left: `${barStart}px`, width: `${visibleBarWidth}px` }} onPointerDown={this.onPointerDown}></div>,
                <div ref={this._scrubberRef} key="timeline-overview-scrubber-container" className="timeline-overview-scrubber-container" style={{ left: `${scrubberStart}px` }} onPointerDown={this.onScrubberDown}>
                    <div key="timeline-overview-scrubber-head" className="timeline-overview-scrubber-head"></div>
                </div>
            </div>
        ] : [
                <div key="timeline-play-container" className="timeline-play-bar overviewBar" id="timelinePlay">
                    <div ref={this._scrubberRef} className="timeline-play-head" style={{ left: `${scrubberStart}px` }} onPointerDown={this.onScrubberDown}></div>
                </div>,
                <div className="timeline-play-tail" style={{ width: `${playWidth}px` }}></div>
            ];
        return (
            <div className="timeline-flex">
                <div className="timelineOverview-bounding">
                    {timeline}
                </div>
            </div>
        );
    }

}


