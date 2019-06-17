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
import { array } from 'prop-types';
import { IconButton } from './IconButton';
import { list } from 'serializr';

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
    updateSelected(list: any[]): void;
}



@observer
export class IconBar extends React.Component<IconBarProps> {

    static Instance: IconBar;

    @observable originalSelected: string[] = [];
    // @observable originalSelectedNodes: string[] = this.props.getSelectedTypes();
    // @observable originalRemovedNodes: string[] = this.props.getSelectedTypes();

    @observable removeType: boolean = false;
    // @observable added: any[];
    // @observable removed: any[];
    // @observable selected: any[];

    allIcons: string[] = [DocTypes.AUDIO, DocTypes.COL, DocTypes.HIST, DocTypes.IMG, DocTypes.LINK, DocTypes.PDF, DocTypes.TEXT, DocTypes.VID, DocTypes.WEB];
    allDivs: any = [];
    @observable list: string[];

    constructor(props: IconBarProps) {
        super(props);
        IconBar.Instance = this;
        console.log("constructing")
        this.list = [DocTypes.AUDIO, DocTypes.COL, DocTypes.HIST, DocTypes.IMG, DocTypes.LINK, DocTypes.PDF, DocTypes.TEXT, DocTypes.VID, DocTypes.WEB];
        console.log(this.list)
        // this.added = [];
        // this.removed = [];
        // this.selected = [];
        // this.originalSelected = this.props.getIcons();
        // console.log("ICONS")
        // console.log(this.props.getIcons())
        // console.log(this.originalSelected)
    }

    // @action
    // downKeyHandler = (e: KeyboardEvent) => {
    //     if (e.key !== "Control") return;
    //     this.removeType = true;
    //     e.preventDefault();
    //     e.stopPropagation();
    //     document.body.style.cursor = "not-allowed";
    // }

    // @action
    // upKeyHandler = (e: KeyboardEvent) => {
    //     e.preventDefault();
    //     e.stopPropagation();
    //     this.removeType = false;
    //     document.body.style.cursor = "default";

    // }

    // componentWillMount() {
    //     document.removeEventListener("keydown", this.downKeyHandler);
    //     document.addEventListener("keydown", this.downKeyHandler);
    //     document.removeEventListener("keyup", this.upKeyHandler);
    //     document.addEventListener("keyup", this.upKeyHandler);
    // }

    // componentWillUnMount() {
    //     document.removeEventListener("keyup", this.upKeyHandler);
    //     document.removeEventListener("keydown", this.downKeyHandler);
    // }


    // componentDidMount = () => {
    //     //i KNOW this is bad i just can't get this to re render eeeeeeeek
    //     this.forceUpdate();
    // }

    // @action.bound
    // resetIconFilters = () => {
    //     this.unselectAllRefs();
    //     // lmao sorry
    //     this.forceUpdate();
    // }


    // @action.bound
    // unselectAllRefs() {
    //     this.resetDataRemoved();
    //     this.resetDataSelected();
    //     this.removed = [];
    //     this.added = [];
    // }

    // @action.bound
    // resetDataSelected() {
    //     this.allRefs.forEach(element => {
    //         if (element.current) {
    //             element.current.setAttribute("data-selected", "false");
    //         }
    //     });
    // }

    // @action.bound
    // resetDataRemoved() {
    //     this.allRefs.forEach(element => {
    //         if (element.current) {
    //             element.current.setAttribute("data-removed", "false");
    //         }
    //     });
    // }

    // @action.bound
    // alternateSelectedRef(ref: HTMLDivElement | React.RefObject<HTMLDivElement>) {
    //     let newRef: HTMLDivElement | null;
    //     if (!(ref instanceof HTMLDivElement)) { newRef = ref.current; }
    //     else { newRef = ref; }
    //     if (newRef) {
    //         if (newRef.getAttribute("data-selected") === "true") {
    //             newRef.setAttribute("data-selected", "false");
    //         }
    //         else {
    //             newRef.setAttribute("data-selected", "true");
    //         }
    //     }
    // }

    // @action.bound
    // setToRemove(ref: HTMLDivElement | React.RefObject<HTMLDivElement>) {
    //     let newRef: HTMLDivElement | null;
    //     if (!(ref instanceof HTMLDivElement)) { newRef = ref.current; }
    //     else { newRef = ref; }
    //     if (newRef) newRef.setAttribute("data-removed", "true");
    // }

    // @action.bound
    // setToAdd(ref: HTMLDivElement | React.RefObject<HTMLDivElement>) {
    //     let newRef: HTMLDivElement | null;
    //     if (!(ref instanceof HTMLDivElement)) { newRef = ref.current; }
    //     else { newRef = ref; }
    //     if (newRef) newRef.setAttribute("data-removed", "false");
    // }

    @action.bound
    onClick = (value: string) => {
console.log("hello!")
    }

    // //TODO: this needs help
    // @action.bound
    // onClick = (value: string) => {
    //     let icons: string[] = this.props.getIcons();
    //     let ref: any = this.getRef(value);
    //     // if(ref) this.alternateSelectedRef(ref);

    //     if (value === DocTypes.NONE) {
    //         icons = this.props.allIcons;
    //         // if its none, change the color of all the other circles
    //         this.resetIconFilters();
    //     }

