import { observer } from "mobx-react";
import React = require("react");
import { Doc } from "../../../new_fields/Doc";
import { NumCast, BoolCast, StrCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import { observable, action } from "mobx";
import "./PresentationView.scss";
import { Utils } from "../../../Utils";



interface PresentationElementProps {
    mainDocument: Doc;
    document: Doc;
    index: number;
    deleteDocument(index: number): void;
    gotoDocument(index: number): void;
    groupedMembers: Doc[][];
    allListElements: Doc[];
    groupMappings: Map<String, Doc[]>;

}

enum buttonIndex {
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


    @action
    onGroupClick = (document: Doc, index: number, buttonStatus: boolean) => {
        let p = this.props;
        if (index >= 1) {
            if (buttonStatus) {
                let newGuid = Utils.GenerateGuid();
                let aboveGuid = StrCast(p.allListElements[index - 1].presentId, null);
                let docGuid = StrCast(document.presentId, null);
                if (aboveGuid !== undefined) {
                    if (p.groupMappings.has(aboveGuid)) {
                        let aboveArray = p.groupMappings.get(aboveGuid)!;
                        if (p.groupMappings.has(docGuid)) {
                            console.log("Doc Guid: ", docGuid);
                            console.log("Above Guid: ", aboveGuid);
                            let docsArray = p.groupMappings.get(docGuid)!;
                            docsArray.forEach((doc: Doc) => {
                                if (!aboveArray.includes(doc)) {
                                    aboveArray.push(doc);

                                }
                            });
                            console.log("CAlled first one");

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

                            });
                        } else {
                            newAboveArray.push(document);

                        }
                        p.groupMappings.set(aboveGuid, newAboveArray);
                        console.log("NewABove array size: ", newAboveArray.length);



                    }
                    document.presentId = aboveGuid;
                } else {
                    p.allListElements[index - 1].presentId = newGuid;
                    let newAboveArray: Doc[] = [];
                    newAboveArray.push(p.allListElements[index - 1]);
                    if (p.groupMappings.has(docGuid)) {
                        let docsArray = p.groupMappings.get(docGuid)!;
                        docsArray.forEach((doc: Doc) => newAboveArray.push(doc));
                    } else {
                        newAboveArray.push(document);
                    }
                    document.presentId = newGuid;
                    p.groupMappings.set(newGuid, newAboveArray);
                    console.log("New Array created");


                }

            } else {
                let curArray = p.groupMappings.get(StrCast(document.presentId, Utils.GenerateGuid()))!;
                let targetIndex = curArray.indexOf(document);
                let firstPart = curArray.slice(0, targetIndex);
                let secondPart = curArray.slice(targetIndex);
                p.groupMappings.set(StrCast(p.allListElements[index - 1].presentId, Utils.GenerateGuid()), firstPart);
                p.groupMappings.set(StrCast(document.presentId, Utils.GenerateGuid()), secondPart);


            }

        }

    }

    @action
    onGroupClickRec = (document: Doc, index: number, buttonStatus: boolean) => {
        let p = this.props;
        if (buttonStatus) {
            if (index >= 1) {
                if (p.groupedMembers[index].length >= 0) {
                    p.groupedMembers[index].forEach((doc: Doc) => {
                        if (!p.groupedMembers[index - 1].includes(doc)) {
                            p.groupedMembers[index - 1].push(doc);
                        }
                    });
                }

                if (index >= 2) {
                    let nextBool = p.groupedMembers[index - 2].length !== 1;
                    if (nextBool === buttonStatus) {
                        this.onGroupClickRec(document, index - 1, p.groupedMembers[index - 2].length !== 1);
                    }
                }

            }
        }
        else {

            if (index >= 1) {
                let removeSize = p.groupedMembers[index].length;
                if (p.groupedMembers[index].length >= 0) {
                    p.groupedMembers[index].forEach((doc: Doc) => {
                        p.groupedMembers[index - 1].pop(); console.log("Reached!!");
                    });
                }

                if (index >= 2) {
                    let nextBool = p.groupedMembers[index - 2].length !== 1;
                    if (nextBool !== buttonStatus) {
                        this.recursiveDeleteGroups(index - 1, removeSize);
                    }
                }
            }
        }

    }

    @action
    recursiveDeleteGroups = (index: number, removeSize: number) => {
        let p = this.props;
        for (let i = 0; i < removeSize; i++) {
            p.groupedMembers[index - 1].pop();
        }
        if (index >= 2) {

            let nextBool = p.groupedMembers[index - 2].length !== 1;
            if (nextBool === true) {
                this.recursiveDeleteGroups(index - 1, removeSize);
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

    printGroupSizes = () => {
        this.props.groupedMembers.forEach((doc: Doc[], index: number) => console.log("Index: ", index, " size: ", doc.length));
    }

    @action
    onHideDocumentUntilPressClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (this.selectedButtons[buttonIndex.HideTillPressed]) {
            this.selectedButtons[buttonIndex.HideTillPressed] = false;

        } else {
            this.selectedButtons[buttonIndex.HideTillPressed] = true;
        }
    }

    hideDocumentIfNotPressed = () => {
        this.props.allListElements.forEach((doc: Doc) => doc.opacity = 1);
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
                <button className={this.selectedButtons[buttonIndex.Navigate] ? "presentation-interaction-selected" : "presentation-interaction"}>B</button>
                <button className={this.selectedButtons[buttonIndex.HideTillPressed] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={(e) => { this.onHideDocumentUntilPressClick(e); this.hideDocumentIfNotPressed(); }}>C</button>
                <button className={this.selectedButtons[buttonIndex.FadeAfter] ? "presentation-interaction-selected" : "presentation-interaction"}>D</button>
                <button className={this.selectedButtons[buttonIndex.HideAfter] ? "presentation-interaction-selected" : "presentation-interaction"}>E</button>
                <button className={this.selectedButtons[buttonIndex.Group] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={(e) => {
                    e.stopPropagation();
                    this.changeGroupStatus();
                    this.onGroupClick(p.document, p.index, this.selectedButtons[buttonIndex.Group]);
                    //this.printGroupSizes();
                }}>F</button>

            </div>
        );
    }
}