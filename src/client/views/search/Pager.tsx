import * as React from 'react';
import { observer } from 'mobx-react';
import { faArrowCircleRight, faArrowCircleLeft } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import "./Pager.scss";
import { SearchBox } from './SearchBox';
import { observable, action } from 'mobx';
import { FilterBox } from './FilterBox';

library.add(faArrowCircleRight);
library.add(faArrowCircleLeft);

@observer
export class Pager extends React.Component {

    @observable _leftHover: boolean = false;
    @observable _rightHover: boolean = false;

    @action
    onLeftClick(e: React.PointerEvent) {
        FilterBox.Instance._pointerTime = e.timeStamp;
        if (SearchBox.Instance._pageNum > 0) {
            SearchBox.Instance._pageNum -= 1;
        }
    }

    @action
    onRightClick(e: React.PointerEvent) {
        FilterBox.Instance._pointerTime = e.timeStamp;
        if (SearchBox.Instance._pageNum + 1 < SearchBox.Instance._maxNum) {
            SearchBox.Instance._pageNum += 1;
        }
    }

    @action.bound
    mouseInLeft() {
        this._leftHover = true;
    }

    @action.bound
    mouseOutLeft() {
        this._leftHover = false;
    }

    @action.bound
    mouseInRight() {
        this._rightHover = true;
    }

    @action.bound
    mouseOutRight() {
        this._rightHover = false;
    }

    render() {
        return (
            <div className="search-pager">
                <div className="search-arrows">
                    <div className = "arrow"
                    onPointerDown = {this.onLeftClick} style = {SearchBox.Instance._pageNum === 0 ? {opacity: .2} : this._leftHover ? {opacity: 1} : {opacity: .7}}
                    onMouseEnter = {this.mouseInLeft} onMouseLeave = {this.mouseOutLeft}>
                        <FontAwesomeIcon className="fontawesome-icon" icon={faArrowCircleLeft} />
                    </div>
                    <div className="pager-title">
                        page {SearchBox.Instance._pageNum + 1} of {SearchBox.Instance._maxNum}
                    </div>
                    <div className = "arrow"
                    onPointerDown = {this.onRightClick} style = {SearchBox.Instance._pageNum === SearchBox.Instance._maxNum-1 ? {opacity: .2} : this._rightHover ? {opacity: 1} : {opacity: .7}}
                    onMouseEnter = {this.mouseInRight} onMouseLeave = {this.mouseOutRight}>
                        <FontAwesomeIcon className="fontawesome-icon" icon={faArrowCircleRight} />
                    </div>
                </div>
            </div>
        );
    }

}