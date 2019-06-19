import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./CheckBox.scss";
import * as anime from 'animejs';

interface CheckBoxProps {
    originalStatus: boolean;
    updateStatus(newStatus: boolean): void;
    title: string;
}

@observer
export class CheckBox extends React.Component<CheckBoxProps>{
    // true = checked, false = unchecked
    @observable _status: boolean;
    @observable uncheckTimeline: anime.AnimeTimelineInstance;
    @observable checkTimeline: anime.AnimeTimelineInstance;
    @observable checkRef: any;


    constructor(props: CheckBoxProps) {
        super(props);
        this._status = this.props.originalStatus;
        this.checkRef = React.createRef();

        this.checkTimeline = anime.timeline({
            loop: false,
            autoplay: false,
            direction: "normal",
        });this.uncheckTimeline = anime.timeline({
            loop: false,
            autoplay: false,
            direction: "normal",
        });
    }

    //testiing

    componentDidMount = () => {
        this.uncheckTimeline.add({
            targets: this.checkRef.current,
            easing: "easeInOutQuad",
            duration: 500,
            opacity: 0 ,
        });
        this.checkTimeline.add({
            targets: this.checkRef.current,
            easing: "easeInOutQuad",
            duration: 500,
            strokeDashoffset: [anime.setDashoffset, 0],
            opacity: 1
        });

        if(this.props.originalStatus){
            this.checkTimeline.play();
        }
    }

    @action.bound
    onClick = () => {
        this.props.updateStatus(!this._status);

        if(this._status){
            this.uncheckTimeline.play();
            this.uncheckTimeline.restart();
        }
        else{
            this.checkTimeline.play();
            this.checkTimeline.restart();

        }
        this._status = !this._status;
    }

    render() {
        return (
            <div className="checkbox" onClick = {this.onClick}>
            <div className = "outer">
                <div className="check-container">
                    <svg viewBox="0 12 40 40">
                        <path ref = {this.checkRef} className="checkmark" d="M14.1 27.2l7.1 7.2 16.7-18" />
                    </svg>
                </div>
                <div className="check-box"/>
                </div>
                <div className="checkbox-title">{this.props.title}</div>
            </div>
        )
    }

}