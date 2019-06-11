import { observer } from "mobx-react";
import React = require("react");
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { NumCast, BoolCast, StrCast, Cast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import { observable, action, computed } from "mobx";
import "./PresentationView.scss";
import { Utils } from "../../../Utils";
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile as fileSolid, faLocationArrow, faArrowUp, faSearch } from '@fortawesome/free-solid-svg-icons';
import { faFile as fileRegular } from '@fortawesome/free-regular-svg-icons';
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";




library.add(faArrowUp);
library.add(fileSolid);
library.add(fileRegular);
library.add(faLocationArrow);
library.add(faSearch);

interface PresentationElementProps {
    mainDocument: Doc;
    document: Doc;
    index: number;
    deleteDocument(index: number): void;
    gotoDocument(index: number): void;
    allListElements: Doc[];
    groupMappings: Map<String, Doc[]>;
    presStatus: boolean;
    presButtonBackUp: Doc;
    presGroupBackUp: Doc;


}

//enum for the all kinds of buttons a doc in presentation can have
export enum buttonIndex {
    Show = 0,
    Navigate = 1,
    HideTillPressed = 2,
    FadeAfter = 3,
    HideAfter = 4,
    Group = 5,

}

/**
 * This class models the view a document added to presentation will have in the presentation.
 * It involves some functionality for its buttons and options.
 */
@observer
export default class PresentationElement extends React.Component<PresentationElementProps> {

    @observable selectedButtons: boolean[] = new Array(6);

    /**
     * Getter to get the status of the buttons.
     */
    @computed
    get selected() {
        return this.selectedButtons;
    }
    @action
    componentDidMount() {
        // let castedList = Cast(this.props.presButtonBackUp.selectedButtons, listSpec(Doc), null) as any as List<List<boolean>>;
        let castedList = DocListCast(this.props.presButtonBackUp.selectedButtonDocs);
        if (castedList.length !== 0) {
            // this.selectedButtons = castedList;
            let selectedButtonOfDoc = Cast(castedList[this.props.index].selectedButtons, listSpec("boolean"), null);
            if (selectedButtonOfDoc !== undefined) {
                this.selectedButtons = selectedButtonOfDoc;
            }
            console.log("Entered!!");

        }
        console.log("Mounted!!");
        //this.props.presButtonBackUp.elIndex = this.props.index;
    }

    /**
     * The function that is called to group docs together. It tries to group a doc
     * that turned grouping option with the above document. If that doc is grouped with
     * other documents. Those other documents will be grouped with doc's above document as well.
     */
    @action
    onGroupClick = (document: Doc, index: number, buttonStatus: boolean) => {
        let p = this.props;
        if (index >= 1) {
            //checking if options was turned true
            if (buttonStatus) {
                //getting the id of the above-doc and the doc
                let aboveGuid = StrCast(p.allListElements[index - 1].presentId, null);
                let docGuid = StrCast(document.presentId, null);
                //the case where above-doc is already in group
                if (p.groupMappings.has(aboveGuid)) {
                    let aboveArray = p.groupMappings.get(aboveGuid)!;
                    //case where doc is already in group
                    if (p.groupMappings.has(docGuid)) {
                        let docsArray = p.groupMappings.get(docGuid)!;
                        docsArray.forEach((doc: Doc) => {
                            if (!aboveArray.includes(doc)) {
                                aboveArray.push(doc);
                            }
                            doc.presentId = aboveGuid;
                        });
                        p.groupMappings.delete(docGuid);
                        //the case where doc was not in group
                    } else {
                        if (!aboveArray.includes(document)) {
                            aboveArray.push(document);

                        }

                    }
                    //the case where above-doc was not in group
                } else {
                    let newAboveArray: Doc[] = [];
                    newAboveArray.push(p.allListElements[index - 1]);

                    //the case where doc is in group
                    if (p.groupMappings.has(docGuid)) {
                        let docsArray = p.groupMappings.get(docGuid)!;
                        docsArray.forEach((doc: Doc) => {
                            newAboveArray.push(doc);
                            doc.presentId = aboveGuid;
                        });
                        p.groupMappings.delete(docGuid);

                        //the case where doc is not in a group
                    } else {
                        newAboveArray.push(document);

                    }
                    p.groupMappings.set(aboveGuid, newAboveArray);

                }
                document.presentId = aboveGuid;

                //when grouping is turned off
            } else {
                let curArray = p.groupMappings.get(StrCast(document.presentId, Utils.GenerateGuid()))!;
                let targetIndex = curArray.indexOf(document);
                let firstPart = curArray.slice(0, targetIndex);
                let firstPartNewGuid = Utils.GenerateGuid();
                firstPart.forEach((doc: Doc) => doc.presentId = firstPartNewGuid);
                let secondPart = curArray.slice(targetIndex);
                p.groupMappings.set(StrCast(p.allListElements[index - 1].presentId, Utils.GenerateGuid()), firstPart);
                p.groupMappings.set(StrCast(document.presentId, Utils.GenerateGuid()), secondPart);


            }

        }

    }

    /**
     * Function that is called on click to change the group status of a docus, by turning the option on/off.
     */
    @action
    changeGroupStatus = () => {
        if (this.selectedButtons[buttonIndex.Group]) {
            this.selectedButtons[buttonIndex.Group] = false;
        } else {
            this.selectedButtons[buttonIndex.Group] = true;
        }
    }

