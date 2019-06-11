import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import "./IconBar.scss";
import * as anime from 'animejs';
import { DocTypes } from '../../documents/Documents';
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as _ from "lodash";
var classNames = require('classnames');

library.add(faSearch);
library.add(faObjectGroup);
library.add(faImage);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);
library.add(faMusic);
library.add(faLink);
library.add(faChartBar);
library.add(faGlobeAsia);
library.add(faBan);

export interface IconBarProps {
    updateIcon(icons: string[]): void;
    getIcons(): string[];
}

@observer
export class IconBar extends React.Component<IconBarProps> {

    @observable noneRef = React.createRef<HTMLDivElement>();
    @observable colRef = React.createRef<HTMLDivElement>();
    @observable imgRef = React.createRef<HTMLDivElement>();
    @observable textRef = React.createRef<HTMLDivElement>();
    @observable pdfRef = React.createRef<HTMLDivElement>();
    @observable vidRef = React.createRef<HTMLDivElement>();
    @observable audioRef = React.createRef<HTMLDivElement>();
    @observable linkRef = React.createRef<HTMLDivElement>();
    @observable histRef = React.createRef<HTMLDivElement>();
    @observable webRef = React.createRef<HTMLDivElement>();
    @observable allRefs: React.RefObject<HTMLDivElement>[] = [this.colRef, this.imgRef, this.textRef, this.pdfRef, this.vidRef, this.audioRef, this.linkRef, this.histRef, this.webRef];

    @observable originalFilteredNodes: string[] = this.props.getIcons();

    componentDidMount = () => {
        //i KNOW this is bad i just can't get this to re render eeeeeeeek
        this.forceUpdate();
    }

    //gets ref associated with given string
    @action.bound
    getRef = (value: string) => {
        let toReturn;
        switch (value) {
            case (DocTypes.NONE):
                toReturn = this.noneRef.current;
                break;
            case (DocTypes.AUDIO):
                toReturn = this.audioRef.current;
                break;
            case (DocTypes.COL):
                toReturn = this.colRef.current;
                break;
            case (DocTypes.HIST):
                toReturn = this.histRef.current;
                break;
            case (DocTypes.IMG):
                toReturn = this.imgRef.current;
                break;
            case (DocTypes.LINK):
                toReturn = this.linkRef.current;
                break;
            case (DocTypes.PDF):
                toReturn = this.pdfRef.current;
                break;
            case (DocTypes.TEXT):
                toReturn = this.textRef.current;
                break;
            case (DocTypes.VID):
                toReturn = this.vidRef.current;
                break;
            case (DocTypes.WEB):
                toReturn = this.webRef.current;
                break;
            default:
                toReturn = null;
                break;
        }

        return toReturn;
    }

    @action.bound
    unselectAllRefs() {
        
        this.allRefs.forEach(element => {
            if (element.current) {
                element.current.setAttribute("data-selected", "false");
            }
        });
    }

    @action.bound
    alternateRef(ref: any) {
        if (ref.getAttribute("data-selected") === "true") {
            ref.setAttribute("data-selected", "false");
        }
        else {
            ref.setAttribute("data-selected", "true");
        }
    }

    @action.bound
    onClick = (value: string) => {
        let icons: string[] = this.props.getIcons();
        let ref = this.getRef(value);
        this.alternateRef(ref);
        if (value === DocTypes.NONE) {
            icons = [];
            // if its none, change the color of all the other circles
            this.unselectAllRefs();
        }
        else {
            //if it's already selected, unselect it
            if (icons.includes(value)) {
                icons = _.without(icons, value);
            }
            //if it's not yet selected, select it
            else {
                icons.push(value);
            }
        }
        this.props.updateIcon(icons);
        //ok i know that this is bad but i dont know how else to get it to rerender and change the classname,
        //any help here is greatly appreciated thanks frens
        this.forceUpdate();
    }

