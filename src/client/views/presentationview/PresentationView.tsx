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
import { faArrowRight, faArrowLeft, faPlay, faStop, faPlus, faTimes } from '@fortawesome/free-solid-svg-icons';
import { Docs } from "../../documents/Documents";

library.add(faArrowLeft);
library.add(faArrowRight);
library.add(faPlay);
library.add(faStop);
library.add(faPlus);
library.add(faTimes);

export interface PresViewProps {
    Documents: List<Doc>;
}

interface PresListProps {
    mainDocument: Doc;
    deleteDocument(index: number): void;
    gotoDocument(index: number, fromDoc: number): Promise<void>;
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
    initializeGroupIds = async (docList: Doc[]) => {
        docList.forEach(async (doc: Doc, index: number) => {
            let docGuid = StrCast(doc.presentId, null);
            //checking if part of group
            let storedGuids: string[] = [];
            let castedGroupDocs = await DocListCastAsync(this.props.presGroupBackUp.groupDocs);
            //making sure the docs that were in groups, which were stored, to not get new guids.
            if (castedGroupDocs !== undefined) {
                castedGroupDocs.forEach((doc: Doc) => {
                    let storedGuid = StrCast(doc.presentIdStore, null);
                    if (storedGuid) {
                        storedGuids.push(storedGuid);
                    }

                });
            }
            if (!this.props.groupMappings.has(docGuid) && !storedGuids.includes(docGuid)) {
                doc.presentId = Utils.GenerateGuid();
            }
        });
    }

    /**
     * Initially every document starts with a viewScale 1, which means
     * that they will be displayed in a canvas with scale 1.
     */
    @action
    initializeScaleViews = (docList: Doc[]) => {
        docList.forEach((doc: Doc) => {
            let curScale = NumCast(doc.viewScale, null);
            if (curScale === undefined) {
                doc.viewScale = 1;
            }
        });
    }



