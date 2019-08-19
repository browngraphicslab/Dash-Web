import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faArrowRight, faEdit, faMinus, faPlay, faPlus, faStop, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { BoolCast, Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { Utils } from "../../../Utils";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import PresentationElement, { buttonIndex } from "../presentationview/PresentationElement";
import PresentationViewList from "../presentationview/PresentationList";
import "../presentationview/PresentationView.scss";
import { FieldView, FieldViewProps } from './FieldView';
import { ContextMenu } from "../ContextMenu";

library.add(faArrowLeft);
library.add(faArrowRight);
library.add(faPlay);
library.add(faStop);
library.add(faPlus);
library.add(faTimes);
library.add(faMinus);
library.add(faEdit);


export interface PresViewProps {
    Documents: List<Doc>;
}

const expandedWidth = 450;

@observer
export class PresBox extends React.Component<FieldViewProps> { //FieldViewProps?


    public static LayoutString(fieldKey?: string) { return FieldView.LayoutString(PresBox, fieldKey); }

    public static Instance: PresBox;

    //Keeping track of the doc for the current presentation -- bcz: keeping a list of current presentations shouldn't be needed.  Let users create them, store them, as they see fit.
    @computed get curPresentation() { return this.props.Document; }

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
    //Mapping of guids to presentations.
    @observable presentationsMapping: Map<String, Doc> = new Map();
    //Mapping of presentations to guid, so that select option values can be given.
    @observable presentationsKeyMapping: Map<Doc, String> = new Map();
    //Variable to keep track of guid of the current presentation
    @observable currentSelectedPresValue: string | undefined;
    //A flag to keep track if title input is open, which is used in rendering.
    @observable PresTitleInputOpen: boolean = false;
    //Variable that holds reference to title input, so that new presentations get titles assigned.
    @observable titleInputElement: HTMLInputElement | undefined;
    @observable PresTitleChangeOpen: boolean = false;

    @observable opacity = 1;
    @observable persistOpacity = true;
    @observable labelOpacity = 0;
    @observable presMode = false;

    @observable public static CurrentPresentation: PresBox;

    //initilize class variables
    constructor(props: FieldViewProps) {
        super(props);
        runInAction(() => PresBox.CurrentPresentation = this);
    }

    @action
    toggle = (forcedValue: boolean | undefined) => {
        if (forcedValue !== undefined) {
            this.curPresentation.width = forcedValue ? expandedWidth : 0;
        } else {
            this.curPresentation.width = this.curPresentation.width === expandedWidth ? 0 : expandedWidth;
        }
    }

    //Second lifecycle function that gets called when component mounts. It makes sure toS
    //get the back-up information from previous session for the current presentation.
    async componentDidMount() {
        this.setPresentationBackUps();
    }


    /**
     * The function that retrieves the backUps for the current Presentation if present,
     * otherwise initializes.
     */
    setPresentationBackUps = async () => {
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
        } else if (castedGroupBackUp instanceof Doc) {
            let castedDoc: Doc = await castedGroupBackUp;
            runInAction(() => this.presGroupBackUp = castedDoc);
            this.retrieveGroupMappings();
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
        } else if (castedButtonBackUp instanceof Doc) {
            let castedDoc: Doc = await castedButtonBackUp;
            runInAction(() => this.presButtonBackUp = castedDoc);

        } else {
            runInAction(() => {
                let toAssign = new Doc();
                this.presButtonBackUp = toAssign;
                this.curPresentation.presButtonBackUp = toAssign;
            });

        }


        //storing the presentation status,ie. whether it was stopped or playing
        let presStatusBackUp = BoolCast(this.curPresentation.presStatus);
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
                if (castedGrouping) {
                    castedGrouping.forEach((doc: Doc) => {
                        doc.presentId = castedKey;
                    });
                }
                if (castedGrouping !== undefined && castedKey !== undefined) {
                    this.groupMappings.set(castedKey, castedGrouping);
                }
            });
        }
    }

    //observable means render is re-called every time variable is changed
    @observable
    collapsed: boolean = false;
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
                //let presElem: PresentationElement | undefined = this.presElementsMappings.get(doc);
                if (this.presElementsMappings.get(doc)!.selected[buttonIndex.Show]) {
                    zoomOut = true;
                    return;
                }
            });

        }

        // if a group set that flag to zero or a single element
        //If so making sure to zoom out, which goes back to state before zooming action
        if (current > 0) {
            if (zoomOut || this.presElementsMappings.get(docAtCurrent)!.selected[buttonIndex.Show]) {
                let prevScale = NumCast(this.childrenDocs[prevSelected].viewScale, null);
                let curScale = DocumentManager.Instance.getScaleOfDocView(this.childrenDocs[current]);
                if (prevScale !== undefined) {
                    if (prevScale !== curScale) {
                        DocumentManager.Instance.zoomIntoScale(docAtCurrent, prevScale);
                    }
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

    /**
     * The function that removes a doc from a presentation. It also makes sure to
     * do necessary updates to backUps and mappings stored locally.
     */
    @action
    public RemoveDoc = async (index: number) => {
        const value = FieldValue(Cast(this.curPresentation.data, listSpec(Doc)));
        if (value) {
            let removedDoc = await value.splice(index, 1)[0];

            //removing the Presentation Element stored for it
            this.presElementsMappings.delete(removedDoc);

            let removedDocPresentId = StrCast(removedDoc.presentId);

            //Removing it from local mapping of the groups
            if (this.groupMappings.has(removedDocPresentId)) {
                let removedDocsGroup = this.groupMappings.get(removedDocPresentId);
                if (removedDocsGroup) {
                    removedDocsGroup.splice(removedDocsGroup.indexOf(removedDoc), 1);
                    if (removedDocsGroup.length === 0) {
                        this.groupMappings.delete(removedDocPresentId);
                    }
                }
            }

            //removing it from the backUp of selected Buttons
            // let castedList = Cast(this.presButtonBackUp.selectedButtonDocs, listSpec(Doc));
            // if (castedList) {
            //     castedList.forEach(async (doc, indexOfDoc) => {
            //         let curDoc = await doc;
            //         let curDocId = StrCast(curDoc.docId);
            //         if (curDocId === removedDoc[Id]) {
            //             if (castedList) {
            //                 castedList.splice(indexOfDoc, 1);
            //                 return;
            //             }
            //         }
            //     });

            // }
            //removing it from the backUp of selected Buttons

            let castedList = Cast(this.presButtonBackUp.selectedButtonDocs, listSpec(Doc));
            if (castedList) {
                for (let doc of castedList) {
                    let curDoc = await doc;
                    let curDocId = StrCast(curDoc.docId);
                    if (curDocId === removedDoc[Id]) {
                        castedList.splice(castedList.indexOf(curDoc), 1);
                        break;

                    }
                }
            }

            //removing it from the backup of groups
            let castedGroupDocs = await DocListCastAsync(this.presGroupBackUp.groupDocs);
            if (castedGroupDocs) {
                castedGroupDocs.forEach(async (groupDoc: Doc, index: number) => {
                    let castedKey = StrCast(groupDoc.presentIdStore, null);
                    if (castedKey === removedDocPresentId) {
                        let castedGrouping = await DocListCastAsync(groupDoc.grouping);
                        if (castedGrouping) {
                            castedGrouping.splice(castedGrouping.indexOf(removedDoc), 1);
                            if (castedGrouping.length === 0) {
                                castedGroupDocs!.splice(castedGroupDocs!.indexOf(groupDoc), 1);
                            }
                        }
                    }

                });

            }


        }
    }

    public removeDocByRef = (doc: Doc) => {
        let indexOfDoc = this.childrenDocs.indexOf(doc);
        const value = FieldValue(Cast(this.curPresentation.data, listSpec(Doc)));
        if (value) {
            value.splice(indexOfDoc, 1)[0];
        }
        //this.RemoveDoc(indexOfDoc, true);
        if (indexOfDoc !== - 1) {
            return true;
        }
        return false;
    }

    //The function that is called when a document is clicked or reached through next or back.
    //it'll also execute the necessary actions if presentation is playing.
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

    //Function that is called to resetGroupIds, so that documents get new groupIds at
    //first load, when presentation is changed.
    resetGroupIds = async () => {
        let castedGroupDocs = await DocListCastAsync(this.presGroupBackUp.groupDocs);
        if (castedGroupDocs !== undefined) {
            castedGroupDocs.forEach(async (groupDoc: Doc, index: number) => {
                let castedGrouping = await DocListCastAsync(groupDoc.grouping);
                if (castedGrouping) {
                    castedGrouping.forEach((doc: Doc) => {
                        doc.presentId = Utils.GenerateGuid();
                    });
                }
            });
        }
        runInAction(() => this.groupMappings = new Map());
    }

    //Function that sets the store of the children docs.
    @action
    setChildrenDocs = (docList: Doc[]) => {
        this.childrenDocs = docList;
    }

    //The function that is called to render the play or pause button depending on
    //if presentation is running or not.
    renderPlayPauseButton = () => {
        if (this.presStatus) {
            return <button title="Reset Presentation" className="presentation-button" onClick={this.startOrResetPres}><FontAwesomeIcon icon="stop" /></button>;
        } else {
            return <button title="Start Presentation From Start" className="presentation-button" onClick={this.startOrResetPres}><FontAwesomeIcon icon="play" /></button>;
        }
    }

    //The function that starts or resets presentaton functionally, depending on status flag.
    @action
    startOrResetPres = () => {
        if (this.presStatus) {
            this.resetPresentation();
        } else {
            this.presStatus = true;
            this.startPresentation(0);
            const current = NumCast(this.curPresentation.selectedDoc);
            this.gotoDocument(0, current);
        }
        this.curPresentation.presStatus = this.presStatus;
    }

    //The function that resets the presentation by removing every action done by it. It also
    //stops the presentaton.
    @action
    resetPresentation = () => {
        this.childrenDocs.forEach((doc: Doc) => {
            doc.opacity = 1;
            doc.viewScale = 1;
        });
        this.curPresentation.selectedDoc = 0;
        this.presStatus = false;
        this.curPresentation.presStatus = this.presStatus;
        if (this.childrenDocs.length === 0) {
            return;
        }
        DocumentManager.Instance.zoomIntoScale(this.childrenDocs[0], 1);
    }


    //The function that starts the presentation, also checking if actions should be applied
    //directly at start.
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


    /**
     * The function that is called to render either select for presentations, or title inputting.
     */
    renderSelectOrPresSelection = () => {
        if (this.PresTitleInputOpen || this.PresTitleChangeOpen) {
            return <input ref={(e) => this.titleInputElement = e!} type="text" className="presentationView-title" placeholder="Enter Name!" onKeyDown={this.submitPresentationTitle} />;
        } else {
            return (null);
        }
    }

    /**
     * The function that is called on enter press of title input. It gives the
     * new presentation the title user entered. If nothing is entered, gives a default title.
     */
    @action
    submitPresentationTitle = (e: React.KeyboardEvent) => {
        if (e.keyCode === 13) {
            let presTitle = this.titleInputElement!.value;
            this.titleInputElement!.value = "";
            if (this.PresTitleChangeOpen) {
                this.PresTitleChangeOpen = false;
                this.changePresentationTitle(presTitle);
            }
        }
    }
    /**
     * The function that is called to change title of presentation to what user entered.
     */
    @undoBatch
    changePresentationTitle = (newTitle: string) => {
        if (newTitle === "") {
            return;
        }
        this.curPresentation.title = newTitle;
    }

    addPressElem = (keyDoc: Doc, elem: PresentationElement) => {
        this.presElementsMappings.set(keyDoc, elem);
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        ContextMenu.Instance.addItem({ description: "Make Current Presentation", event: action(() => Doc.UserDoc().curPresentation = this.props.Document), icon: "asterisk" });
        ContextMenu.Instance.addItem({
            description: "Toggle Minimized Mode", event: action(() => {
                this.presMode = !this.presMode;
                if (this.presMode) this.props.addDocTab && this.props.addDocTab(this.props.Document, this.props.DataDoc, "close");
            }), icon: "asterisk"
        });
    }

    render() {

        let width = "100%"; //NumCast(this.curPresentation.width)
        return (
            <div className="presentationView-cont" onPointerEnter={action(() => !this.persistOpacity && (this.opacity = 1))} onContextMenu={this.specificContextMenu}
                onPointerLeave={action(() => !this.persistOpacity && (this.opacity = 0.4))}
                style={{ width: width, opacity: this.opacity, }}>
                <div className="presentation-buttons">
                    <button title="Back" className="presentation-button" onClick={this.back}><FontAwesomeIcon icon={"arrow-left"} /></button>
                    {this.renderPlayPauseButton()}
                    <button title="Next" className="presentation-button" onClick={this.next}><FontAwesomeIcon icon={"arrow-right"} /></button>
                </div>
                <input
                    type="checkbox"
                    onChange={action((e: React.ChangeEvent<HTMLInputElement>) => {
                        this.persistOpacity = e.target.checked;
                        this.opacity = this.persistOpacity ? 1 : 0.4;
                    })}
                    checked={this.persistOpacity}
                    style={{ position: "absolute", bottom: 5, left: 5 }}
                    onPointerEnter={action(() => this.labelOpacity = 1)}
                    onPointerLeave={action(() => this.labelOpacity = 0)}
                />
                <p style={{ position: "absolute", bottom: 1, left: 22, opacity: this.labelOpacity, transition: "0.7s opacity ease" }}>opacity {this.persistOpacity ? "persistent" : "on focus"}</p>
                <PresentationViewList
                    mainDocument={this.curPresentation}
                    deleteDocument={this.RemoveDoc}
                    gotoDocument={this.gotoDocument}
                    groupMappings={this.groupMappings}
                    PresElementsMappings={this.presElementsMappings}
                    setChildrenDocs={this.setChildrenDocs}
                    presStatus={this.presStatus}
                    presButtonBackUp={this.presButtonBackUp}
                    presGroupBackUp={this.presGroupBackUp}
                    removeDocByRef={this.removeDocByRef}
                    clearElemMap={() => this.presElementsMappings.clear()}
                />
            </div>
        );
    }


}