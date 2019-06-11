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
    updateIcon(newIcons: string[]): void;
    getIcons(): string[];
}

@observer
export class IconBar extends React.Component<IconBarProps> {

    @observable newIcons: string[] = [];
    // @observable selectedStyle = {
    //     backgroundColor: "#121721"
    // }
    // @observable unselectedStyle = {
    //     backgroundColor: "#c2c2c5"
    // }

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

    //changes colors of buttons on click - not sure if this is the best method (it probably isn't)
    //but i spent a ton of time on it and this is the only thing i could get to work
    // componentDidMount = () => {

    //     let buttons = document.querySelectorAll<HTMLDivElement>(".type-icon").forEach(node =>
    //         node.addEventListener('click', function () {
    //             if (this.style.backgroundColor === "rgb(194, 194, 197)") {
    //                 this.style.backgroundColor = "#121721";
    //             }
    //             else {
    //                 this.style.backgroundColor = "#c2c2c5"
    //             }
    //         })
    //     );

    // }

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

        // console.log(toReturn)
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
        // console.log("alternating")
        // console.log("before")
        // console.log(ref.getAttribute("data-selected"));
        // console.log(ref.getAttribute("class"));
        // console.log(ref)
        if (ref.getAttribute("data-selected") === "true") {
            // console.log("is true")
            ref.setAttribute("data-selected", "false")
        }
        else {
            // console.log("is false")
            ref.setAttribute("data-selected", "true")
        }
        // console.log("after")
        // console.log(ref.getAttribute("data-selected"));
        // console.log(ref.getAttribute("class"));
        // console.log(ref)
    }

    @action.bound
    onClick = (value: string) => {
        // console.log("clicking")
        let oldIcons = this.props.getIcons()
        let ref = this.getRef(value);
        this.alternateRef(ref);
        if (value === DocTypes.NONE) {
            this.newIcons = [value];
            this.unselectAllRefs();

            // if its none, change the color of all the other circles
            // document.querySelectorAll<HTMLDivElement>(".type-icon").forEach(node => {
            //     if (node.id === "none") {
            //         node.style.backgroundColor = "#c2c2c5";
            //     }
            //     else {
            //         node.style.backgroundColor = "#121721";
            //     }
            // }
            // );
        }
        else {
            //turns "none" button off
            // let noneDoc = document.getElementById(DocTypes.NONE)
            // if (noneDoc) {
            //     noneDoc.style.backgroundColor = "#121721";
            // }
            if (oldIcons.includes(value)) {
                this.newIcons = _.remove(oldIcons, value);
                if (this.newIcons.length === 0) {
                    this.newIcons = [DocTypes.NONE];
                    if (this.noneRef.current) {
                        this.noneRef.current.setAttribute("data-selected", "true");
                    }
                }
            }
            else {
                if (this.noneRef.current) {
                    this.noneRef.current.setAttribute("data-selected", "false");
                }
                this.newIcons = oldIcons;
                if (this.newIcons.length === 1 && this.newIcons[0] === DocTypes.NONE) {
                    this.newIcons = [value]
                }
                else { this.newIcons.push(value); }
            }
        }
        this.props.updateIcon(this.newIcons);
        //ok i know that this is bad but i dont know how else to get it to rerender and change the classname,
        //any help here is greatly appreciated thanks frens
        this.forceUpdate();
    }

    @action.bound
    isRefSelected(ref: React.RefObject<HTMLDivElement>) {
        if (ref.current) {
            if (ref.current.getAttribute("data-selected") === "true") {
                return true;
            }
            return false;
        }
    }

    render() {

        return (
            <div>
                <div className="icon-bar">
                    <div
                        className={"type-icon none"}
                        ref={this.noneRef}
                        data-selected={"true"}
                        onClick={() => { this.onClick(DocTypes.NONE) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: -2 }} icon={faBan} />
                    </div>
                    <div
                        className={"type-icon " + (this.isRefSelected(this.pdfRef) ? "selected" : "not-selected")}
                        ref={this.pdfRef}
                        data-selected={"false"}
                        onClick={() => { this.onClick(DocTypes.PDF) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 0 }} icon={faFilePdf} />
                    </div>
                    <div
                        className={"type-icon " + (this.isRefSelected(this.histRef) ? "selected" : "not-selected")}
                        ref={this.histRef}
                        data-selected={"false"}
                        onClick={() => { this.onClick(DocTypes.HIST) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 1 }} icon={faChartBar} />
                    </div>
                    <div
                        className={"type-icon " + (this.isRefSelected(this.colRef) ? "selected" : "not-selected")}
                        ref={this.colRef}
                        data-selected={"false"}
                        onClick={() => { this.onClick(DocTypes.COL) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 2 }} icon={faObjectGroup} />
                    </div>
                    <div
                        className={"type-icon " + (this.isRefSelected(this.imgRef) ? "selected" : "not-selected")}
                        ref={this.imgRef}
                        data-selected={"false"}
                        onClick={() => { this.onClick(DocTypes.IMG) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 3 }} icon={faImage} />
                    </div>
                    <div
                        className={"type-icon " + (this.isRefSelected(this.vidRef) ? "selected" : "not-selected")}
                        ref={this.vidRef}
                        data-selected={"false"}
                        onClick={() => { this.onClick(DocTypes.VID) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 4 }} icon={faFilm} />
                    </div>
                    <div
                        className={"type-icon " + (this.isRefSelected(this.webRef) ?"selected" : "not-selected")}
                        ref={this.webRef}
                        data-selected={"false"}
                        onClick={() => { this.onClick(DocTypes.WEB) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 5 }} icon={faGlobeAsia} />
                    </div>
                    <div
                        className={"type-icon " + (this.isRefSelected(this.linkRef) ?"selected" : "not-selected")}
                        ref={this.linkRef}
                        data-selected={"false"}
                        onClick={() => { this.onClick(DocTypes.LINK) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 6 }} icon={faLink} />
                    </div>
                    <div
                        className={"type-icon " + (this.isRefSelected(this.audioRef) ? "selected" : "not-selected")}
                        ref={this.audioRef}
                        data-selected={"false"}
                        onClick={() => { this.onClick(DocTypes.AUDIO) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 7 }} icon={faMusic} />
                    </div>
                    <div
                        className={"type-icon " + (this.isRefSelected(this.textRef) ?"selected" : "not-selected")}
                        ref={this.textRef}
                        data-selected={"false"}
                        onClick={() => { this.onClick(DocTypes.TEXT) }}>
                        <FontAwesomeIcon className="fontawesome-icon" style={{ order: 8 }} icon={faStickyNote} />
                    </div>
                </div>
            </div>
        )
    }
}