    /**
     * The function that is called on click to turn Hiding document till press option on/off.
     * It also sets the beginning and end opacitys.
     */
    @action
    onHideDocumentUntilPressClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const current = NumCast(this.props.mainDocument.selectedDoc);
        if (this.selectedButtons[buttonIndex.HideTillPressed]) {
            this.selectedButtons[buttonIndex.HideTillPressed] = false;
            if (this.props.index >= current) {
                this.props.document.opacity = 1;
            }
        } else {
            this.selectedButtons[buttonIndex.HideTillPressed] = true;
            if (this.props.presStatus) {
                if (this.props.index > current) {
                    this.props.document.opacity = 0;
                }
            }
        }
        this.autoSaveButtonChange(buttonIndex.HideTillPressed);
    }

    @action
    autoSaveButtonChange = (index: buttonIndex) => {
        // let castedList = Cast(this.props.presButtonBackUp.selectedButtons, listSpec(Doc), null) as any as List<List<boolean>>;
        let castedList = DocListCast(this.props.presButtonBackUp.selectedButtonDocs);
        castedList[this.props.index].selectedButtons = new List(this.selectedButtons);

        //this.props.mainDocument.presButtonBackUp = this.props.presButtonBackUp;
    }

    /**
     * The function that is called on click to turn Hiding document after presented option on/off.
     * It also makes sure that the option swithches from fade-after to this one, since both
     * can't coexist.
     */
    @action
    onHideDocumentAfterPresentedClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const current = NumCast(this.props.mainDocument.selectedDoc);
        if (this.selectedButtons[buttonIndex.HideAfter]) {
            this.selectedButtons[buttonIndex.HideAfter] = false;
            if (this.props.index <= current) {
                this.props.document.opacity = 1;
            }
        } else {
            if (this.selectedButtons[buttonIndex.FadeAfter]) {
                this.selectedButtons[buttonIndex.FadeAfter] = false;
            }
            this.selectedButtons[buttonIndex.HideAfter] = true;
            if (this.props.presStatus) {
                if (this.props.index < current) {
                    this.props.document.opacity = 0;
                }
            }
        }
        this.autoSaveButtonChange(buttonIndex.HideAfter);

    }

    /**
     * The function that is called on click to turn fading document after presented option on/off.
     * It also makes sure that the option swithches from hide-after to this one, since both
     * can't coexist.
     */
    @action
    onFadeDocumentAfterPresentedClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const current = NumCast(this.props.mainDocument.selectedDoc);
        if (this.selectedButtons[buttonIndex.FadeAfter]) {
            this.selectedButtons[buttonIndex.FadeAfter] = false;
            if (this.props.index <= current) {
                this.props.document.opacity = 1;
            }
        } else {
            if (this.selectedButtons[buttonIndex.HideAfter]) {
                this.selectedButtons[buttonIndex.HideAfter] = false;
            }
            this.selectedButtons[buttonIndex.FadeAfter] = true;
            if (this.props.presStatus) {
                if (this.props.index < current) {
                    this.props.document.opacity = 0.5;
                }
            }
        }
        this.autoSaveButtonChange(buttonIndex.FadeAfter);

    }

    /**
     * The function that is called on click to turn navigation option of docs on/off.
     */
    @action
    onNavigateDocumentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (this.selectedButtons[buttonIndex.Navigate]) {
            this.selectedButtons[buttonIndex.Navigate] = false;

        } else {
            this.selectedButtons[buttonIndex.Navigate] = true;
        }

        this.autoSaveButtonChange(buttonIndex.Navigate);

    }


    render() {
        let p = this.props;
        let title = p.document.title;

        //to get currently selected presentation doc
        let selected = NumCast(p.mainDocument.selectedDoc, 0);

        let className = "presentationView-item";
        if (selected === p.index) {
            //this doc is selected
            className += " presentationView-selected";
        }
        let onEnter = (e: React.PointerEvent) => { p.document.libraryBrush = true; };
        let onLeave = (e: React.PointerEvent) => { p.document.libraryBrush = false; };
        return (
            <div className={className} key={p.document[Id] + p.index}
                onPointerEnter={onEnter} onPointerLeave={onLeave}
                style={{
                    outlineColor: "maroon",
                    outlineStyle: "dashed",
                    outlineWidth: BoolCast(p.document.libraryBrush, false) || BoolCast(p.document.protoBrush, false) ? `1px` : "0px",
                }}
                onClick={e => { p.gotoDocument(p.index); e.stopPropagation(); }}>
                <strong className="presentationView-name">
                    {`${p.index + 1}. ${title}`}
                </strong>
                <button className="presentation-icon" onClick={e => { this.props.deleteDocument(p.index); e.stopPropagation(); }}>X</button>
                <br></br>
                <button title="Zoom" className={this.selectedButtons[buttonIndex.Show] ? "presentation-interaction-selected" : "presentation-interaction"}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={this.selectedButtons[buttonIndex.Navigate] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Document Till Presented" className={this.selectedButtons[buttonIndex.HideTillPressed] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade Document After Presented" className={this.selectedButtons[buttonIndex.FadeAfter] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={fileRegular} color={"gray"} /></button>
                <button title="Hide Document After Presented" className={this.selectedButtons[buttonIndex.HideAfter] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={fileRegular} /></button>
                <button title="Group With Up" className={this.selectedButtons[buttonIndex.Group] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={(e) => {
                    e.stopPropagation();
                    this.changeGroupStatus();
                    this.onGroupClick(p.document, p.index, this.selectedButtons[buttonIndex.Group]);
                }}> <FontAwesomeIcon icon={"arrow-up"} /> </button>

            </div>
        );
    }
}