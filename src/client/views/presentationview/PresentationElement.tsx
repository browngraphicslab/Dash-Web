import { observer } from "mobx-react";
import React = require("react");
import { Doc } from "../../../new_fields/Doc";
import { NumCast, BoolCast, StrCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import { observable, action, computed } from "mobx";
import "./PresentationView.scss";
import { Utils } from "../../../Utils";



interface PresentationElementProps {
    mainDocument: Doc;
    document: Doc;
    index: number;
    deleteDocument(index: number): void;
    gotoDocument(index: number): void;
    allListElements: Doc[];
    groupMappings: Map<String, Doc[]>;

}

export enum buttonIndex {
    Show = 0,
    Navigate = 1,
    HideTillPressed = 2,
    FadeAfter = 3,
    HideAfter = 4,
    Group = 5,

}

@observer
export default class PresentationElement extends React.Component<PresentationElementProps> {

    @observable selectedButtons: boolean[] = new Array(6);

    @computed
    get selected() {
        return this.selectedButtons;
    }

    @action
    onGroupClick = (document: Doc, index: number, buttonStatus: boolean) => {
        let p = this.props;
        if (index >= 1) {
            if (buttonStatus) {
                let newGuid = Utils.GenerateGuid();
                let aboveGuid = StrCast(p.allListElements[index - 1].presentId, null);
                let docGuid = StrCast(document.presentId, null);
                if (p.groupMappings.has(aboveGuid)) {
                    let aboveArray = p.groupMappings.get(aboveGuid)!;
                    if (p.groupMappings.has(docGuid)) {
                        let docsArray = p.groupMappings.get(docGuid)!;
                        docsArray.forEach((doc: Doc) => {
                            if (!aboveArray.includes(doc)) {
                                aboveArray.push(doc);
                            }
                            doc.presentId = aboveGuid;
                        });
                        console.log("CAlled first one");
                        p.groupMappings.delete(docGuid);
                    } else {
                        if (!aboveArray.includes(document)) {
                            aboveArray.push(document);
                            console.log("CAlled this one");
                            console.log("Doc: ", document);

                        }

                    }
                    console.log("AboveArray Size: ", aboveArray.length);
                } else {
                    let newAboveArray: Doc[] = [];
                    newAboveArray.push(p.allListElements[index - 1]);
                    if (p.groupMappings.has(docGuid)) {
                        let docsArray = p.groupMappings.get(docGuid)!;
                        docsArray.forEach((doc: Doc) => {
                            newAboveArray.push(doc);
                            doc.presentId = aboveGuid;
                        });
                        p.groupMappings.delete(docGuid);
                    } else {
                        newAboveArray.push(document);

                    }
                    p.groupMappings.set(aboveGuid, newAboveArray);
                    console.log("NewABove array size: ", newAboveArray.length);



                }
                document.presentId = aboveGuid;
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

    @action
    changeGroupStatus = () => {
        if (this.selectedButtons[buttonIndex.Group]) {
            this.selectedButtons[buttonIndex.Group] = false;
        } else {
            this.selectedButtons[buttonIndex.Group] = true;
        }
    }

    @action
    onHideDocumentUntilPressClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const current = NumCast(this.props.mainDocument.selectedDoc);
        if (this.selectedButtons[buttonIndex.HideTillPressed]) {
            this.selectedButtons[buttonIndex.HideTillPressed] = false;
            this.props.document.opacity = 1;
        } else {
            this.selectedButtons[buttonIndex.HideTillPressed] = true;
            if (this.props.index > current) {
                this.props.document.opacity = 0;
            }
        }
    }

    @action
    onHideDocumentAfterPresentedClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (this.selectedButtons[buttonIndex.HideAfter]) {
            this.selectedButtons[buttonIndex.HideAfter] = false;
        } else {
            if (this.selectedButtons[buttonIndex.FadeAfter]) {
                this.selectedButtons[buttonIndex.FadeAfter] = false;
            }
            this.selectedButtons[buttonIndex.HideAfter] = true;
        }
    }

    @action
    onFadeDocumentAfterPresentedClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (this.selectedButtons[buttonIndex.FadeAfter]) {
            this.selectedButtons[buttonIndex.FadeAfter] = false;
        } else {
            if (this.selectedButtons[buttonIndex.HideAfter]) {
                this.selectedButtons[buttonIndex.HideAfter] = false;
            }
            this.selectedButtons[buttonIndex.FadeAfter] = true;
        }
    }

    @action
    onNavigateDocumentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (this.selectedButtons[buttonIndex.Navigate]) {
            this.selectedButtons[buttonIndex.Navigate] = false;

        } else {
            this.selectedButtons[buttonIndex.Navigate] = true;
        }
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
                <button className={this.selectedButtons[buttonIndex.Show] ? "presentation-interaction-selected" : "presentation-interaction"}>A</button>
                <button className={this.selectedButtons[buttonIndex.Navigate] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onNavigateDocumentClick}>B</button>
                <button className={this.selectedButtons[buttonIndex.HideTillPressed] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onHideDocumentUntilPressClick}>C</button>
                <button className={this.selectedButtons[buttonIndex.FadeAfter] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onFadeDocumentAfterPresentedClick}>D</button>
                <button className={this.selectedButtons[buttonIndex.HideAfter] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onHideDocumentAfterPresentedClick}>E</button>
                <button className={this.selectedButtons[buttonIndex.Group] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={(e) => {
                    e.stopPropagation();
                    this.changeGroupStatus();
                    this.onGroupClick(p.document, p.index, this.selectedButtons[buttonIndex.Group]);
                }}>F</button>

            </div>
        );
    }
}