import { observer } from "mobx-react";
import React = require("react");
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { NumCast, BoolCast, StrCast, Cast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import { observable, action, computed, runInAction } from "mobx";
import "./PresentationView.scss";
import { Utils } from "../../../Utils";
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile as fileSolid, faFileDownload, faLocationArrow, faArrowUp, faSearch } from '@fortawesome/free-solid-svg-icons';
import { faFile as fileRegular } from '@fortawesome/free-regular-svg-icons';
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { DragManager, SetupDrag, dropActionType } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { indexOf } from "typescript-collections/dist/lib/arrays";
import { map } from "bluebird";


library.add(faArrowUp);
library.add(fileSolid);
library.add(faLocationArrow);
library.add(faSearch);
library.add(fileRegular);

interface PresentationElementProps {
    mainDocument: Doc;
    document: Doc;
    index: number;
    deleteDocument(index: number): void;
    gotoDocument(index: number, fromDoc: number): Promise<void>;
    allListElements: Doc[];
    groupMappings: Map<String, Doc[]>;
    presStatus: boolean;
    presButtonBackUp: Doc;
    presGroupBackUp: Doc;
    removeDocByRef(doc: Doc): boolean;
    PresElementsMappings: Map<Doc, PresentationElement>;


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

    @observable private selectedButtons: boolean[];
    private header?: HTMLDivElement | undefined;
    private listdropDisposer?: DragManager.DragDropDisposer;
    private presElRef: React.RefObject<HTMLDivElement>;
    private backUpDoc: Doc | undefined;





    constructor(props: PresentationElementProps) {
        super(props);
        this.selectedButtons = new Array(6);

        this.presElRef = React.createRef();
    }


    componentWillUnmount() {
        this.listdropDisposer && this.listdropDisposer();
    }


    /**
     * Getter to get the status of the buttons.
     */
    @computed
    get selected() {
        return this.selectedButtons;
    }

    //Lifecycle function that makes sure that button BackUp is received when mounted.
    async componentDidMount() {
        this.receiveButtonBackUp();
        //this.props.setPresElementsMappings(this.props.document, this);
        if (this.presElRef.current) {
            this.header = this.presElRef.current;
            this.createListDropTarget(this.presElRef.current);
        }
    }

    //Lifecycle function that makes sure button BackUp is received when not re-mounted bu re-rendered.
    async componentDidUpdate() {
        //this.receiveButtonBackUp();
        //this.props.setPresElementsMappings(this.props.document, this);
        // if (!this.props.PresElementsMappings.has(this.props.document)) {
        //     this.props.PresElementsMappings.set(this.props.document, this);
        // }

        if (this.presElRef.current) {
            this.header = this.presElRef.current;
            this.createListDropTarget(this.presElRef.current);
        }
    }

    receiveButtonBackUp = async () => {

        //get the list that stores docs that keep track of buttons
        let castedList = Cast(this.props.presButtonBackUp.selectedButtonDocs, listSpec(Doc));
        if (!castedList) {
            this.props.presButtonBackUp.selectedButtonDocs = castedList = new List<Doc>();
        }

        let foundDoc: boolean = false;

        //if this is the first time this doc mounts, push a doc for it to store

        for (let doc of castedList) {
            let curDoc = await doc;
            let curDocId = StrCast(curDoc.docId);
            if (curDocId === this.props.document[Id]) {
                //console.log(`curDocId: ${curDocId}, document[id]: ${this.props.document[Id]}`);
                let selectedButtonOfDoc = Cast(curDoc.selectedButtons, listSpec("boolean"), null);
                if (selectedButtonOfDoc !== undefined) {
                    runInAction(() => this.selectedButtons = selectedButtonOfDoc);
                    foundDoc = true;
                    this.backUpDoc = curDoc;
                    break;
                }
            }
        }

        if (!foundDoc) {
            //console.log("Adding a new fucker!!");
            let newDoc = new Doc();
            let defaultBooleanArray: boolean[] = new Array(6);
            newDoc.selectedButtons = new List(defaultBooleanArray);
            newDoc.docId = this.props.document[Id];
            castedList.push(newDoc);
            this.backUpDoc = newDoc;
        }

        // if (castedList.length <= this.props.index) {
        //     let newDoc = new Doc();
        //     let defaultBooleanArray: boolean[] = new Array(6);
        //     newDoc.selectedButtons = new List(defaultBooleanArray);
        //     castedList.push(newDoc);
        //     //otherwise update the selected buttons depending on storage.
        // } else {
        //     let curDoc: Doc = await castedList[this.props.index];
        //     let selectedButtonOfDoc = Cast(curDoc.selectedButtons, listSpec("boolean"), null);
        //     if (selectedButtonOfDoc !== undefined) {
        //         runInAction(() => this.selectedButtons = selectedButtonOfDoc);
        //     }
        // }

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
        this.autoSaveGroupChanges();

    }


