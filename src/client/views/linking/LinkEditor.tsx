import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../fields/Doc";
import { DateCast, StrCast } from "../../../fields/Types";
import { LinkManager } from "../../util/LinkManager";
import { undoBatch } from "../../util/UndoManager";
import './LinkEditor.scss';
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
    @computed get infoIcon() { if (this.showInfo) { return "chevron-up"; } return "chevron-down"; }
    @observable private buttonColor: string = "";
    @observable private relationshipButtonColor: string = "";

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

    @undoBatch
    changeFollowBehavior = action((follow: string) => {
        this.openDropdown = false;
        Doc.GetProto(this.props.linkDoc).followLinkLocation = follow;
    });

    @computed
    get followingDropdown() {
        return <div className="linkEditor-followingDropdown">
            <div className="linkEditor-followingDropdown-label">Follow Behavior:</div>
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
                        Default
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

    @action
    changeInfo = () => { this.showInfo = !this.showInfo; }

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
            </div>

        );
    }
}