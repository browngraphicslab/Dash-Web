import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../fields/Doc";
import { DateCast, StrCast } from "../../../fields/Types";
import { LinkManager } from "../../util/LinkManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import './LinkEditor.scss';
import "../nodes/PresBox.scss";
import React = require("react");


interface LinkEditorProps {
    sourceDoc: Doc;
    linkDoc: Doc;
    showLinks: () => void;
    hideback?: boolean;
}
@observer
export class LinkEditor extends React.Component<LinkEditorProps> {

    @observable description = StrCast(LinkManager.currentLink?.description);
    @observable relationship = StrCast(LinkManager.currentLink?.linkRelationship);
    @observable openDropdown: boolean = false;
    @observable showInfo: boolean = false;
    @observable openAdvanced: boolean = false;
    @computed get infoIcon() { if (this.showInfo) { return "chevron-up"; } return "chevron-down"; }
    @computed get advancedIcon() { if (this.openAdvanced) { return "chevron-up"; } return "chevron-down"; }
    @observable private buttonColor: string = "";
    @observable private relationshipButtonColor: string = "";
    @observable transitionSpeed = 0;
    @observable openView: boolean = false;

    //@observable description = this.props.linkDoc.description ? StrCast(this.props.linkDoc.description) : "DESCRIPTION";

    @undoBatch
    deleteLink = (): void => {
        LinkManager.Instance.deleteLink(this.props.linkDoc);
        this.props.showLinks();
    }

    @undoBatch
    setRelationshipValue = action((value: string) => {
        if (LinkManager.currentLink) {
            LinkManager.currentLink.linkRelationship = value;
            this.relationshipButtonColor = "rgb(62, 133, 55)";
            setTimeout(action(() => this.relationshipButtonColor = ""), 750);
            return true;
        }
    });

    @undoBatch
    setDescripValue = action((value: string) => {
        if (LinkManager.currentLink) {
            LinkManager.currentLink.description = value;
            this.buttonColor = "rgb(62, 133, 55)";
            setTimeout(action(() => this.buttonColor = ""), 750);
            return true;
        }
    });

    onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            this.setDescripValue(this.description);
            document.getElementById('input')?.blur();
        }
    }

    onRelationshipKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            this.setRelationshipValue(this.relationship);
            document.getElementById('input')?.blur();
        }
    }

    onDown = () => this.setDescripValue(this.description);
    onRelationshipDown = () => this.setRelationshipValue(this.description);

    @action
    handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { this.description = e.target.value; }
    @action
    handleRelationshipChange = (e: React.ChangeEvent<HTMLInputElement>) => { this.relationship = e.target.value; }

    @computed
    get editRelationship() {
        return <div className="linkEditor-description">
            <div className="linkEditor-description-label">Link Relationship:</div>
            <div className="linkEditor-description-input">
                <div className="linkEditor-description-editing">
                    <input
                        style={{ width: "100%" }}
                        id="input"
                        value={this.relationship}
                        placeholder={"enter link label"}
                        // color={"rgb(88, 88, 88)"}
                        onKeyDown={this.onRelationshipKey}
                        onChange={this.handleRelationshipChange}
                    ></input>
                </div>
                <div className="linkEditor-description-add-button"
                    style={{ background: this.relationshipButtonColor }}
                    onPointerDown={this.onRelationshipDown}>Set</div>
            </div>
        </div>;
    }

    @computed
    get editDescription() {
        return <div className="linkEditor-description">
            <div className="linkEditor-description-label">Link Description:</div>
            <div className="linkEditor-description-input">
                <div className="linkEditor-description-editing">
                    <input
                        style={{ width: "100%" }}
                        id="input"
                        value={this.description}
                        placeholder={"enter link label"}
                        // color={"rgb(88, 88, 88)"}
                        onKeyDown={this.onKey}
                        onChange={this.handleChange}
                    ></input>
                </div>
                <div className="linkEditor-description-add-button"
                    style={{ background: this.buttonColor }}
                    onPointerDown={this.onDown}>Set</div>
            </div>
        </div>;
    }

    @action
    changeDropdown = () => { this.openDropdown = !this.openDropdown; }

    @action
    changeViewDropdown = () => { this.openView = !this.openView; }

    @undoBatch
    changeFollowBehavior = action((follow: string) => {
        this.openDropdown = false;
        Doc.GetProto(this.props.linkDoc).followLinkLocation = follow;
    });

    @undoBatch
    changeFollowView = action((follow: string) => {
        this.openView = false;
        Doc.GetProto(this.props.linkDoc).followLinkView = follow;
    });

    @computed
    get followingDropdown() {
        return <div className="linkEditor-followingDropdown">
            <div className="linkEditor-followingDropdown-label">Movement to Destination:</div>
            <div className="linkEditor-followingDropdown-dropdown">
                <div className="linkEditor-followingDropdown-header"
                    onPointerDown={this.changeDropdown}>
                    {StrCast(this.props.linkDoc.followLinkLocation, "default")}
                    <FontAwesomeIcon className="linkEditor-followingDropdown-icon"
                        icon={this.openDropdown ? "chevron-up" : "chevron-down"}
                        size={"lg"} />
                </div>
                <div className="linkEditor-followingDropdown-optionsList"
                    style={{ display: this.openDropdown ? "" : "none" }}>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowBehavior("default")}>
                        Pan and Zoom
                        </div>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowBehavior("add:left")}>
                        Always open in new left pane
                        </div>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowBehavior("add:right")}>
                        Always open in new right pane
                        </div>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowBehavior("replace:right")}>
                        Always replace right tab
                        </div>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowBehavior("replace:left")}>
                        Always replace left tab
                        </div>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowBehavior("fullScreen")}>
                        Always open full screen
                        </div>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowBehavior("add")}>
                        Always open in a new tab
                        </div>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowBehavior("replace")}>
                        Replace Tab
                        </div>
                    {this.props.linkDoc.linksToAnnotation ?
                        <div className="linkEditor-followingDropdown-option"
                            onPointerDown={() => this.changeFollowBehavior("openExternal")}>
                            Always open in external page
                        </div>
                        : null}
                </div>
            </div>
        </div>;
    }

    @computed
    get destinationViewDropdown() {
        return <div className="linkEditor-followingDropdown">
            <div className="linkEditor-followingDropdown-label">Destination View:</div>
            <div className="linkEditor-followingDropdown-dropdown">
                <div className="linkEditor-followingDropdown-header"
                    onPointerDown={this.changeViewDropdown}>
                    {StrCast(this.props.linkDoc.followLinkLocation, "default")}
                    <FontAwesomeIcon className="linkEditor-followingDropdown-icon"
                        icon={this.openView ? "chevron-up" : "chevron-down"}
                        size={"lg"} />
                </div>
                <div className="linkEditor-followingDropdown-optionsList"
                    style={{ display: this.openView ? "" : "none" }}>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowView("default")}>
                        Default
                        </div>
                    <div className="linkEditor-followingDropdown-option"
                        onPointerDown={() => this.changeFollowView("zoom")}>
                        Focus on Document
                        </div>
                </div>
            </div>
        </div>;
    }

    // Converts seconds to ms and updates presTransition
    setTransitionTime = (number: String, change?: number) => {
        let timeInMS = Number(number) * 1000;
        if (change) timeInMS += change;
        if (timeInMS < 100) timeInMS = 100;
        if (timeInMS > 10000) timeInMS = 10000;
        // Array.from(this._selectedArray.keys()).forEach((doc) => doc.presTransition = timeInMS);
    }

    @computed
    get transitionSpeedSlider() {
        return <div className="ribbon-doubleButton" style={{ display: "inline-flex" }}>
            Movement Speed
                        <input type="range" step="0.1" min="0.1" max="10" value={this.transitionSpeed}
                className={`toolbar-slider`}
                id="toolbar-slider"
                // onPointerDown={() => this._batch = UndoManager.StartBatch("presTransition")}
                // onPointerUp={() => this._batch?.end()}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    e.stopPropagation();
                    this.setTransitionTime(e.target.value);
                }} />
            <div className={`slider-headers`}>
                <div className="slider-text">Fast</div>
                <div className="slider-text">Medium</div>
                <div className="slider-text">Slow</div>
            </div>
        </div>;
    }

    @computed
    get advancedSettings() {
        return <div className="linkEditor-advancedSettings">
            <div className="linkEditor-advancedSettings-header">
                <div>Advanced Settings</div>
                <Tooltip title={<><div className="dash-tooltip">Show advanced settings</div></>} placement="top">
                    <div className="linkEditor-advancedSettings-downArrow"><FontAwesomeIcon className="button" icon={this.advancedIcon} size="lg" onPointerDown={this.changeAdvancedOpen} /></div>
                </Tooltip>
            </div>
            {this.openAdvanced ? <div>
                {this.destinationViewDropdown}
                {this.transitionSpeedSlider}
            </div> : null}
        </div>;
    }

    @action
    changeInfo = () => { this.showInfo = !this.showInfo; }

    @action
    changeAdvancedOpen = () => { this.openAdvanced = !this.openAdvanced; }

    render() {
        const destination = LinkManager.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);


        return !destination ? (null) : (
            <div className="linkEditor">
                <div className="linkEditor-info">
                    <Tooltip title={<><div className="dash-tooltip">Return to link menu</div></>} placement="top">
                        <button className="linkEditor-button-back"
                            style={{ display: this.props.hideback ? "none" : "" }}
                            onClick={this.props.showLinks}>
                            <FontAwesomeIcon icon="arrow-left" size="sm" /> </button>
                    </Tooltip>
                    <p className="linkEditor-linkedTo">Editing Link to: <b>{
                        destination.proto?.title ?? destination.title ?? "untitled"}</b></p>
                    <Tooltip title={<><div className="dash-tooltip">Show more link information</div></>} placement="top">
                        <div className="linkEditor-downArrow"><FontAwesomeIcon className="button" icon={this.infoIcon} size="lg" onPointerDown={this.changeInfo} /></div>
                    </Tooltip>
                </div>
                {this.showInfo ? <div className="linkEditor-moreInfo">
                    <div>{this.props.linkDoc.author ? <div> <b>Author:</b> {this.props.linkDoc.author}</div> : null}</div>
                    <div>{this.props.linkDoc.creationDate ? <div> <b>Creation Date:</b>
                        {DateCast(this.props.linkDoc.creationDate).toString()}</div> : null}</div>
                </div> : null}

                {this.editDescription}
                {this.editRelationship}
                {this.followingDropdown}
                {/* {this.advancedSettings} */}
            </div>

        );
    }
}