    render() {
        const children = DocListCast(this.props.mainDocument.data);
        this.initializeGroupIds(children);
        this.initializeScaleViews(children);
        this.props.setChildrenDocs(children);
        return (

            <div className="presentationView-listCont">
                {children.map((doc: Doc, index: number) => <PresentationElement ref={(e) => { if (e) { this.props.presElementsMappings.set(doc, e); } }} key={index} mainDocument={this.props.mainDocument} document={doc} index={index} deleteDocument={this.props.deleteDocument} gotoDocument={this.props.gotoDocument} groupMappings={this.props.groupMappings} allListElements={children} presStatus={this.props.presStatus} presButtonBackUp={this.props.presButtonBackUp} presGroupBackUp={this.props.presGroupBackUp} />)}
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
    @observable curPresentation: Doc = new Doc();
    @observable presentationsMapping: Map<String, Doc> = new Map();
    @observable selectedPresentation: HTMLSelectElement = new HTMLSelectElement();


    //initilize class variables
    constructor(props: PresViewProps) {
        super(props);
        PresentationView.Instance = this;
    }


    async componentWillMount() {
        let docAtZero = await this.props.Documents[0];
        runInAction(() => this.curPresentation = docAtZero);
    }

    componentDidMount() {
        //getting both backUp documents
        let castedGroupBackUp = Cast(this.curPresentation.presGroupBackUp, Doc);
        let castedButtonBackUp = Cast(this.curPresentation.presButtonBackUp, Doc);
        //if instantiated before 
        if (castedGroupBackUp instanceof Promise) {
            castedGroupBackUp.then(doc => {
                let toAssign = doc ? doc : new Doc();
                this.curPresentation.presGroupBackUp = toAssign;
                runInAction(() => this.presGroupBackUp = toAssign);
                if (doc) {
                    if (toAssign[Id] === doc[Id]) {
                        this.retrieveGroupMappings();
                    }
                }
            });
            //if never instantiated a store doc yet
        } else {
            runInAction(() => {
                let toAssign = new Doc();
                this.presGroupBackUp = toAssign;
                this.curPresentation.presGroupBackUp = toAssign;

            });

        }
        //if instantiated before 

        if (castedButtonBackUp instanceof Promise) {
            castedButtonBackUp.then(doc => {
                let toAssign = doc ? doc : new Doc();
                this.curPresentation.presButtonBackUp = toAssign;
                runInAction(() => this.presButtonBackUp = toAssign);
            });

            //if never instantiated a store doc yet
        } else {
            runInAction(() => {
                let toAssign = new Doc();
                this.presButtonBackUp = toAssign;
                this.curPresentation.presButtonBackUp = toAssign;
            });

        }


        //storing the presentation status,ie. whether it was stopped or playing
        let presStatusBackUp = BoolCast(this.curPresentation.presStatus, null);
        runInAction(() => this.presStatus = presStatusBackUp);
    }

    /**
     * This is the function that is called to retrieve the groups that have been stored and
     * push them to the groupMappings.
     */
    retrieveGroupMappings = async () => {
        let castedGroupDocs = await DocListCastAsync(this.presGroupBackUp.groupDocs);
        if (castedGroupDocs !== undefined) {
            castedGroupDocs.forEach(async (groupDoc: Doc, index: number) => {
                let castedGrouping = await DocListCastAsync(groupDoc.grouping);
                let castedKey = StrCast(groupDoc.presentIdStore, null);
                if (castedGrouping !== undefined && castedKey !== undefined) {
                    this.groupMappings.set(castedKey, castedGrouping);
                }
            });
        }
    }

    //observable means render is re-called every time variable is changed
    @observable
    collapsed: boolean = false;
    closePresentation = action(() => this.curPresentation.width = 0);
    next = async () => {
        const current = NumCast(this.curPresentation.selectedDoc);
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

        this.gotoDocument(nextSelected, current);

    }
    back = async () => {
        const current = NumCast(this.curPresentation.selectedDoc);
        //requesting for the doc at current index
        let docAtCurrent = await this.getDocAtIndex(current);
        if (docAtCurrent === undefined) {
            return;
        }

        //asking for its presentation id.
        let curPresId = StrCast(docAtCurrent.presentId);
        let prevSelected = current - 1;
        let zoomOut: boolean = false;

        //checking if this presentation id is mapped to a group, if so chosing the first element in group
        if (this.groupMappings.has(curPresId)) {
            let currentsArray = this.groupMappings.get(StrCast(docAtCurrent.presentId))!;
            prevSelected = current - currentsArray.length + (currentsArray.length - currentsArray.indexOf(docAtCurrent)) - 1;
            //end of grup so go beyond
            if (prevSelected === current) prevSelected = current - 1;

            //checking if any of the group members had used zooming in
            currentsArray.forEach((doc: Doc) => {
                if (this.presElementsMappings.get(doc)!.selected[buttonIndex.Show]) {
                    zoomOut = true;
                    return;
                }
            });

        }

        // if a group set that flag to zero or a single element
        //If so making sure to zoom out, which goes back to state before zooming action
        if (zoomOut || this.presElementsMappings.get(docAtCurrent)!.selected[buttonIndex.Show]) {
            let prevScale = NumCast(this.childrenDocs[prevSelected].viewScale, null);
            let curScale = DocumentManager.Instance.getScaleOfDocView(this.childrenDocs[current]);
            if (prevScale !== undefined) {
                if (prevScale !== curScale) {
                    DocumentManager.Instance.zoomIntoScale(docAtCurrent, prevScale);
                }
            }
        }
        this.gotoDocument(prevSelected, current);

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
    navigateToElement = async (curDoc: Doc, fromDoc: number) => {
        let docToJump: Doc = curDoc;
        let curDocPresId = StrCast(curDoc.presentId, null);
        let willZoom: boolean = false;

        //checking if in group
        if (curDocPresId !== undefined) {
            if (this.groupMappings.has(curDocPresId)) {
                let currentDocGroup = this.groupMappings.get(curDocPresId)!;
                currentDocGroup.forEach((doc: Doc, index: number) => {
                    let selectedButtons: boolean[] = this.presElementsMappings.get(doc)!.selected;
                    if (selectedButtons[buttonIndex.Navigate]) {
                        docToJump = doc;
                        willZoom = false;
                    }
                    if (selectedButtons[buttonIndex.Show]) {
                        docToJump = doc;
                        willZoom = true;
                    }
                });
            }

        }
        //docToJump stayed same meaning, it was not in the group or was the last element in the group
        if (docToJump === curDoc) {
            //checking if curDoc has navigation open
            let curDocButtons = this.presElementsMappings.get(curDoc)!.selected;
            if (curDocButtons[buttonIndex.Navigate]) {
                DocumentManager.Instance.jumpToDocument(curDoc, false);
            } else if (curDocButtons[buttonIndex.Show]) {
                let curScale = DocumentManager.Instance.getScaleOfDocView(this.childrenDocs[fromDoc]);
                //awaiting jump so that new scale can be found, since jumping is async
                await DocumentManager.Instance.jumpToDocument(curDoc, true);
                let newScale = DocumentManager.Instance.getScaleOfDocView(curDoc);
                curDoc.viewScale = newScale;

                //saving the scale user was on before zooming in
                if (curScale !== 1) {
                    this.childrenDocs[fromDoc].viewScale = curScale;
                }

            }
            return;
        }
        let curScale = DocumentManager.Instance.getScaleOfDocView(this.childrenDocs[fromDoc]);

        //awaiting jump so that new scale can be found, since jumping is async
        await DocumentManager.Instance.jumpToDocument(docToJump, willZoom);
        let newScale = DocumentManager.Instance.getScaleOfDocView(curDoc);
        curDoc.viewScale = newScale;
        //saving the scale that user was on
        if (curScale !== 1) {
            this.childrenDocs[fromDoc].viewScale = curScale;
        }

    }

    /**
     * Async function that supposedly return the doc that is located at given index.
     */
    getDocAtIndex = async (index: number) => {
        const list = FieldValue(Cast(this.curPresentation.data, listSpec(Doc)));
        if (!list) {
            return undefined;
        }
        if (index < 0 || index >= list.length) {
            return undefined;
        }

        this.curPresentation.selectedDoc = index;
        //awaiting async call to finish to get Doc instance
        const doc = await list[index];
        return doc;
    }

    @action
    public RemoveDoc = (index: number) => {
        const value = FieldValue(Cast(this.curPresentation.data, listSpec(Doc)));
        if (value) {
            value.splice(index, 1);
        }
    }
    @action
    public gotoDocument = async (index: number, fromDoc: number) => {
        const list = FieldValue(Cast(this.curPresentation.data, listSpec(Doc)));
        if (!list) {
            return;
        }
        if (index < 0 || index >= list.length) {
            return;
        }
        this.curPresentation.selectedDoc = index;

        if (!this.presStatus) {
            this.presStatus = true;
            this.startPresentation(index);
        }

        const doc = await list[index];
        if (this.presStatus) {
            this.navigateToElement(doc, fromDoc);
            this.hideIfNotPresented(index);
            this.showAfterPresented(index);
        }

    }



    /**
     * Adds a document to the presentation view
     **/
    @action
    public PinDoc(doc: Doc) {
        //add this new doc to props.Document
        const data = Cast(this.curPresentation.data, listSpec(Doc));
        if (data) {
            data.push(doc);
        } else {
            this.curPresentation.data = new List([doc]);
        }

        this.curPresentation.width = 300;
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
            const current = NumCast(this.curPresentation.selectedDoc);
            this.gotoDocument(0, current);
        }
        this.curPresentation.presStatus = this.presStatus;
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
        this.curPresentation.selectedDoc = 0;
        if (this.childrenDocs.length === 0) {
            return;
        }
        DocumentManager.Instance.zoomIntoScale(this.childrenDocs[0], 1);
        this.childrenDocs[0].viewScale = 1;

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

    @action
    addNewPresentation = () => {
        let title = "Presentation " + (this.props.Documents.length + 1);
        let newPresentationDoc = Docs.TreeDocument([], { title: title });
        this.props.Documents.push(newPresentationDoc);
        this.curPresentation = newPresentationDoc;
    }

    @action
    getSelectedPresentation = (e: React.ChangeEvent<HTMLSelectElement>) => {
        this.curPresentation = this.presentationsMapping.get(e.target.value)!;
    }


    render() {
        let titleStr = StrCast(this.curPresentation.title);
        let width = NumCast(this.curPresentation.width);
        let presentationList = DocListCast(this.props.Documents);


        console.log("width: ", width);
        console.log("title : ", titleStr);

        //TODO: next and back should be icons
        return (
            <div className="presentationView-cont" style={{ width: width, overflow: "hidden" }}>
                <div className="presentationView-heading">
                    {/* <div className="presentationView-title">{titleStr}</div> */}
                    <select className="presentationView-title" onChange={this.getSelectedPresentation} ref={(e) => this.selectedPresentation = e!}>
                        {presentationList.map((doc: Doc, index: number) => {
                            let newGuid = Utils.GenerateGuid();
                            this.presentationsMapping.set(newGuid, doc);
                            return <option key={index} value={newGuid}>{StrCast(doc.title)}</option>;
                        })}
                    </select>
                    <button title="Close Presentation" className='presentation-icon' onClick={this.closePresentation}><FontAwesomeIcon icon={"times"} /></button>
                    <button title="Add Presentation" className="presentation-icon" style={{ marginRight: 10 }} onClick={this.addNewPresentation}><FontAwesomeIcon icon={"plus"} /></button>

                </div>
                <div className="presentation-buttons">
                    <button title="Back" className="presentation-button" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                    {this.renderPlayPauseButton()}
                    <button title="Next" className="presentation-button" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
                </div>
                <PresentationViewList mainDocument={this.curPresentation} deleteDocument={this.RemoveDoc} gotoDocument={this.gotoDocument} groupMappings={this.groupMappings} presElementsMappings={this.presElementsMappings} setChildrenDocs={this.setChildrenDocs} presStatus={this.presStatus} presButtonBackUp={this.presButtonBackUp} presGroupBackUp={this.presGroupBackUp} />
            </div>
        );
    }
}