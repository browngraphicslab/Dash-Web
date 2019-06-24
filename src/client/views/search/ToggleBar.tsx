import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction, computed } from 'mobx';
import "./SearchBox.scss";
import "./ToggleBar.scss";
import * as anime from 'animejs';
import { SearchBox } from './SearchBox';

export interface ToggleBarProps {
    originalStatus: boolean;
    optionOne: string;
    optionTwo: string;
    handleChange(): void;
    getStatus(): boolean;
}

@observer
export class ToggleBar extends React.Component<ToggleBarProps>{
    static Instance: ToggleBar;

    @observable forwardTimeline: anime.AnimeTimelineInstance;
    @observable _toggleButton: React.RefObject<HTMLDivElement>;
    @observable _originalStatus: boolean = this.props.originalStatus;

    constructor(props: ToggleBarProps) {
        super(props);
        ToggleBar.Instance = this;
        this._toggleButton = React.createRef();
        this.forwardTimeline = anime.timeline({
            loop: false,
            autoplay: false,
            direction: "reverse",
        });
    }

    @computed get totalWidth() { return this.getTotalWidth(); }

    getTotalWidth() {
        let bar = document.getElementById("toggle-bar");
        let tog = document.getElementById("toggle-button");
        let barwidth = 0;
        let togwidth = 0;
        if (bar && tog) {
            console.log("they exist")
            barwidth = bar.getBoundingClientRect().width;
            // barwidth = bar.clientWidth;
            console.log(barwidth)
            togwidth = tog.getBoundingClientRect().width;
            // togwidth = tog.clientWidth;
            console.log(togwidth)
        }
        let totalWidth = (barwidth - togwidth - 10);
        console.log(totalWidth)
        return totalWidth;
    }

    componentDidMount = () => {

        // let totalWidth = this.totalWidth;
        let totalWidth = 265;

        if (this._originalStatus) {
            this.forwardTimeline.add({
                targets: this._toggleButton.current,
                translateX: totalWidth,
                easing: "easeInOutQuad",
                duration: 500
            });
        }
        else {
            this.forwardTimeline.add({
                targets: this._toggleButton.current,
                translateX: -totalWidth,
                easing: "easeInOutQuad",
                duration: 500
            });
        }
    }

    @action.bound
    onclick() {
        this.forwardTimeline.play();
        this.forwardTimeline.reverse();
        this.props.handleChange();
    }

    @action.bound
    public resetToggle = () => {
        if (!this.props.getStatus()) {
            this.forwardTimeline.play();
            this.forwardTimeline.reverse();
            this.props.handleChange();
        }
    }

    render() {
        return (
            <div>
                <div className="toggle-title">
                    <div className="toggle-option" style={{ opacity: (this.props.getStatus() ? 1 : .4) }}>{this.props.optionOne}</div>
                    <div className="toggle-option" style={{ opacity: (this.props.getStatus() ? .4 : 1) }}>{this.props.optionTwo}</div>
                </div>
                <div className="toggle-bar" id="toggle-bar" onClick={this.onclick} style={{ flexDirection: (this._originalStatus ? "row" : "row-reverse") }}>
                    <div className="toggle-button" id="toggle-button" ref={this._toggleButton}  />
                </div>
            </div>
        );
    }
}