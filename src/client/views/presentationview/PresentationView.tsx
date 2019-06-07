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
import PresentationElement, { buttonIndex } from "./PresentationElement";

export interface PresViewProps {
    Document: Doc;
}

interface PresListProps extends PresViewProps {
    deleteDocument(index: number): void;
    gotoDocument(index: number): void;
    groupMappings: Map<String, Doc[]>;
    presElementsMappings: Map<Doc, PresentationElement>;
    setChildrenDocs: (docList: Doc[]) => void;
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
    initializeGroupIds = (docList: Doc[]) => {
        docList.forEach((doc: Doc, index: number) => {
            let docGuid = StrCast(doc.presentId, null);
            if (!this.props.groupMappings.has(docGuid)) {
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
        this.initializeGroupIds(children);
        this.props.setChildrenDocs(children);
        return (

            <div className="presentationView-listCont">
                {children.map((doc: Doc, index: number) => <PresentationElement ref={(e) => this.props.presElementsMappings.set(doc, e!)} key={index} mainDocument={this.props.Document} document={doc} index={index} deleteDocument={this.props.deleteDocument} gotoDocument={this.props.gotoDocument} groupMappings={this.props.groupMappings} allListElements={children} />)}
            </div>
        );
    }
}


@observer
export class PresentationView extends React.Component<PresViewProps>  {
    public static Instance: PresentationView;

    @observable groupedMembers: Doc[][] = [];
    @observable groupMappings: Map<String, Doc[]> = new Map();
    @observable presElementsMappings: Map<Doc, PresentationElement> = new Map();
    @observable childrenDocs: Doc[] = [];

    //observable means render is re-called every time variable is changed
    @observable
    collapsed: boolean = false;
    closePresentation = action(() => this.props.Document.width = 0);
    next = async () => {
        const current = NumCast(this.props.Document.selectedDoc);
        // let currentPresId = StrCast(current.presentId);
        let docAtCurrent = await this.getDocAtIndex(current);
        if (docAtCurrent === undefined) {
            return;
        }
        let curPresId = StrCast(docAtCurrent.presentId);
        let nextSelected = current + 1;

        if (this.groupMappings.has(curPresId)) {
            let currentsArray = this.groupMappings.get(StrCast(docAtCurrent.presentId))!;
            console.log("It reaches here");
            console.log("CurArray Len: ", currentsArray.length)
            //nextSelected = current + currentsArray.length - current - 1;
            nextSelected = current + currentsArray.length - currentsArray.indexOf(docAtCurrent) - 1;
            if (nextSelected === current) nextSelected = current + 1;
        }

        // this.groupMappings.get(current.presentId);
        this.gotoDocument(nextSelected);

    }
    back = async () => {
        const current = NumCast(this.props.Document.selectedDoc);
        let docAtCurrent = await this.getDocAtIndex(current);
        if (docAtCurrent === undefined) {
            return;
        }
        let curPresId = StrCast(docAtCurrent.presentId);
        let prevSelected = current - 1;

        if (this.groupMappings.has(curPresId)) {
            let currentsArray = this.groupMappings.get(StrCast(docAtCurrent.presentId))!;
            prevSelected = current - currentsArray.length + (currentsArray.length - currentsArray.indexOf(docAtCurrent));
            if (prevSelected === current) prevSelected = current - 1;


        }


        this.gotoDocument(prevSelected);
    }

    showAfterPresented = (index: number) => {
        this.presElementsMappings.forEach((presElem: PresentationElement, key: Doc) => {
            let selectedButtons: boolean[] = presElem.selected;
            if (selectedButtons[buttonIndex.HideTillPressed]) {
                if (this.childrenDocs.indexOf(key) <= index) {
                    key.opacity = 1;
                }
            }
            if (selectedButtons[buttonIndex.HideAfter]) {
                if (this.childrenDocs.indexOf(key) < index) {
                    key.opacity = 0;
                }
            }
            if (selectedButtons[buttonIndex.FadeAfter]) {
                if (this.childrenDocs.indexOf(key) < index) {
                    key.opacity = 0.5;
                }
            }
        });
    }

    hideIfNotPresented = (index: number) => {
        this.presElementsMappings.forEach((presElem: PresentationElement, key: Doc) => {
            let selectedButtons: boolean[] = presElem.selected;
            if (selectedButtons[buttonIndex.HideAfter]) {
                if (this.childrenDocs.indexOf(key) >= index) {
                    console.log("CAlled this right");
                    key.opacity = 1;
                }
            }
            if (selectedButtons[buttonIndex.FadeAfter]) {
                if (this.childrenDocs.indexOf(key) >= index) {
                    key.opacity = 1;
                }
            }
            if (selectedButtons[buttonIndex.HideTillPressed]) {
                if (this.childrenDocs.indexOf(key) > index) {
                    console.log("KeyIndex: ", this.childrenDocs.indexOf(key));
                    console.log("Cur index: ", index);
                    key.opacity = 0;
                }
            }
        });
    }

    getDocAtIndex = async (index: number) => {
        const list = FieldValue(Cast(this.props.Document.data, listSpec(Doc)));
        if (!list) {
            return undefined;
        }
        if (index < 0 || index >= list.length) {
            return undefined;
        }

        this.props.Document.selectedDoc = index;
        const doc = await list[index];
        return doc;
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
        this.hideIfNotPresented(index);
        this.showAfterPresented(index);


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

    @action
    setChildrenDocs = (docList: Doc[]) => {
        this.childrenDocs = docList;
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
                <PresentationViewList Document={this.props.Document} deleteDocument={this.RemoveDoc} gotoDocument={this.gotoDocument} groupMappings={this.groupMappings} presElementsMappings={this.presElementsMappings} setChildrenDocs={this.setChildrenDocs} />
            </div>
        );
    }
}