    //checks if option is selected based on the attribute data-selected
    @action.bound
    isRefSelected = (ref: React.RefObject<HTMLDivElement>) => {
        if (ref.current) {
            if (ref.current.getAttribute("data-selected") === "true") {
                return true;
            }
            return false;
        }
    }

    getInitialStatus = (type: string) => {
        if (this.originalFilteredNodes.includes(type)) {
            return "true";
        }
        return "false";
    }

    render() {
        return (
            <div>
                <div className="icon-title">Filter by type of node</div>
                <div className="icon-bar">
                    <div className="type-outer">
                        <div className={"type-icon none"}
                            ref={this.noneRef}
                            data-selected={"false"}
                            onClick={() => { this.onClick(DocTypes.NONE); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: -2 }} icon={faBan} />
                        </div>
                        <div className="filter-description">Clear</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon " + (this.isRefSelected(this.pdfRef) ? "selected" : "not-selected")}
                            ref={this.pdfRef}
                            data-selected={this.getInitialStatus(DocTypes.PDF)}
                            onClick={() => { this.onClick(DocTypes.PDF); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: 0 }} icon={faFilePdf} />
                        </div>
                        <div className="filter-description">PDF</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon " + (this.isRefSelected(this.histRef) ? "selected" : "not-selected")}
                            ref={this.histRef}
                            data-selected={this.getInitialStatus(DocTypes.HIST)}
                            onClick={() => { this.onClick(DocTypes.HIST); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: 1 }} icon={faChartBar} />
                        </div>
                        <div className="filter-description">Histogram</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon " + (this.isRefSelected(this.colRef) ? "selected" : "not-selected")}
                            ref={this.colRef}
                            data-selected={this.getInitialStatus(DocTypes.COL)}
                            onClick={() => { this.onClick(DocTypes.COL); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: 2 }} icon={faObjectGroup} />
                        </div>
                        <div className="filter-description">Collection</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon " + (this.isRefSelected(this.imgRef) ? "selected" : "not-selected")}
                            ref={this.imgRef}
                            data-selected={this.getInitialStatus(DocTypes.IMG)}
                            onClick={() => { this.onClick(DocTypes.IMG); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: 3 }} icon={faImage} />
                        </div>
                        <div className="filter-description">Image</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon " + (this.isRefSelected(this.vidRef) ? "selected" : "not-selected")}
                            ref={this.vidRef}
                            data-selected={this.getInitialStatus(DocTypes.VID)}
                            onClick={() => { this.onClick(DocTypes.VID); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: 4 }} icon={faFilm} />
                        </div>
                        <div className="filter-description">Video</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon " + (this.isRefSelected(this.webRef) ? "selected" : "not-selected")}
                            ref={this.webRef}
                            data-selected={this.getInitialStatus(DocTypes.WEB)}
                            onClick={() => { this.onClick(DocTypes.WEB); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: 5 }} icon={faGlobeAsia} />
                        </div>
                        <div className="filter-description">Web</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon " + (this.isRefSelected(this.linkRef) ? "selected" : "not-selected")}
                            ref={this.linkRef}
                            data-selected={this.getInitialStatus(DocTypes.LINK)}
                            onClick={() => { this.onClick(DocTypes.LINK); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: 6 }} icon={faLink} />
                        </div>
                        <div className="filter-description">Link</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon " + (this.isRefSelected(this.audioRef) ? "selected" : "not-selected")}
                            ref={this.audioRef}
                            data-selected={this.getInitialStatus(DocTypes.AUDIO)}
                            onClick={() => { this.onClick(DocTypes.AUDIO); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: 7 }} icon={faMusic} />
                        </div>
                        <div className="filter-description">Audio</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon " + (this.isRefSelected(this.textRef) ? "selected" : "not-selected")}
                            ref={this.textRef}
                            data-selected={this.getInitialStatus(DocTypes.TEXT)}
                            onClick={() => { this.onClick(DocTypes.TEXT); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: 8 }} icon={faStickyNote} />
                        </div>
                        <div className="filter-description">Text</div>
                    </div>
                </div>
            </div>
        );
    }
}
