import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import "./IconBar.scss";
import * as anime from 'animejs';
import { DocTypes } from '../../documents/Documents';
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library, icon } from '@fortawesome/fontawesome-svg-core';
import * as _ from "lodash";
import $ from 'jquery';

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
    // getSelectedTypes(): string[];
    // getRemovedTypes(): string[];
    getIcons(): string[]
    allIcons: string[];
}



@observer
export class IconBar extends React.Component<IconBarProps> {

    static Instance: IconBar;

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
    @observable originalSelected: string[] = this.props.getIcons();
    // @observable originalSelectedNodes: string[] = this.props.getSelectedTypes();
    // @observable originalRemovedNodes: string[] = this.props.getSelectedTypes();

    @observable removeType: boolean = false;
    @observable added: any[];
    @observable removed: any[];

    constructor(props: IconBarProps) {
        super(props);
        IconBar.Instance = this;
        this.added = [];
        this.removed = [];
    }

    @action
    downKeyHandler = (e: KeyboardEvent) => {
        if (e.key !== "Control") return;
        this.removeType = true;
        e.preventDefault();
        e.stopPropagation();
        document.body.style.cursor = "not-allowed";
    }

    @action
    upKeyHandler = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeType = false;
        document.body.style.cursor = "default";

    }

    componentWillMount() {
        document.removeEventListener("keydown", this.downKeyHandler);
        document.addEventListener("keydown", this.downKeyHandler);
        document.removeEventListener("keyup", this.upKeyHandler);
        document.addEventListener("keyup", this.upKeyHandler);
    }

    componentWillUnMount() {
        document.removeEventListener("keyup", this.upKeyHandler);
        document.removeEventListener("keydown", this.downKeyHandler);
    }


    componentDidMount = () => {
        //i KNOW this is bad i just can't get this to re render eeeeeeeek
        this.forceUpdate();
    }

    @action.bound
    resetIconFilters = () => {
        this.unselectAllRefs();
        // lmao sorry
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
        this.resetDataRemoved();
        this.resetDataSelected();
        this.removed = [];
        this.added = [];
    }

    @action.bound
    resetDataSelected() {
        this.allRefs.forEach(element => {
            if (element.current) {
                element.current.setAttribute("data-selected", "false");
            }
        });
    }

    @action.bound
    resetDataRemoved() {
        this.allRefs.forEach(element => {
            if (element.current) {
                element.current.setAttribute("data-removed", "false");
            }
        });
    }

    @action.bound
    alternateSelectedRef(ref: HTMLDivElement | React.RefObject<HTMLDivElement>) {
        let newRef: HTMLDivElement | null;
        if(!(ref instanceof HTMLDivElement)){newRef = ref.current;}
        else{newRef = ref;}
        if(newRef)
        {if (newRef.getAttribute("data-selected") === "true") {
            newRef.setAttribute("data-selected", "false");
        }
        else {
            newRef.setAttribute("data-selected", "true");
        }}
    }

    @action.bound
    setToRemove(ref: HTMLDivElement | React.RefObject<HTMLDivElement>) {
        let newRef: HTMLDivElement | null;
        if(!(ref instanceof HTMLDivElement)){newRef = ref.current;}
        else{newRef = ref;}
        if(newRef) newRef.setAttribute("data-removed", "true");
    }

    @action.bound
    setToAdd(ref: HTMLDivElement | React.RefObject<HTMLDivElement>) {
        let newRef: HTMLDivElement | null;
        if(!(ref instanceof HTMLDivElement)){newRef = ref.current;}
        else{newRef = ref;}
        if(newRef) newRef.setAttribute("data-removed", "false");
    }

    //TODO: this needs help
    @action.bound
    onClick = (value: string) => {
        let icons: string[] = this.props.getIcons();
        let ref: any = this.getRef(value);
        if(ref) this.alternateSelectedRef(ref);

        if (value === DocTypes.NONE) {
            icons = this.props.allIcons;
            // if its none, change the color of all the other circles
            this.resetIconFilters();
        }

        //if type should be removed
        if (this.removeType) {
            console.log("removing")
            if (this.added.length !== 0) {
                icons = this.props.allIcons;
                this.resetIconFilters();
                this.added = [];
                icons = _.without(icons, value);
                this.removed.push(ref);
                this.setToRemove(ref)
                ref.setAttribute("data-selected", "true")
            }
            else {
                //if it's included in the list, remove it
                if (icons.includes(value)) {
                    icons = _.without(icons, value);
                    this.removed.push(ref);
                    this.setToRemove(ref)
                }
                //if it's not included, add it back
                else {
                    icons.push(value);
                    //take it out of removed list
                    this.removed = _.without(this.removed, this.getRef(value));
                }
            }

        }
        //if type should be added
        else{
            console.log("adding")
            if(this.removed.length !== 0){
                icons = this.props.allIcons;
                this.resetIconFilters();
                this.removed = [];
                icons = [value];
                this.added.push(ref);
                this.setToAdd(ref)
                if(ref){ref.setAttribute("data-selected", "true")}
            }
            else{
                //if its included in the list, remove it
                if(icons.includes(value)){
                    icons = _.without(icons, value);
                    this.added = _.without(this.added, this.getRef(value))
                }
                //if its not included in the list, add it
                else{
                    icons.push(value);
                    this.added.push(ref)
                    this.setToAdd(ref)
                }
            }
        }

        this.props.updateIcon(icons);
        //ok i know that this is bad but i dont know how else to get it to rerender and change the classname,
        //any help here is greatly appreciated thanks frens
        console.log(value)
        console.log(ref.getAttribute("data-removed"));
        console.log(this.isRemoved(ref));
        console.log(ref.className)
        this.forceUpdate();
    }

    //checks if option is selected based on the attribute data-selected
    //this is for visual purposes
    @action.bound
    isRefSelected = (ref: HTMLDivElement | React.RefObject<HTMLDivElement>) => {
        let newRef: HTMLDivElement | null;
        if(!(ref instanceof HTMLDivElement)){newRef = ref.current;}
        else{newRef = ref;}
        if (newRef) {
            if (newRef.getAttribute("data-selected") === "true") {
                return true;
            }
            return false;
        }
    }

    //checks attribues of ref to return whether or not a type should be specifically included in the search
    @action.bound
    getInitialSelectedStatus = (type: string) => {
        if (this.originalSelected.includes(type)) {
            return "true";
        }
        return "false";
    }

    //checks attributes of ref to return whether or not it should be excluded from search results
    //this is for visual purposes
    @action.bound
    isRemoved = (ref: HTMLDivElement | React.RefObject<HTMLDivElement>) => {
        let newRef: HTMLDivElement | null;
        if(!(ref instanceof HTMLDivElement)){newRef = ref.current;}
        else{newRef = ref;}
        if (newRef) {
            if (newRef.getAttribute("data-removed") === "true") {
                return true;
            }
            return false;
        }
    }

    //gets status upon mounting if a doc type should be removed from the results
    @action.bound
    getInitialRemovedStatus = (type: string) => {
        if (!this.originalSelected.includes(type)) {
            return "true";
        }
        return "false";
    }

    render() {
        return (
            <div>
                <div className="filter icon-title">Filter by type of node</div>
                <div className="filter icon-bar">
                    <div className="filter type-outer">
                        <div className={"type-icon none not-selected"}
                            ref={this.noneRef}
                            data-selected={"false"}
                            data-removed={"false"}
                            onClick={() => { this.onClick(DocTypes.NONE); }}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: -2 }} icon={faBan} />
                        </div>
                        <div className="filter-description">Clear</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon filter " + (this.isRefSelected(this.pdfRef) ? "selected " + (this.isRemoved(this.pdfRef) ? "removed" : "add") : "not-selected")}
                            ref={this.pdfRef}
                            data-selected={this.getInitialSelectedStatus(DocTypes.PDF)}
                            data-removed={this.getInitialRemovedStatus(DocTypes.PDF)}
                            onClick={() => { this.onClick(DocTypes.PDF); }}>
                            <FontAwesomeIcon className="fontawesome-icon filter" style={{ order: 0 }} icon={faFilePdf} />
                        </div>
                        <div className="filter-description">{DocTypes.PDF}</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon filter " + (this.isRefSelected(this.histRef) ? "selected " + (this.isRemoved(this.histRef) ? "removed" : "add") : "not-selected")}
                            ref={this.histRef}
                            data-selected={this.getInitialSelectedStatus(DocTypes.HIST)}
                            data-removed={this.getInitialRemovedStatus(DocTypes.HIST)}
                            onClick={() => { this.onClick(DocTypes.HIST); }}>
                            <FontAwesomeIcon className="fontawesome-icon filter" style={{ order: 1 }} icon={faChartBar} />
                        </div>
                        <div className="filter-description">{DocTypes.HIST}</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon filter " + (this.isRefSelected(this.colRef) ? "selected " + (this.isRemoved(this.colRef) ? "removed" : "add") : "not-selected")}
                            ref={this.colRef}
                            data-selected={this.getInitialSelectedStatus(DocTypes.COL)}
                            data-removed={this.getInitialRemovedStatus(DocTypes.COL)}
                            onClick={() => { this.onClick(DocTypes.COL); }}>
                            <FontAwesomeIcon className="fontawesome-icon filter" style={{ order: 2 }} icon={faObjectGroup} />
                        </div>
                        <div className="filter-description">{DocTypes.COL}</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon filter " + (this.isRefSelected(this.imgRef) ? "selected " + (this.isRemoved(this.imgRef) ? "removed" : "add") : "not-selected")}
                            ref={this.imgRef}
                            data-selected={this.getInitialSelectedStatus(DocTypes.IMG)}
                            data-removed={this.getInitialRemovedStatus(DocTypes.IMG)}
                            onClick={() => { this.onClick(DocTypes.IMG); }}>
                            <FontAwesomeIcon className="fontawesome-icon filter" style={{ order: 3 }} icon={faImage} />
                        </div>
                        <div className="filter-description">{DocTypes.IMG}</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon filter " + (this.isRefSelected(this.vidRef) ? "selected " + (this.isRemoved(this.vidRef) ? "removed" : "add") : "not-selected")}
                            ref={this.vidRef}
                            data-selected={this.getInitialSelectedStatus(DocTypes.VID)}
                            data-removed={this.getInitialRemovedStatus(DocTypes.VID)}
                            onClick={() => { this.onClick(DocTypes.VID); }}>
                            <FontAwesomeIcon className="fontawesome-icon filter" style={{ order: 4 }} icon={faFilm} />
                        </div>
                        <div className="filter-description">{DocTypes.VID}</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon filter " + (this.isRefSelected(this.webRef) ? "selected " + (this.isRemoved(this.webRef) ? "removed" : "add") : "not-selected")}
                            ref={this.webRef}
                            data-selected={this.getInitialSelectedStatus(DocTypes.WEB)}
                            data-removed={this.getInitialRemovedStatus(DocTypes.WEB)}
                            onClick={() => { this.onClick(DocTypes.WEB); }}>
                            <FontAwesomeIcon className="fontawesome-icon filter" style={{ order: 5 }} icon={faGlobeAsia} />
                        </div>
                        <div className="filter-description">{DocTypes.WEB}</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon filter " + (this.isRefSelected(this.linkRef) ? "selected " + (this.isRemoved(this.linkRef) ? "removed" : "add") : "not-selected")}
                            ref={this.linkRef}
                            data-selected={this.getInitialSelectedStatus(DocTypes.LINK)}
                            data-removed={this.getInitialRemovedStatus(DocTypes.LINK)}
                            onClick={() => { this.onClick(DocTypes.LINK); }}>
                            <FontAwesomeIcon className="fontawesome-icon filter" style={{ order: 6 }} icon={faLink} />
                        </div>
                        <div className="filter-description">{DocTypes.LINK}</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon filter " + (this.isRefSelected(this.audioRef) ? "selected " + (this.isRemoved(this.audioRef) ? "removed" : "add") : "not-selected")}
                            ref={this.audioRef}
                            data-selected={this.getInitialSelectedStatus(DocTypes.AUDIO)}
                            data-removed={this.getInitialRemovedStatus(DocTypes.AUDIO)}
                            onClick={() => { this.onClick(DocTypes.AUDIO); }}>
                            <FontAwesomeIcon className="fontawesome-icon filter" style={{ order: 7 }} icon={faMusic} />
                        </div>
                        <div className="filter-description">{DocTypes.AUDIO}</div>
                    </div>
                    <div className="type-outer">
                        <div className={"type-icon filter " + (this.isRefSelected(this.textRef) ? "selected " + (this.isRemoved(this.textRef) ? "removed" : "add") : "not-selected")}
                            ref={this.textRef}
                            data-selected={this.getInitialSelectedStatus(DocTypes.TEXT)}
                            data-removed={this.getInitialRemovedStatus(DocTypes.TEXT)}
                            onClick={() => { this.onClick(DocTypes.TEXT); }}>
                            <FontAwesomeIcon className="fontawesome-icon filter" style={{ order: 8 }} icon={faStickyNote} />
                        </div>
                        <div className="filter-description">{DocTypes.TEXT}</div>
                    </div>
                </div>
            </div>
        );
    }
}
