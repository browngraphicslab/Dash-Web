import { observer } from "mobx-react";
import React = require("react");
import { Doc } from "../../../new_fields/Doc";
import { NumCast, BoolCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import { observable, action } from "mobx";
import "./PresentationView.scss";



interface PresentationElementProps {
    mainDocument: Doc;
    document: Doc;
    index: number;
    deleteDocument(index: number): void;
    gotoDocument(index: number): void;
    groupedMembers: [Doc[]];
    allListElements: Doc[];

}

@observer
export default class PresentationElement extends React.Component<PresentationElementProps> {

    @observable selectedButtons: boolean[] = new Array(6);


    @action
    onGroupClick = (document: Doc, index: number, buttonStatus: boolean[] | boolean) => {
        let p = this.props;
        if (Array.isArray(buttonStatus)) {
            if (buttonStatus[5]) {
                buttonStatus[5] = false;
                console.log("Reached!");
                if (index >= 1) {
                    if (p.groupedMembers[index].length >= 0) {
                        p.groupedMembers[index].forEach((doc: Doc) => p.groupedMembers[index - 1] = p.groupedMembers[index - 1].slice(p.groupedMembers[index - 1].indexOf(doc), 1));
                    }
                }
            } else {
                buttonStatus[5] = true;
                if (index >= 1) {
                    if (p.groupedMembers[index].length >= 0) {
                        p.groupedMembers[index].forEach((doc: Doc) => p.groupedMembers[index - 1].push(doc));
                    }
                    p.groupedMembers[index - 1].push(document);
                    //this.onGroupClick()
                }
            }
        } else {
            if (!buttonStatus) {
                if (p.groupedMembers[index].length >= 0) {
                    p.groupedMembers[index].forEach((doc: Doc) => p.groupedMembers[index - 1] = p.groupedMembers[index - 1].slice(p.groupedMembers[index - 1].indexOf(doc), 1));
                }
            } else {
                if (p.groupedMembers[index].length >= 0) {
                    p.groupedMembers[index].forEach((doc: Doc) => { if (!p.groupedMembers[index - 1].includes(doc)) { p.groupedMembers[index - 1].push(doc); } });
                }
                if (!p.groupedMembers[index - 1].includes(document)) {
                    p.groupedMembers[index - 1].push(document);
                }
            }
        }
        if (index >= 2) {
            this.onGroupClick(p.allListElements[index - 1], index - 1, p.groupedMembers[index - 2].length !== 0);
        }

        p.groupedMembers.forEach((docArray: Doc[], index: number) => console.log("Index: ", index, " size: ", docArray.length));
        console.log("Group Size: ", p.groupedMembers[index - 1].length);
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
        let onEnter = (e: React.PointerEvent) => { p.document.libraryBrush = true; }
        let onLeave = (e: React.PointerEvent) => { p.document.libraryBrush = false; }
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
                <button className={this.selectedButtons[0] ? "presentation-interaction-selected" : "presentation-interaction"}>A</button>
                <button className={this.selectedButtons[1] ? "presentation-interaction-selected" : "presentation-interaction"}>B</button>
                <button className={this.selectedButtons[2] ? "presentation-interaction-selected" : "presentation-interaction"}>C</button>
                <button className={this.selectedButtons[3] ? "presentation-interaction-selected" : "presentation-interaction"}>D</button>
                <button className={this.selectedButtons[4] ? "presentation-interaction-selected" : "presentation-interaction"}>E</button>
                <button className={this.selectedButtons[5] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={(e) => {
                    e.stopPropagation();
                    this.onGroupClick(p.document, p.index, this.selectedButtons);
                }}>F</button>

            </div>
        );
    }
}