    /**
     * This function is called at the end of each group update to update the group updates.
     */
    @action
    autoSaveGroupChanges = () => {
        let castedList: List<Doc> = new List<Doc>();
        this.props.presGroupBackUp.groupDocs = castedList;
        this.props.groupMappings.forEach((docArray: Doc[], id: String) => {
            //create a new doc for each group
            let newGroupDoc = new Doc();
            castedList.push(newGroupDoc);
            //store the id of the group in the doc
            newGroupDoc.presentIdStore = id.toString();
            //store the doc array which represents the group in the doc
            newGroupDoc.grouping = new List(docArray);
        });

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
        this.autoSaveButtonChange(buttonIndex.Group);

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

    /**
     * This function is called to get the updates for the changed buttons.
     */
    @action
    autoSaveButtonChange = async (index: buttonIndex) => {
        // let castedList = (await DocListCastAsync(this.props.presButtonBackUp.selectedButtonDocs))!;
        // // let hasBackupDoc: boolean = false;
        // castedList.forEach((doc: Doc) => {
        //     let docId = StrCast(doc.docId);
        //     if (docId === this.props.document[Id]) {
        //         doc.selectedButtons = new List(this.selectedButtons);
        //     }
        // });
        // castedList[this.props.index].selectedButtons = new List(this.selectedButtons);
        if (this.backUpDoc) {
            this.backUpDoc.selectedButtons = new List(this.selectedButtons);
        }
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
            if (this.selectedButtons[buttonIndex.Show]) {
                this.selectedButtons[buttonIndex.Show] = false;
            }
            this.selectedButtons[buttonIndex.Navigate] = true;
            const current = NumCast(this.props.mainDocument.selectedDoc);
            if (current === this.props.index) {
                this.props.gotoDocument(this.props.index, this.props.index);
            }
        }

        this.autoSaveButtonChange(buttonIndex.Navigate);

    }

    /**
    * The function that is called on click to turn zoom option of docs on/off.
    */
    @action
    onZoomDocumentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (this.selectedButtons[buttonIndex.Show]) {
            this.selectedButtons[buttonIndex.Show] = false;
            this.props.document.viewScale = 1;

        } else {
            if (this.selectedButtons[buttonIndex.Navigate]) {
                this.selectedButtons[buttonIndex.Navigate] = false;
            }
            this.selectedButtons[buttonIndex.Show] = true;
            const current = NumCast(this.props.mainDocument.selectedDoc);
            if (current === this.props.index) {
                this.props.gotoDocument(this.props.index, this.props.index);
            }
        }

