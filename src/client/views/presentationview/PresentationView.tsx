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
import { faArrowRight, faArrowLeft, faPlay, faStop } from '@fortawesome/free-solid-svg-icons';

library.add(faArrowLeft);
library.add(faArrowRight);
library.add(faPlay);
library.add(faStop);

export interface PresViewProps {
    Document: Doc;
}

interface PresListProps extends PresViewProps {
    deleteDocument(index: number): void;
    gotoDocument(index: number): void;
    groupMappings: Map<String, Doc[]>;
    presElementsMappings: Map<Doc, PresentationElement>;
    setChildrenDocs: (docList: Doc[]) => void;
    presStatus: boolean;
    presButtonBackUp: Doc;
    presGroupBackUp: Doc;
}


@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class PresentationViewList extends React.Component<PresListProps> {

    /**
     * Method that initializes presentation ids for the
     * docs that is in the presentation, when presentation list
     * gets re-rendered. It makes sure to not assign ids to the
     * docs that are in the group, so that mapping won't be disrupted.
     */
    @action
    initializeGroupIds = (docList: Doc[]) => {
        docList.forEach((doc: Doc, index: number) => {
            let docGuid = StrCast(doc.presentId, null);
            //checking if part of group
            if (!this.props.groupMappings.has(docGuid)) {
                doc.presentId = Utils.GenerateGuid();
            }
        });
    }

    @action
    initializeSelectedButtonDocs = (docList: Doc[]) => {

        let castedList = DocListCast(this.props.presButtonBackUp.selectedButtonDocs);
        if (castedList.length === 0) {
            let newDocArray: List<Doc> = new List();
            newDocArray.push(new Doc());
            this.props.presButtonBackUp.selectedButtonDocs = newDocArray;
        } else {
            castedList.push(new Doc());
        }


    }

    render() {
        const children = DocListCast(this.props.Document.data);
        this.initializeGroupIds(children);
        this.props.setChildrenDocs(children);
        //this.initializeSelectedButtonDocs(children);
        return (

            <div className="presentationView-listCont">
                {children.map((doc: Doc, index: number) => <PresentationElement ref={(e) => { if (e) { this.props.presElementsMappings.set(doc, e); } }} key={index} mainDocument={this.props.Document} document={doc} index={index} deleteDocument={this.props.deleteDocument} gotoDocument={this.props.gotoDocument} groupMappings={this.props.groupMappings} allListElements={children} presStatus={this.props.presStatus} presButtonBackUp={this.props.presButtonBackUp} presGroupBackUp={this.props.presGroupBackUp} />)}
            </div>
        );
    }
}


@observer
export class PresentationView extends React.Component<PresViewProps>  {
    public static Instance: PresentationView;

    //Mapping from presentation ids to a list of doc that represent a group
    @observable groupMappings: Map<String, Doc[]> = new Map();
    //mapping from docs to their rendered component
    @observable presElementsMappings: Map<Doc, PresentationElement> = new Map();
    //variable that holds all the docs in the presentation
    @observable childrenDocs: Doc[] = [];
    //variable to hold if presentation is started
    @observable presStatus: boolean = false;
    //back-up so that presentation stays the way it's when refreshed
    @observable presGroupBackUp: Doc = new Doc();
    @observable presButtonBackUp: Doc = new Doc();



