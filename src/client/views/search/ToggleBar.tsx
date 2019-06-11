import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import "./ToggleBar.scss";
import * as anime from 'animejs';

export interface ToggleBarProps {
    //false = right, true = left
    // status: boolean;
    changeStatus(value: boolean): void;
    optionOne: string;
    optionTwo: string;
}

//TODO: justify content will align to specific side. Maybe do status passed in and out?
@observer
export class ToggleBar extends React.Component<ToggleBarProps>{

    @observable _status: boolean = false;
    @observable timeline: anime.AnimeTimelineInstance;
    @observable _toggleButton: React.RefObject<HTMLDivElement>;

    constructor(props: ToggleBarProps) {
        super(props);
        this._toggleButton = React.createRef();
        this.timeline = anime.timeline({
            autoplay: false,
            direction: "reverse"
        });
    }

    componentDidMount = () => {

        let bar = document.getElementById("toggle-bar");
        let tog = document.getElementById("toggle-button");
        let barwidth = 0;
        let togwidth = 0;
        if (bar && tog) {
            barwidth = bar.clientWidth;
            togwidth = tog.clientWidth;
        }
        let totalWidth = (barwidth - togwidth - 10);

        this.timeline.add({
            targets: this._toggleButton.current,
            loop: false,
            translateX: totalWidth,
            easing: "easeInOutQuad",
            duration: 500
        });
    }

    @action.bound
    onclick() {
        this._status = !this._status;
        this.props.changeStatus(this._status);
        this.timeline.play();
        this.timeline.reverse();
    }

    render() {
        return (
            <div>
                <div className="toggle-title">
                    <div className="toggle-option">{this.props.optionOne}</div>
                    <div className="toggle-option">{this.props.optionTwo}</div>
                </div>
                <div className="toggle-bar" id="toggle-bar">
                    <div className="toggle-button" id="toggle-button" ref={this._toggleButton} onClick={this.onclick} />
                </div>
            </div>
        );
    };
}