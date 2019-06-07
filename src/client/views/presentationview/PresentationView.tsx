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
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

library.add(faArrowLeft);
library.add(faArrowRight);

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

    @action
    initializeGroupIds = (docList: Doc[]) => {
        docList.forEach((doc: Doc, index: number) => {
            let docGuid = StrCast(doc.presentId, null);
            if (!this.props.groupMappings.has(docGuid)) {
                doc.presentId = Utils.GenerateGuid();
            }
        });
    }

    render() {
        const children = DocListCast(this.props.Document.data);
        this.initializeGroupIds(children);
        this.props.setChildrenDocs(children);
        return (

            <div className="presentationView-listCont">
                {children.map((doc: Doc, index: number) => <PresentationElement ref={(e) => { if (e) { this.props.presElementsMappings.set(doc, e); } }} key={index} mainDocument={this.props.Document} document={doc} index={index} deleteDocument={this.props.deleteDocument} gotoDocument={this.props.gotoDocument} groupMappings={this.props.groupMappings} allListElements={children} />)}
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
        let docAtCurrent = await this.getDocAtIndex(current);
        if (docAtCurrent === undefined) {
            return;
        }
        let curPresId = StrCast(docAtCurrent.presentId);
        let nextSelected = current + 1;

        if (this.groupMappings.has(curPresId)) {
            let currentsArray = this.groupMappings.get(StrCast(docAtCurrent.presentId))!;
            nextSelected = current + currentsArray.length - currentsArray.indexOf(docAtCurrent) - 1;
            if (nextSelected === current) nextSelected = current + 1;
        }

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
                    key.opacity = 0;
                }
            }
        });
    }

    navigateToElement = (curDoc: Doc) => {
        let docToJump: Doc = curDoc;
        let curDocPresId = StrCast(curDoc.presentId, null);

        if (curDocPresId !== undefined) {
            if (this.groupMappings.has(curDocPresId)) {
                let currentDocGroup = this.groupMappings.get(curDocPresId)!;
                currentDocGroup.forEach((doc: Doc, index: number) => {
                    let selectedButtons: boolean[] = this.presElementsMappings.get(doc)!.selected;
                    if (selectedButtons[buttonIndex.Navigate]) {
                        docToJump = doc;
                    }
                });
            }

        }
        if (docToJump === curDoc) {
            if (this.presElementsMappings.get(curDoc)!.selected[buttonIndex.Navigate]) {
                DocumentManager.Instance.jumpToDocument(curDoc);
            } else {
                return;
            }
        }
        DocumentManager.Instance.jumpToDocument(docToJump);
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
        this.navigateToElement(doc);
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
                    <button className="presentation-button" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                    <button className="presentation-button" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
                </div>
                <PresentationViewList Document={this.props.Document} deleteDocument={this.RemoveDoc} gotoDocument={this.gotoDocument} groupMappings={this.groupMappings} presElementsMappings={this.presElementsMappings} setChildrenDocs={this.setChildrenDocs} />
            </div>
        );
    }
}