    componentDidMount() {
        // let newDoc = new Doc();
        // let newDoc2 = new Doc();
        let castedGroupBackUp = Cast(this.props.Document.presGroupBackUp, Doc);
        let castedButtonBackUp = Cast(this.props.Document.presButtonBackUp, Doc);
        if (castedGroupBackUp instanceof Promise) {
            castedGroupBackUp.then(doc => {
                let toAssign = doc ? doc : new Doc();
                this.props.Document.presGroupBackUp = toAssign;
                runInAction(() => this.presGroupBackUp = toAssign);
            });
        } else {
            runInAction(() => {
                let toAssign = new Doc();
                this.presGroupBackUp = toAssign;
                this.props.Document.presGroupBackUp = toAssign;

            });

        }

        if (castedButtonBackUp instanceof Promise) {
            castedButtonBackUp.then(doc => {
                let toAssign = doc ? doc : new Doc();
                this.props.Document.presButtonBackUp = toAssign;
                runInAction(() => this.presButtonBackUp = toAssign);
            });

        } else {
            runInAction(() => {
                let toAssign = new Doc();
                this.presButtonBackUp = toAssign;
                this.props.Document.presButtonBackUp = toAssign;
            });

        }

        let presStatusBackUp = BoolCast(this.props.Document.presStatus, null);
        runInAction(() => this.presStatus = presStatusBackUp);
    }

    //observable means render is re-called every time variable is changed
    @observable
    collapsed: boolean = false;
    closePresentation = action(() => this.props.Document.width = 0);
    next = async () => {
        const current = NumCast(this.props.Document.selectedDoc);
        //asking to get document at current index
        let docAtCurrentNext = await this.getDocAtIndex(current + 1);
        if (docAtCurrentNext === undefined) {
            return;
        }
        //asking for it's presentation id
        let curNextPresId = StrCast(docAtCurrentNext.presentId);
        let nextSelected = current + 1;

        //if curDoc is in a group, selection slides until last one, if not it's next one
        if (this.groupMappings.has(curNextPresId)) {
            let currentsArray = this.groupMappings.get(StrCast(docAtCurrentNext.presentId))!;
            nextSelected = current + currentsArray.length - currentsArray.indexOf(docAtCurrentNext);

            //end of grup so go beyond
            if (nextSelected === current) nextSelected = current + 1;
        }

        this.gotoDocument(nextSelected);

    }
    back = async () => {
        const current = NumCast(this.props.Document.selectedDoc);
        //requesting for the doc at current index
        let docAtCurrent = await this.getDocAtIndex(current);
        if (docAtCurrent === undefined) {
            return;
        }

        //asking for its presentation id.
        let curPresId = StrCast(docAtCurrent.presentId);
        let prevSelected = current - 1;

        //checking if this presentation id is mapped to a group, if so chosing the first element in group
        if (this.groupMappings.has(curPresId)) {
            let currentsArray = this.groupMappings.get(StrCast(docAtCurrent.presentId))!;
            prevSelected = current - currentsArray.length + (currentsArray.length - currentsArray.indexOf(docAtCurrent)) - 1;
            //end of grup so go beyond
            if (prevSelected === current) prevSelected = current - 1;


        }


        this.gotoDocument(prevSelected);
    }

