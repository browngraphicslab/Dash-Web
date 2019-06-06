import { observer } from "mobx-react";
import React = require("react");
import { observable, action, runInAction, reaction } from "mobx";
import "./PresentationView.scss";
import { DocumentManager } from "../../util/DocumentManager";
import { Utils } from "../../../Utils";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, NumCast, FieldValue, PromiseValue, StrCast, BoolCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import PresentationElement from "./PresentationElement";

export interface PresViewProps {
    Document: Doc;
}

interface PresListProps extends PresViewProps {
    deleteDocument(index: number): void;
    gotoDocument(index: number): void;
    groupedMembers: Doc[][];
    groupMappings: Map<String, Doc[]>;
}


@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class PresentationViewList extends React.Component<PresListProps> {


    // onGroupClick = (document: Doc, index: number, buttonStatus: boolean[]) => {
    //     if (buttonStatus[5]) {
    //         buttonStatus[5] = false;
    //         if (index >= 1) {
    //             if (this.groupedMembers[index].length >= 0) {
    //                 this.groupedMembers[index].forEach((doc: Doc) => this.groupedMembers[index - 1].slice(this.groupedMembers[index - 1].indexOf(doc), 1));
    //             }
    //         }
    //     } else {
    //         buttonStatus[5] = true;
    //         console.log("reached!! ", buttonStatus[5]);
    //         if (index >= 1) {
    //             if (this.groupedMembers[index].length >= 0) {
    //                 this.groupedMembers[index].forEach((doc: Doc) => this.groupedMembers[index - 1].push(doc));
    //             }
    //             this.groupedMembers[index - 1].push(document);
    //         }
    //     }
    // }
    @action
    initializeGroupArrays = (docList: Doc[]) => {
        console.log("Starting len: ", this.props.groupedMembers.length);
        docList.forEach((doc: Doc, index: number) => {
            if (this.props.groupedMembers.length < index + 2) {
                this.props.groupedMembers[index] = [];
                this.props.groupedMembers[index].push(docList[index]);

            }
        });
    }

    @action
    initializeGroupIds = (docList: Doc[]) => {
        docList.forEach((doc: Doc, index: number) => {
            let docGuid = StrCast(doc.presentId, null);
            if (docGuid === undefined) {
                doc.presentId = Utils.GenerateGuid();
            }
        });
    }

    // /**
    //  * Renders a single child document. It will just append a list element.
    //  * @param document The document to render.
    //  */
    // renderChild = (document: Doc, index: number) => {
    //     let title = document.title;

    //     //to get currently selected presentation doc
    //     let selected = NumCast(this.props.Document.selectedDoc, 0);

    //     let className = "presentationView-item";
    //     if (selected === index) {
    //         //this doc is selected
    //         className += " presentationView-selected";
    //     }
    //     let selectedButtons: boolean[] = new Array(6);
    //     let onEnter = (e: React.PointerEvent) => { document.libraryBrush = true; }
    //     let onLeave = (e: React.PointerEvent) => { document.libraryBrush = false; }
    //     return (
    //         <div className={className} key={document[Id] + index}
    //             onPointerEnter={onEnter} onPointerLeave={onLeave}
    //             style={{
    //                 outlineColor: "maroon",
    //                 outlineStyle: "dashed",
    //                 outlineWidth: BoolCast(document.libraryBrush, false) || BoolCast(document.protoBrush, false) ? `1px` : "0px",
    //             }}
    //             onClick={e => { this.props.gotoDocument(index); e.stopPropagation(); }}>
    //             <strong className="presentationView-name">
    //                 {`${index + 1}. ${title}`}
    //             </strong>
    //             <button className="presentation-icon" onClick={e => { this.props.deleteDocument(index); e.stopPropagation(); }}>X</button>
    //             <br></br>
    //             <button className={selectedButtons[0] ? "presentation-interaction" : "presentation-interaction-selected"}>A</button>
    //             <button className={selectedButtons[1] ? "presentation-interaction" : "presentation-interaction-selected"}>B</button>
    //             <button className={selectedButtons[2] ? "presentation-interaction" : "presentation-interaction-selected"}>C</button>
    //             <button className={selectedButtons[3] ? "presentation-interaction" : "presentation-interaction-selected"}>D</button>
    //             <button className={selectedButtons[4] ? "presentation-interaction" : "presentation-interaction-selected"}>E</button>
    //             <button className={selectedButtons[5] ? "presentation-interaction" : "presentation-interaction-selected"} onClick={() => this.onGroupClick(document, index, selectedButtons)}>F</button>

    //         </div>
    //     );

    // }

    render() {
        const children = DocListCast(this.props.Document.data);
        this.initializeGroupArrays(children);
        this.initializeGroupIds(children);

        return (
            <div className="presentationView-listCont">
                {children.map((doc: Doc, index: number) => <PresentationElement key={index} mainDocument={this.props.Document} document={doc} index={index} deleteDocument={this.props.deleteDocument} gotoDocument={this.props.gotoDocument} groupedMembers={this.props.groupedMembers} groupMappings={this.props.groupMappings} allListElements={children} />)}
            </div>
        );
    }
}


@observer
export class PresentationView extends React.Component<PresViewProps>  {
    public static Instance: PresentationView;

    @observable groupedMembers: Doc[][] = [];
    @observable groupMappings: Map<String, Doc[]> = new Map();

    //observable means render is re-called every time variable is changed
    @observable
    collapsed: boolean = false;
    closePresentation = action(() => this.props.Document.width = 0);
    next = () => {
        const current = NumCast(this.props.Document.selectedDoc);
        this.gotoDocument(current + 1);

    }
    back = () => {
        const current = NumCast(this.props.Document.selectedDoc);
        this.gotoDocument(current - 1);
    }

    @action
    public RemoveDoc = (index: number) => {
        const value = FieldValue(Cast(this.props.Document.data, listSpec(Doc)));
        if (value) {
            value.splice(index, 1);
        }
    }

    public gotoDocument = async (index: number) => {
        const list = FieldValue(Cast(this.props.Document.data, listSpec(Doc)));
        if (!list) {
            return;
        }
        if (index < 0 || index >= list.length) {
            return;
        }

        this.props.Document.selectedDoc = index;
        const doc = await list[index];
        DocumentManager.Instance.jumpToDocument(doc);
    }

    //initilize class variables
    constructor(props: PresViewProps) {
        super(props);
        PresentationView.Instance = this;
    }

    /**
     * Adds a document to the presentation view
     **/
    @action
    public PinDoc(doc: Doc) {
        //add this new doc to props.Document
        const data = Cast(this.props.Document.data, listSpec(Doc));
        if (data) {
            data.push(doc);
        } else {
            this.props.Document.data = new List([doc]);
        }

        this.props.Document.width = 300;
    }

    render() {
        let titleStr = StrCast(this.props.Document.title);
        let width = NumCast(this.props.Document.width);

        //TODO: next and back should be icons
        return (
            <div className="presentationView-cont" style={{ width: width, overflow: "hidden" }}>
                <div className="presentationView-heading">
                    <div className="presentationView-title">{titleStr}</div>
                    <button className='presentation-icon' onClick={this.closePresentation}>X</button>
                </div>
                <div className="presentation-buttons">
                    <button className="presentation-button" onClick={this.back}>back</button>
                    <button className="presentation-button" onClick={this.next}>next</button>
                </div>
                <PresentationViewList Document={this.props.Document} deleteDocument={this.RemoveDoc} gotoDocument={this.gotoDocument} groupedMembers={this.groupedMembers} groupMappings={this.groupMappings} />
            </div>
        );
    }
}