    //     //if type should be removed
    //     if (this.removeType) {
    //         if (this.added.length !== 0) {
    //             icons = this.props.allIcons;
    //             this.resetIconFilters();
    //             this.added = [];
    //             icons = _.without(icons, value);
    //             this.removed.push(ref);
    //             this.setToRemove(ref)
    //             ref.setAttribute("data-selected", "true")
    //         }
    //         else {
    //             //if it's included in the list, remove it
    //             if (icons.includes(value)) {
    //                 icons = _.without(icons, value);
    //                 this.removed.push(ref);
    //                 this.setToRemove(ref);
    //                 ref.setAttribute("data-selected", "true")
    //             }
    //             //if it's not included, add it back
    //             else {
    //                 icons.push(value);
    //                 //take it out of removed list
    //                 this.removed = _.without(this.removed, this.getRef(value));
    //                 ref.setAttribute("data-selected", "false")
    //             }
    //         }
    //         this.selected = this.removed;
    //     }
    //     //if type should be added
    //     else {
    //         if (this.removed.length !== 0) {
    //             icons = this.props.allIcons;
    //             this.resetIconFilters();
    //             this.removed = [];
    //             icons = [value];
    //             this.added.push(ref);
    //             this.setToAdd(ref)
    //             ref.setAttribute("data-selected", "true")
    //         }
    //         else {
    //             //if its included in the list, remove it
    //             if (icons.includes(value)) {
    //                 icons = _.without(icons, value);
    //                 this.added = _.without(this.added, this.getRef(value))
    //                 ref.setAttribute("data-selected", "false")
    //             }
    //             //if its not included in the list, add it
    //             else {
    //                 icons.push(value);
    //                 this.added.push(ref)
    //                 this.setToAdd(ref)
    //                 ref.setAttribute("data-selected", "true")
    //             }
    //         }
    //         this.selected = this.added;
    //     }

    //     this.props.updateIcon(icons);
    //     this.props.updateSelected(this.selected);
    //     //ok i know that this is bad but i dont know how else to get it to rerender and change the classname,
    //     //any help here is greatly appreciated thanks frens
    //     this.forceUpdate();
    // }

    //checks if option is selected based on the attribute data-selected
    // //this is for visual purposes
    // @action.bound
    // isRefSelected = (ref: HTMLDivElement | React.RefObject<HTMLDivElement>) => {
    //     let newRef: HTMLDivElement | null;
    //     if (!(ref instanceof HTMLDivElement)) { newRef = ref.current; }
    //     else { newRef = ref; }
    //     if (newRef) {
    //         if (newRef.getAttribute("data-selected") === "true") {
    //             return true;
    //         }
    //         return false;
    //     }
    // }

    //checks attribues of ref to return whether or not a type should be specifically included in the search
    // @action.bound
    // getInitialSelectedStatus = (type: string) => {
    //     console.log(this.originalSelected)
    //     if (this.originalSelected.includes(type)) {
    //         return "true";
    //     }
    //     return "false";
    // }

    //checks attributes of ref to return whether or not it should be excluded from search results
    // //this is for visual purposes
    // @action.bound
    // isRemoved = (ref: HTMLDivElement | React.RefObject<HTMLDivElement>) => {
    //     let newRef: HTMLDivElement | null;
    //     if (!(ref instanceof HTMLDivElement)) { newRef = ref.current; }
    //     else { newRef = ref; }
    //     if (newRef) {
    //         if (newRef.getAttribute("data-removed") === "true") {
    //             return true;
    //         }
    //         return false;
    //     }
    // }

    //gets status upon mounting if a doc type should be removed from the results
    // @action.bound
    // getInitialRemovedStatus = (type: string) => {
    //     if (!this.originalSelected.includes(type)) {
    //         return "true";
    //     }
    //     return "false";


    // }

    // @action.bound
    getList = (): string[] => {
        // console.log(this.list)
        return this.list;
    }

    @action.bound
    updateList(newList: string[]) {
        this.list = newList;
    }

    @action.bound
    resetSelf() {
        console.log("resetting eventually")
        const children = this.props.children;
        console.log(children)
        React.Children.map(children, child => {
            console.log(child)
        })
        // IconButton.Instance.reset();
        // let filterName: string;
        // let el: HTMLElement | null;
        // this.allIcons.forEach(typeName => {
        //     filterName = typeName + "-filter";
        //     el = document.getElementById(filterName);
            
        // });
    }

    render() {
        let element;
        return (
            <div>
                <div className="filter icon-title">Filter by type of node</div>
                <div className="filter icon-bar">
                <div className="filter type-outer">
                        <div className={"type-icon none not-selected"}
                            onClick={this.resetSelf}>
                            <FontAwesomeIcon className="fontawesome-icon" style={{ order: -2 }} icon={faBan} />
                        </div>
                        <div className="filter-description">Clear</div>
                    </div>
                    {this.allIcons.map((type: string) =>
                        <IconButton type={type} onClick={this.onClick} getList={this.getList} updateList = {this.updateList} resetSelf = {this.resetSelf}/>
                    )}
                </div>
            </div>
        );
    }
}