    /**
     * This is the method that checks for the actions that need to be performed
     * after the document has been presented, which involves 3 button options:
     * Hide Until Presented, Hide After Presented, Fade After Presented
     */
    showAfterPresented = (index: number) => {
        this.presElementsMappings.forEach((presElem: PresentationElement, key: Doc) => {
            let selectedButtons: boolean[] = presElem.selected;
            //the order of cases is aligned based on priority
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

    /**
     * This is the method that checks for the actions that need to be performed
     * before the document has been presented, which involves 3 button options:
     * Hide Until Presented, Hide After Presented, Fade After Presented
     */
    hideIfNotPresented = (index: number) => {
        this.presElementsMappings.forEach((presElem: PresentationElement, key: Doc) => {
            let selectedButtons: boolean[] = presElem.selected;

            //the order of cases is aligned based on priority

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

    /**
     * This method makes sure that cursor navigates to the element that
     * has the option open and last in the group. If not in the group, and it has
     * te option open, navigates to that element.
     */
    navigateToElement = (curDoc: Doc) => {
        let docToJump: Doc = curDoc;
        let curDocPresId = StrCast(curDoc.presentId, null);

        //checking if in group
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
        //docToJump stayed same meaning, it was not in the group or was the last element in the group
        if (docToJump === curDoc) {
            //checking if curDoc has navigation open
            if (this.presElementsMappings.get(curDoc)!.selected[buttonIndex.Navigate]) {
                DocumentManager.Instance.jumpToDocument(curDoc);
            } else {
                return;
            }
        }
        DocumentManager.Instance.jumpToDocument(docToJump);
    }

    /**
     * Async function that supposedly return the doc that is located at given index.
     */
    getDocAtIndex = async (index: number) => {
        const list = FieldValue(Cast(this.props.Document.data, listSpec(Doc)));
        if (!list) {
            return undefined;
        }
        if (index < 0 || index >= list.length) {
            return undefined;
        }

        this.props.Document.selectedDoc = index;
        //awaiting async call to finish to get Doc instance
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
    @action
    public gotoDocument = async (index: number) => {
        const list = FieldValue(Cast(this.props.Document.data, listSpec(Doc)));
        if (!list) {
            return;
        }
        if (index < 0 || index >= list.length) {
            return;
        }
        this.props.Document.selectedDoc = index;

        if (!this.presStatus) {
            this.presStatus = true;
            this.startPresentation(index);
        }

        const doc = await list[index];
        if (this.presStatus) {
            this.navigateToElement(doc);
            this.hideIfNotPresented(index);
            this.showAfterPresented(index);
        }

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

    renderPlayPauseButton = () => {
        if (this.presStatus) {
            return <button title="Reset Presentation" className="presentation-button" onClick={this.startOrResetPres}><FontAwesomeIcon icon="stop" /></button>;
        } else {
            return <button title="Start Presentation From Start" className="presentation-button" onClick={this.startOrResetPres}><FontAwesomeIcon icon="play" /></button>;
        }
    }

    @action
    startOrResetPres = () => {
        if (this.presStatus) {
            this.presStatus = false;
            this.resetPresentation();
        } else {
            this.presStatus = true;
            this.startPresentation(0);
            this.gotoDocument(0);
        }
        this.props.Document.presStatus = this.presStatus;
    }

    @action
    resetPresentation = () => {
        //this.groupMappings = new Map();
        //let selectedButtons: boolean[];
        this.presElementsMappings.forEach((component: PresentationElement, doc: Doc) => {
            //selectedButtons = component.selected;
            //selectedButtons.forEach((val: boolean, index: number) => selectedButtons[index] = false);
            //doc.presentId = Utils.GenerateGuid();
            doc.opacity = 1;
        });
        this.props.Document.selectedDoc = 0;

    }

    startPresentation = (startIndex: number) => {
        let selectedButtons: boolean[];
        this.presElementsMappings.forEach((component: PresentationElement, doc: Doc) => {
            selectedButtons = component.selected;
            if (selectedButtons[buttonIndex.HideTillPressed]) {
                if (this.childrenDocs.indexOf(doc) > startIndex) {
                    doc.opacity = 0;
                }

            }
            if (selectedButtons[buttonIndex.HideAfter]) {
                if (this.childrenDocs.indexOf(doc) < startIndex) {
                    doc.opacity = 0;
                }
            }
            if (selectedButtons[buttonIndex.FadeAfter]) {
                if (this.childrenDocs.indexOf(doc) < startIndex) {
                    doc.opacity = 0.5;
                }
            }

        });

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
                    <button title="Back" className="presentation-button" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                    {this.renderPlayPauseButton()}
                    <button title="Next" className="presentation-button" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
                </div>
                <PresentationViewList Document={this.props.Document} deleteDocument={this.RemoveDoc} gotoDocument={this.gotoDocument} groupMappings={this.groupMappings} presElementsMappings={this.presElementsMappings} setChildrenDocs={this.setChildrenDocs} presStatus={this.presStatus} presButtonBackUp={this.presButtonBackUp} presGroupBackUp={this.presGroupBackUp} />
            </div>
        );
    }
}