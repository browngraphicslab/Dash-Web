import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction, computed } from 'mobx';
import "./SearchBox.scss";
import "./ToggleBar.scss";
import * as anime from 'animejs';

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

    @observable private _forwardTimeline: anime.AnimeTimelineInstance;
    @observable private _toggleButton: React.RefObject<HTMLDivElement>;
    @observable private _originalStatus: boolean = this.props.originalStatus;

    constructor(props: ToggleBarProps) {
        super(props);
        ToggleBar.Instance = this;
        this._toggleButton = React.createRef();
        this._forwardTimeline = anime.timeline({
            loop: false,
            autoplay: false,
            direction: "reverse",
        });
    }

    componentDidMount = () => {
        const totalWidth = 265;

        if (this._originalStatus) {
            this._forwardTimeline.add({
                targets: this._toggleButton.current,
                translateX: totalWidth,
                easing: "easeInOutQuad",
                duration: 500
            });
        }
        else {
            this._forwardTimeline.add({
                targets: this._toggleButton.current,
                translateX: -totalWidth,
                easing: "easeInOutQuad",
                duration: 500
            });
        }
    }

    @action.bound
    onclick() {
        this._forwardTimeline.play();
        this._forwardTimeline.reverse();
        this.props.handleChange();
    }

    @action.bound
    public resetToggle = () => {
        if (!this.props.getStatus()) {
            this._forwardTimeline.play();
            this._forwardTimeline.reverse();
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
                    <div className="toggle-button" id="toggle-button" ref={this._toggleButton} />
                </div>
            </div>
        );
    }
}