        this.autoSaveButtonChange(buttonIndex.Show);

    }

    protected createListDropTarget = (ele: HTMLDivElement) => {
        this.listdropDisposer && this.listdropDisposer();
        if (ele) {
            this.listdropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.listDrop.bind(this) } });
        }
    }

    ScreenToLocalListTransform = (xCord: number, yCord: number) => {
        // let scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        // let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        return [xCord, yCord];
    }


    listDrop = async (e: Event, de: DragManager.DropEvent) => {
        let x = this.ScreenToLocalListTransform(de.x, de.y);
        let rect = this.header!.getBoundingClientRect();
        let bounds = this.ScreenToLocalListTransform(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        if (de.data instanceof DragManager.DocumentDragData) {
            let addDoc = (doc: Doc) => Doc.AddDocToList(this.props.mainDocument, "data", doc, this.props.document, before);
            e.stopPropagation();
            //where does treeViewId come from
            let movedDocs = (de.data.options === this.props.mainDocument[Id] ? de.data.draggedDocuments : de.data.droppedDocuments);
            //console.log("How is this causing an issue");
            let droppedDoc: Doc = de.data.droppedDocuments[0];
            await this.updateGroupsOnDrop2(droppedDoc, de);
            document.removeEventListener("pointermove", this.onDragMove, true);
            return (de.data.dropAction || de.data.userDropAction) ?
                de.data.droppedDocuments.reduce((added: boolean, d: Doc) => Doc.AddDocToList(this.props.mainDocument, "data", d, this.props.document, before) || added, false)
                : (de.data.moveDocument) ?
                    movedDocs.reduce((added: boolean, d: Doc) => de.data.moveDocument(d, this.props.document, addDoc) || added, false)
                    : de.data.droppedDocuments.reduce((added: boolean, d: Doc) => Doc.AddDocToList(this.props.mainDocument, "data", d, this.props.document, before), false);
        }
        document.removeEventListener("pointermove", this.onDragMove, true);

        return false;
    }

    updateGroupsOnDrop = async (droppedDoc: Doc) => {
        let p = this.props;
        let droppedDocSelectedButtons: boolean[] = await this.getSelectedButtonsOfDoc(droppedDoc);
        let droppedDocIndex = this.props.allListElements.indexOf(droppedDoc);
        let curDocGuid = StrCast(droppedDoc.presentId, null);
        if (droppedDocSelectedButtons[buttonIndex.Group]) {
            if (curDocGuid) {
                if (p.groupMappings.has(curDocGuid)) {
                    console.log("Splicing from a group");
                    let groupArray = this.props.groupMappings.get(curDocGuid)!;
                    groupArray.splice(groupArray.indexOf(droppedDoc), 1);
                    if (groupArray.length === 0) {
                        this.props.groupMappings.delete(curDocGuid);
                    }
                    droppedDoc.presentId = Utils.GenerateGuid();
                }
            }
            let aboveDocIndex: number;
            if (droppedDocIndex >= 1) {
                aboveDocIndex = droppedDocIndex - 1;

                let aboveDoc: Doc = this.props.allListElements[aboveDocIndex];
                let aboveDocGuid = StrCast(aboveDoc.presentId, null);
                console.log("Above document: ", aboveDoc, " has presentId: ", aboveDocGuid);
                console.log("Dropped document: ", droppedDoc, " has presentId: ", curDocGuid);

                if (p.groupMappings.has(aboveDocGuid)) {
                    p.groupMappings.get(aboveDocGuid)!.push(droppedDoc);
                    droppedDoc.presentId = aboveDocGuid;
                    console.log("First case got called!");
                } else {
                    let newGroup: Doc[] = [];
                    newGroup.push(p.document);
                    newGroup.push(droppedDoc);
                    droppedDoc.presentId = aboveDocGuid;
                    p.groupMappings.set(aboveDocGuid, newGroup);
                    console.log("Second case got called!");
                }
            }
        } else {

            if (p.groupMappings.has(curDocGuid)) {
                droppedDoc.presentId = Utils.GenerateGuid();
            }
            if (droppedDocIndex < this.props.allListElements.length - 1) {
                let belowDoc = this.props.allListElements[droppedDocIndex + 1];
                let belowDocSelectedButtons: boolean[] = await this.getSelectedButtonsOfDoc(belowDoc);

                if (belowDocSelectedButtons[buttonIndex.Group]) {

                    if (curDocGuid) {
                        if (p.groupMappings.has(curDocGuid)) {
                            console.log("Splicing from a group");
                            let groupArray = this.props.groupMappings.get(curDocGuid)!;
                            groupArray.splice(groupArray.indexOf(droppedDoc), 1);
                            droppedDoc.presentId = Utils.GenerateGuid();
                        }
                    }

                    if (droppedDocIndex >= 1) {
                        let aboveDocIndex = droppedDocIndex - 1;

                        let aboveDoc: Doc = this.props.allListElements[aboveDocIndex];
                        let aboveDocGuid = StrCast(aboveDoc.presentId, null);
                        let aboveGroupArray = this.props.groupMappings.get(aboveDocGuid)!;
                        let aboveDocSelectedButtons: boolean[] = await this.getSelectedButtonsOfDoc(aboveDoc);

                        if (aboveDocSelectedButtons[buttonIndex.Group]) {

                            let targetIndex = aboveGroupArray.indexOf(aboveDoc);
                            let firstPart = aboveGroupArray.slice(0, targetIndex + 1);
                            let firstPartNewGuid = Utils.GenerateGuid();
                            firstPart.forEach((doc: Doc) => doc.presentId = firstPartNewGuid);
                            let secondPart = aboveGroupArray.slice(targetIndex + 1);
                            p.groupMappings.set(StrCast(aboveDoc.presentId, Utils.GenerateGuid()), firstPart);
                            p.groupMappings.set(StrCast(belowDoc.presentId, Utils.GenerateGuid()), secondPart);

                        } else {
                            let belowDocPresentId = StrCast(belowDoc.presentId);
                            let groupArray: Doc[] = this.props.groupMappings.get(belowDocPresentId)!;
                            groupArray.splice(groupArray.indexOf(aboveDoc), 1);
                            aboveDoc.presentId = Utils.GenerateGuid();
                            droppedDoc.presentId = belowDocPresentId;
                            groupArray.push(droppedDoc);
                        }

                    }
                }



            }
        }

        console.log("New Groups: ", p.groupMappings);
    }

    updateGroupsOnDrop2 = async (droppedDoc: Doc, de: DragManager.DropEvent) => {

        let x = this.ScreenToLocalListTransform(de.x, de.y);
        let rect = this.header!.getBoundingClientRect();
        let bounds = this.ScreenToLocalListTransform(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];

        let droppedDocIndex = this.props.allListElements.indexOf(droppedDoc);

        let dropIndexDiff = droppedDocIndex - this.props.index;

        if (droppedDocIndex === this.props.index) {
            return;
        }

        if (dropIndexDiff === 1 && !before) {
            return;
        }
        if (dropIndexDiff === -1 && before) {
            return;
        }




        let p = this.props;
        let droppedDocSelectedButtons: boolean[] = await this.getSelectedButtonsOfDoc(droppedDoc);
        let curDocGuid = StrCast(droppedDoc.presentId, null);





        //Splicing the doc from its current group, since it's moved
        if (p.groupMappings.has(curDocGuid)) {
            console.log("Splicing from a group");
            let groupArray = this.props.groupMappings.get(curDocGuid)!;

            if (droppedDocSelectedButtons[buttonIndex.Group]) {
                let groupIndexOfDrop = groupArray.indexOf(droppedDoc);
                let firstPart = groupArray.splice(0, groupIndexOfDrop);
                //let secondPart = groupArray.slice(groupIndexOfDrop + 1);

                if (firstPart.length > 1) {
                    let newGroupGuid = Utils.GenerateGuid();
                    firstPart.forEach((doc: Doc) => doc.presentId = newGroupGuid);
                    this.props.groupMappings.set(newGroupGuid, firstPart);
                }
            }

            //Error here: You Should splice the beforehand things as well, if present!!
            groupArray.splice(groupArray.indexOf(droppedDoc), 1);
            if (groupArray.length === 0) {
                this.props.groupMappings.delete(curDocGuid);
            }
            droppedDoc.presentId = Utils.GenerateGuid();

            //let droppedDocIndex = this.props.allListElements.indexOf(droppedDoc);
            let indexOfBelow = droppedDocIndex + 1;
            if (indexOfBelow < this.props.allListElements.length && indexOfBelow > 1) {
                let selectedButtonsOrigBelow: boolean[] = await this.getSelectedButtonsOfDoc(this.props.allListElements[indexOfBelow]);
                let aboveBelowDoc: Doc = this.props.allListElements[droppedDocIndex - 1];
                let aboveBelowDocSelectedButtons: boolean[] = await this.getSelectedButtonsOfDoc(aboveBelowDoc);
                let belowDoc: Doc = this.props.allListElements[indexOfBelow];
                let belowDocPresId = StrCast(belowDoc.presentId);

                if (selectedButtonsOrigBelow[buttonIndex.Group]) {
                    let belowDocGroup: Doc[] = this.props.groupMappings.get(belowDocPresId)!;
                    if (aboveBelowDocSelectedButtons[buttonIndex.Group]) {
                        let aboveBelowDocPresId = StrCast(aboveBelowDoc.presentId);
                        if (this.props.groupMappings.has(aboveBelowDocPresId)) {
                            let aboveBelowDocGroup: Doc[] = this.props.groupMappings.get(aboveBelowDocPresId)!;
                            aboveBelowDocGroup.push(...belowDocGroup);
                            this.props.groupMappings.delete(belowDocPresId);
                            belowDocGroup.forEach((doc: Doc) => doc.presentId = aboveBelowDocPresId);

                        }
                    } else {
                        belowDocGroup.unshift(aboveBelowDoc);
                        aboveBelowDoc.presentId = belowDocPresId;
                    }


                }
            }

        }


        if (droppedDocSelectedButtons[buttonIndex.Group]) {

            if (before) {
                if (this.props.index > 0) {
                    let aboveDoc = this.props.allListElements[this.props.index - 1];
                    let aboveDocGuid = StrCast(aboveDoc.presentId);
                    if (this.props.groupMappings.has(aboveDocGuid)) {
                        let groupArray = this.props.groupMappings.get(aboveDocGuid)!;
                        let tempStack: Doc[] = [];
                        while (groupArray[groupArray.length - 1] !== aboveDoc) {
                            tempStack.push(groupArray.pop()!);
                        }
                        groupArray.push(droppedDoc);
                        droppedDoc.presentId = aboveDocGuid;
                        while (tempStack.length !== 0) {
                            groupArray.push(tempStack.pop()!);
                        }
                    } else {
                        let newGroup: Doc[] = [];
                        newGroup.push(aboveDoc);
                        newGroup.push(droppedDoc);
                        droppedDoc.presentId = aboveDocGuid;
                        p.groupMappings.set(aboveDocGuid, newGroup);
                    }
                } else {
                    let propsPresId = StrCast(this.props.document.presentId);
                    if (this.selectedButtons[buttonIndex.Group]) {
                        let propsArray = this.props.groupMappings.get(propsPresId)!;
                        propsArray.unshift(droppedDoc);
                        droppedDoc.presentId = propsPresId;
                    }
                }
            } else {
                let propsDocGuid = StrCast(this.props.document.presentId);
                if (this.props.groupMappings.has(propsDocGuid)) {
                    let groupArray = this.props.groupMappings.get(propsDocGuid)!;
                    let tempStack: Doc[] = [];

                    while (groupArray[groupArray.length - 1] !== this.props.document) {
                        tempStack.push(groupArray.pop()!);
                    }
                    groupArray.push(droppedDoc);
                    droppedDoc.presentId = propsDocGuid;
                    while (tempStack.length !== 0) {
                        groupArray.push(tempStack.pop()!);
                    }

                } else {
                    let newGroup: Doc[] = [];
                    newGroup.push(this.props.document);
                    newGroup.push(droppedDoc);
                    droppedDoc.presentId = propsDocGuid;
                    p.groupMappings.set(propsDocGuid, newGroup);
                }
            }



        } else {
            if (before) {
                if (this.props.index > 0) {

                    let aboveDoc = this.props.allListElements[this.props.index - 1];
                    let aboveDocGuid = StrCast(aboveDoc.presentId);
                    let aboveDocSelectedButtons: boolean[] = await this.getSelectedButtonsOfDoc(aboveDoc);


                    if (this.selectedButtons[buttonIndex.Group]) {
                        if (aboveDocSelectedButtons[buttonIndex.Group]) {
                            let aboveGroupArray = this.props.groupMappings.get(aboveDocGuid)!;


                            let targetIndex = aboveGroupArray.indexOf(aboveDoc);
                            let firstPart = aboveGroupArray.slice(0, targetIndex + 1);
                            let firstPartNewGuid = Utils.GenerateGuid();
                            firstPart.forEach((doc: Doc) => doc.presentId = firstPartNewGuid);
                            let secondPart = aboveGroupArray.slice(targetIndex + 1);
                            secondPart.unshift(droppedDoc);
                            droppedDoc.presentId = StrCast(this.props.document.presentId);
                            p.groupMappings.set(StrCast(aboveDoc.presentId, Utils.GenerateGuid()), firstPart);
                            p.groupMappings.set(StrCast(this.props.document.presentId, Utils.GenerateGuid()), secondPart);


                        } else {
                            let belowPresentId = StrCast(this.props.document.presentId);
                            let belowGroup = this.props.groupMappings.get(belowPresentId)!;
                            belowGroup.splice(belowGroup.indexOf(aboveDoc), 1);
                            belowGroup.unshift(droppedDoc);
                            droppedDoc.presentId = belowPresentId;
                            aboveDoc.presentId = Utils.GenerateGuid();
                        }

                        //


                    }
                } else {
                    let propsPresId = StrCast(this.props.document.presentId);
                    if (this.selectedButtons[buttonIndex.Group]) {
                        let propsArray = this.props.groupMappings.get(propsPresId)!;
                        propsArray.unshift(droppedDoc);
                        droppedDoc.presentId = propsPresId;
                    }
                }
            } else {
                if (this.props.index < this.props.allListElements.length - 1) {
                    let belowDoc = this.props.allListElements[this.props.index + 1];
                    let belowDocGuid = StrCast(belowDoc.presentId);
                    let belowDocSelectedButtons: boolean[] = await this.getSelectedButtonsOfDoc(belowDoc);

                    let propsDocGuid = StrCast(this.props.document.presentId);

                    if (belowDocSelectedButtons[buttonIndex.Group]) {
                        let belowGroupArray = this.props.groupMappings.get(belowDocGuid)!;
                        if (this.selectedButtons[buttonIndex.Group]) {

                            let propsGroupArray = this.props.groupMappings.get(propsDocGuid)!;
                            let targetIndex = propsGroupArray.indexOf(this.props.document);
                            let firstPart = propsGroupArray.slice(0, targetIndex + 1);
                            let firstPartNewGuid = Utils.GenerateGuid();
                            firstPart.forEach((doc: Doc) => doc.presentId = firstPartNewGuid);
                            let secondPart = propsGroupArray.slice(targetIndex + 1);
                            secondPart.unshift(droppedDoc);
                            droppedDoc.presentId = StrCast(this.props.document.presentId);
                            p.groupMappings.set(firstPartNewGuid, firstPart);
                            p.groupMappings.set(StrCast(belowDocGuid, Utils.GenerateGuid()), secondPart);

                        } else {
                            belowGroupArray.splice(belowGroupArray.indexOf(this.props.document), 1);
                            this.props.document.presentId = Utils.GenerateGuid();
                            belowGroupArray.unshift(droppedDoc);
                            droppedDoc.presentId = belowDocGuid;
                        }
                    }

                }
            }
        }
        this.autoSaveGroupChanges();

    }

    getSelectedButtonsOfDoc = async (paramDoc: Doc) => {
        let p = this.props;

        let castedList = Cast(this.props.presButtonBackUp.selectedButtonDocs, listSpec(Doc));
        let foundSelectedButtons: boolean[] = new Array(6);
        //if this is the first time this doc mounts, push a doc for it to store
        // await castedList!.forEach(async (doc) => {
        //     let curDoc = await doc;
        //     let curDocId = StrCast(curDoc.docId);
        //     if (curDocId === paramDoc[Id]) {
        //         foundSelectedButtons = Cast(curDoc.selectedButtons, listSpec("boolean"), null);
        //         return;
        //     }
        // });

        for (let doc of castedList!) {
            let curDoc = await doc;
            let curDocId = StrCast(curDoc.docId);
            if (curDocId === paramDoc[Id]) {
                let selectedButtonOfDoc = Cast(curDoc.selectedButtons, listSpec("boolean"), null);
                if (selectedButtonOfDoc !== undefined) {
                    return selectedButtonOfDoc;
                }
            }
        }

        return foundSelectedButtons;

    }

    onPointerEnter = (e: React.PointerEvent): void => {
        this.props.document.libraryBrush = true;
        if (e.buttons === 1 && SelectionManager.GetIsDragging()) {
            let selected = NumCast(this.props.mainDocument.selectedDoc, 0);

            this.header!.className = "presentationView-item";


            if (selected === this.props.index) {
                //this doc is selected
                this.header!.className = "presentationView-item presentationView-selected";
            }
            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        this.props.document.libraryBrush = false;
        //to get currently selected presentation doc
        let selected = NumCast(this.props.mainDocument.selectedDoc, 0);

        this.header!.className = "presentationView-item";


        if (selected === this.props.index) {
            //this doc is selected
            this.header!.className = "presentationView-item presentationView-selected";

        }
        document.removeEventListener("pointermove", this.onDragMove, true);
    }

    onDragMove = (e: PointerEvent): void => {
        this.props.document.libraryBrush = false;
        let x = this.ScreenToLocalListTransform(e.clientX, e.clientY);
        let rect = this.header!.getBoundingClientRect();
        let bounds = this.ScreenToLocalListTransform(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        this.header!.className = "presentationView-item";
        if (before) {
            this.header!.className += " presentationView-item-above";
        }
        else if (!before) {
            this.header!.className += " presentationView-item-below";
        }
        e.stopPropagation();
    }

    @action
    move: DragManager.MoveFunction = (doc: Doc, target: Doc, addDoc) => {
        return this.props.document !== target && this.props.removeDocByRef(doc) && addDoc(doc);
    }



    render() {
        let p = this.props;
        let title = p.document.title;

        //to get currently selected presentation doc
        let selected = NumCast(p.mainDocument.selectedDoc, 0);

        let className = " presentationView-item";
        if (selected === p.index) {
            //this doc is selected
            className += " presentationView-selected";
        }
        let onEnter = (e: React.PointerEvent) => { p.document.libraryBrush = true; };
        let onLeave = (e: React.PointerEvent) => { p.document.libraryBrush = false; };
        let dropAction = StrCast(this.props.document.dropAction) as dropActionType;
        let onItemDown = SetupDrag(this.presElRef, () => p.document, this.move, dropAction, this.props.mainDocument[Id], true);
        return (
            <div className={className} key={p.document[Id] + p.index}
                ref={this.presElRef}
                onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}
                onPointerDown={onItemDown}
                style={{
                    outlineColor: "maroon",
                    outlineStyle: "dashed",
                    outlineWidth: BoolCast(p.document.libraryBrush, false) || BoolCast(p.document.protoBrush, false) ? `1px` : "0px",
                }}
                onClick={e => { p.gotoDocument(p.index, NumCast(this.props.mainDocument.selectedDoc)); e.stopPropagation(); }}>
                <strong className="presentationView-name">
                    {`${p.index + 1}. ${title}`}
                </strong>
                <button className="presentation-icon" onPointerDown={(e) => e.stopPropagation()} onClick={e => { this.props.deleteDocument(p.index); e.stopPropagation(); }}>X</button>
                <br></br>
                <button title="Zoom" className={this.selectedButtons[buttonIndex.Show] ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={this.selectedButtons[buttonIndex.Navigate] ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Document Till Presented" className={this.selectedButtons[buttonIndex.HideTillPressed] ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade Document After Presented" className={this.selectedButtons[buttonIndex.FadeAfter] ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} color={"gray"} /></button>
                <button title="Hide Document After Presented" className={this.selectedButtons[buttonIndex.HideAfter] ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Group With Up" className={this.selectedButtons[buttonIndex.Group] ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
                    e.stopPropagation();
                    this.changeGroupStatus();
                    this.onGroupClick(p.document, p.index, this.selectedButtons[buttonIndex.Group]);
                }}> <FontAwesomeIcon icon={"arrow-up"} /> </button>

            </div>
        );
    }
}