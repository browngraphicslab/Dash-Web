import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction, IReactionDisposer, reaction } from 'mobx';
import "./SearchBox.scss";
import "./IconBar.scss";
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan, faVideo, faCaretDown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library, icon } from '@fortawesome/fontawesome-svg-core';
import { DocTypes } from '../../documents/Documents';
import '../globalCssVariables.scss';
import * as _ from "lodash";
import { IconBar } from './IconBar';
import { props } from 'bluebird';

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

interface IconButtonProps {
    type: string;
    getList(): string[];
    updateList(list: string[]): void;
    updateSelectedList(type: string): void;
    active: boolean;
    getActiveType(): string;
    changeActiveType(value: string): void;
}

@observer
export class IconButton extends React.Component<IconButtonProps>{

    @observable isSelected: boolean = this.props.active;
    @observable removeType = false;
    @observable hover = false;
    @observable isRemoved: boolean = (this.props.getActiveType() === "remove");
    @observable isAdded: boolean = (this.props.getActiveType() === "add");

    private _reactionDisposer?: IReactionDisposer;

    static Instance: IconButton;
    constructor(props: IconButtonProps) {
        super(props);
        IconButton.Instance = this;
    }

    componentDidMount = () => {
        this._reactionDisposer = reaction(
            () => IconBar.Instance.ResetClicked,
            () => {
                if (IconBar.Instance.ResetClicked) {
                    console.log("running")
                    this.reset()
                    IconBar.Instance.Reset++;
                    if (IconBar.Instance.Reset === 9) {
                        IconBar.Instance.Reset = 0;
                        IconBar.Instance.ResetClicked = false;
                    }
                }
            },
            {fireImmediately: true}
        )
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

    @action.bound
    getIcon() {
        switch (this.props.type) {
            case (DocTypes.NONE):
                return faBan;
            case (DocTypes.AUDIO):
                return faMusic;
            case (DocTypes.COL):
                return faObjectGroup;
            case (DocTypes.HIST):
                return faChartBar;
            case (DocTypes.IMG):
                return faImage;
            case (DocTypes.LINK):
                return faLink;
            case (DocTypes.PDF):
                return faFilePdf;
            case (DocTypes.TEXT):
                return faStickyNote;
            case (DocTypes.VID):
                return faVideo;
            case (DocTypes.WEB):
                return faGlobeAsia;
            default:
                return faCaretDown;
        }
    }

    public getType(): string {
        return this.props.type;
    }

    public getIsSelected(): boolean {
        return this.isSelected;
    }

    public getIsRemoved() {
        return this.isRemoved;
    }

    public getIsAdded() {
        return this.isAdded;
    }

    @action
    onClick = () => {
        let newList: string[] = this.props.getList();

        if(this.removeType && this.props.getActiveType() !== "remove"){
            this.props.changeActiveType("remove")
            // console.log("resetting")
        }
        else if(!this.removeType && this.props.getActiveType() !== "add"){
            this.props.changeActiveType("add");
            // console.log("resetting")
        }

        //if it's not already selected
        if (!this.isSelected) {
            this.isSelected = true;
            console.log("changing")

            //if actions pertain to removal
            if (this.removeType) {
                this.isAdded = false;
                if (!this.isRemoved) {
                    _.pull(newList, this.props.type);
                    this.isRemoved = true;
                }
                else {
                    newList.push(this.props.type);
                    this.isRemoved = false;
                }
            }
            // if actions pertain to adding
            else {
                this.isRemoved = false;
                if (!this.isAdded) {
                    if (newList.length === 9) {
                        newList = [];
                        newList.push(this.props.type)
                    } else {
                        newList.push(this.props.type);
                    }
                    this.isAdded = true;
                }
                else {
                    _.pull(newList, this.props.type);
                    this.isAdded = false;
                }
            }
        }
        //if it is selected already
        else {
            this.isSelected = false;
            if (this.isAdded) {
                this.isAdded = false;
                _.pull(newList, this.props.type);
            }
            if (this.isRemoved) {
                this.isRemoved = false;
                newList.push(this.props.type)
            }
            this.props.changeActiveType("none")
        }
        this.props.updateList(newList)
        console.log(this);
        console.log(this.isAdded, this.isSelected)
    }

    selectedAdded = {
        opacity: 1,
        backgroundColor: "#c2c2c5" //$alt-accent
    }

    selectedRemoved = {
        opacity: 0.2,
    }

    notSelected = {
        opacity: 0.6,
    }

    hoverStyle = {
        opacity: 1,
        backgroundColor: "#c2c2c5" //$alt-accent
    }

    hoverRemoveStyle = {
        opacity: 0.2,
        backgroundColor: "transparent",
    }

    banStyle = {
        opacity: 1,
    }

    @action.bound
    public reset() {
        this.isSelected = false;
        this.isAdded = false;
        this.isRemoved = false;
    }

    @action
    onMouseLeave = () => {
        this.hover = false;
    }

    @action
    onMouseEnter = () => {
        this.hover = true;
    }

    getFA = () => {
        switch (this.props.type) {
            case (DocTypes.NONE):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faBan} />);
            case (DocTypes.AUDIO):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faMusic} />)
            case (DocTypes.COL):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faObjectGroup} />)
            case (DocTypes.HIST):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faChartBar} />)
            case (DocTypes.IMG):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faImage} />)
            case (DocTypes.LINK):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faLink} />)
            case (DocTypes.PDF):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faFilePdf} />)
            case (DocTypes.TEXT):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faStickyNote} />)
            case (DocTypes.VID):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faVideo} />)
            case (DocTypes.WEB):
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faGlobeAsia} />)
            default:
                return (<FontAwesomeIcon className="fontawesome-icon" icon={faCaretDown} />)
        }
    }

    render() {
        return (
            <div className="type-outer" id={this.props.type + "-filter"}
                onMouseEnter={this.onMouseEnter}
                onMouseLeave={this.onMouseLeave}
                onClick={this.onClick}>
                <div className="type-icon" id={this.props.type + "-icon"}
                    style={this.hover ? this.removeType ? this.hoverRemoveStyle : this.hoverStyle :
                        !this.isSelected ? this.notSelected :
                            this.isAdded ? this.selectedAdded :
                                this.isRemoved ? this.selectedRemoved : this.notSelected}
                >
                    {this.getFA()}
                </div>
                <div className="ban-icon"
                    style={this.hover ? (this.removeType ? this.banStyle : { opacity: 0 }) : (this.isSelected ? this.isRemoved ? this.banStyle : { opacity: 0 } : { opacity: 0 })}>
                    <FontAwesomeIcon className="fontawesome-icon" icon={faBan} /></div>
                <div className="filter-description">{this.props.type}</div>
            </div>
        );
    }
}