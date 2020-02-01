import * as React from "react";
import { observable, action, computed, runInAction, reaction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import "./TimelineOverview.scss";
import * as $ from 'jquery';
import { Timeline } from "./Timeline";


interface TimelineOverviewProps {
    totalLength: number;
    visibleLength: number;
    visibleStart: number;
    currentBarX: number;
    isAuthoring: boolean;
    parent: Timeline;
    changeCurrentBarX: (pixel: number) => void;
    movePanX: (pixel: number) => any;
    panelWidth: number;
}


@observer
export class TimelineOverview extends React.Component<TimelineOverviewProps>{
    @observable private _visibleRef = React.createRef<HTMLDivElement>();
    @observable private _scrubberRef = React.createRef<HTMLDivElement>();
    @observable private overviewBarWidth: number = 0;
    @observable private _authoringReaction?: IReactionDisposer;
    @observable private _resizeReaction?: IReactionDisposer;
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
        // this._resizeReaction = reaction(
        //     () => this.props.parent.props.PanelWidth,
        //     () => {
        //         // if (!this.props.parent._isAuthoring) {
        //         // runInAction(() => {
        //         console.log("resizing");
        //         this.setOverviewWidth();
        //         // });
        //         // }
        //     },
        // );
    }

    componentWillUnmount = () => {
        this._authoringReaction && this._authoringReaction();
        this._resizeReaction && this._resizeReaction();
    }

    @action
    setOverviewWidth() {
        let width = $("#timelineOverview").width();
        if (width) this.overviewBarWidth = width;
        else this.overviewBarWidth = 0;
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
        let movX = (this.props.visibleStart / this.props.totalLength) * (this.DEFAULT_WIDTH) + e.movementX;
        // let movX = (this.props.visibleStart / this.props.totalLength) * (this.overviewWidth) + e.movementX;
        this.props.movePanX((movX / (this.DEFAULT_WIDTH)) * this.props.totalLength);
        // this.props.movePanX((movX / (this.overviewWidth) * this.props.totalLength);

        // console.log(this.props.totalLength);
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
        let scrubberRef = this._scrubberRef.current!;
        let left = scrubberRef.getBoundingClientRect().left;
        let offsetX = Math.round(e.clientX - left);
        this.props.changeCurrentBarX((offsetX / (this.DEFAULT_WIDTH) * this.props.totalLength) + this.props.currentBarX);
    }

    @action
    onScrubberUp = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onScrubberMove);
        document.removeEventListener("pointerup", this.onScrubberUp);
    }

    render() {

        console.log("helo")
        // calculates where everything should fall based on its size
        let percentVisible = this.props.visibleLength / this.props.totalLength;
        console.log(this.props.visibleLength)
        let visibleBarWidth = percentVisible * this.overviewBarWidth;

        let percentScrubberStart = this.props.currentBarX / this.props.totalLength;
        let scrubberStart = percentScrubberStart * this.overviewBarWidth;

        let percentBarStart = this.props.visibleStart / this.props.totalLength;
        let barStart = percentBarStart * this.overviewBarWidth;

        let timeline = this.props.isAuthoring ? [

            <div key="timeline-overview-container" className="timeline-overview-container" id="timelineOverview">
                <div ref={this._visibleRef} key="timeline-overview-visible" className="timeline-overview-visible" style={{ left: `${barStart}px`, width: `${visibleBarWidth}px` }} onPointerDown={this.onPointerDown}></div>,
                <div ref={this._scrubberRef} key="timeline-overview-scrubber-container" className="timeline-overview-scrubber-container" style={{ left: `${scrubberStart}px` }} onPointerDown={this.onScrubberDown}>
                    <div key="timeline-overview-scrubber-head" className="timeline-overview-scrubber-head"></div>
                </div>
            </div>
        ] : [
                <div className="timeline-play-bar">
                    <div ref={this._scrubberRef} className="timeline-play-head" style={{ left: `${(this.props.currentBarX / this.props.totalLength) * 294}px` }} onPointerDown={this.onScrubberDown}></div>
                </div>,
                <div className="timeline-play-tail" style={{ width: `${(this.props.currentBarX / this.props.totalLength) * 294}px` }}></div>
            ];
        return (
            <div className="timelineOverview-bounding">
                {timeline}
            </div>
        );
    }

}


