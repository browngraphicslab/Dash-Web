import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile as fileRegular } from '@fortawesome/free-regular-svg-icons';
import { faArrowUp, faFile as fileSolid, faFileDownload, faLocationArrow, faSearch, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { Utils, returnFalse, emptyFunction, returnOne } from "../../../Utils";
import { DragManager, dropActionType, SetupDrag } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { ContextMenu } from "../ContextMenu";
import { Transform } from "../../util/Transform";
import { DocumentView } from "../nodes/DocumentView";
import { DocumentType } from "../../documents/Documents";
import React = require("react");


library.add(faArrowUp);
library.add(fileSolid);
library.add(faLocationArrow);
library.add(fileRegular as any);
library.add(faSearch);
library.add(faArrowRight);

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
    OpenRight = 6

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
        this.selectedButtons = new Array(7);

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
        if (this.presElRef.current) {
            this.header = this.presElRef.current;
            this.createListDropTarget(this.presElRef.current);
        }
    }

    //Lifecycle function that makes sure button BackUp is received when not re-mounted bu re-rendered.
    async componentDidUpdate() {
        if (this.presElRef.current) {
            this.header = this.presElRef.current;
            this.createListDropTarget(this.presElRef.current);
        }
    }

    /**
     * Function that will be called to receive stored backUp for buttons
     */
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
            let newDoc = new Doc();
            let defaultBooleanArray: boolean[] = new Array(7);
            newDoc.selectedButtons = new List(defaultBooleanArray);
            newDoc.docId = this.props.document[Id];
            castedList.push(newDoc);
            this.backUpDoc = newDoc;
        }

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

    /**
     * Function that opens up the option to open a element on right when navigated,
     * instead of openening it as tab as default.
     */
    @action
    onRightTabClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (this.selectedButtons[buttonIndex.OpenRight]) {
            this.selectedButtons[buttonIndex.OpenRight] = false;
            // action maybe
        } else {
            this.selectedButtons[buttonIndex.OpenRight] = true;
        }
        this.autoSaveButtonChange(buttonIndex.OpenRight);
    }

    /**
     * Creating a drop target for drag and drop when called.
     */
    protected createListDropTarget = (ele: HTMLDivElement) => {
        this.listdropDisposer && this.listdropDisposer();
        if (ele) {
            this.listdropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.listDrop.bind(this) } });
        }
    }

    /**
     * Returns a local transformed coordinate array for given coordinates.
     */
    ScreenToLocalListTransform = (xCord: number, yCord: number) => {
        return [xCord, yCord];
    }

    /**
     * This method is called when a element is dropped on a already esstablished target.
     * It makes sure to do appropirate action depending on if the item is dropped before
     * or after the target.
     */
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
            await this.updateGroupsOnDrop(droppedDoc, de);
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

    /**
     * This method is called to update groups when the user drags and drops an
     * element to a different place. It follows the default behaviour and reconstructs
     * the groups in the way they would appear if clicked by user.
     */
    updateGroupsOnDrop = async (droppedDoc: Doc, de: DragManager.DropEvent) => {

        let x = this.ScreenToLocalListTransform(de.x, de.y);
        let rect = this.header!.getBoundingClientRect();
        let bounds = this.ScreenToLocalListTransform(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];

        let droppedDocIndex = this.props.allListElements.indexOf(droppedDoc);

        let dropIndexDiff = droppedDocIndex - this.props.index;

        //checking if the position it's dropped corresponds to current location with 3 cases.
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
            let groupArray = this.props.groupMappings.get(curDocGuid)!;

            if (droppedDocSelectedButtons[buttonIndex.Group]) {
                let groupIndexOfDrop = groupArray.indexOf(droppedDoc);
                let firstPart = groupArray.splice(0, groupIndexOfDrop);

                if (firstPart.length > 1) {
                    let newGroupGuid = Utils.GenerateGuid();
                    firstPart.forEach((doc: Doc) => doc.presentId = newGroupGuid);
                    this.props.groupMappings.set(newGroupGuid, firstPart);
                }
            }

            groupArray.splice(groupArray.indexOf(droppedDoc), 1);
            if (groupArray.length === 0) {
                this.props.groupMappings.delete(curDocGuid);
            }
            droppedDoc.presentId = Utils.GenerateGuid();

            //making sure to correct to groups after splicing, in case the dragged element
            //had the grouping on.
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

        //Case, when the dropped doc had the group button clicked.
        if (droppedDocSelectedButtons[buttonIndex.Group]) {
            if (before) {
                if (this.props.index > 0) {
                    let aboveDoc = this.props.allListElements[this.props.index - 1];
                    let aboveDocGuid = StrCast(aboveDoc.presentId);
                    if (this.props.groupMappings.has(aboveDocGuid)) {
                        this.protectOrderAndPush(aboveDocGuid, aboveDoc, droppedDoc);
                    } else {
                        this.createNewGroup(aboveDoc, droppedDoc, aboveDocGuid);
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
                    this.protectOrderAndPush(propsDocGuid, this.props.document, droppedDoc);

                } else {
                    this.createNewGroup(this.props.document, droppedDoc, propsDocGuid);
                }
            }


            //if the group button of the element was not clicked.
        } else {
            if (before) {
                if (this.props.index > 0) {

                    let aboveDoc = this.props.allListElements[this.props.index - 1];
                    let aboveDocGuid = StrCast(aboveDoc.presentId);
                    let aboveDocSelectedButtons: boolean[] = await this.getSelectedButtonsOfDoc(aboveDoc);


                    if (this.selectedButtons[buttonIndex.Group]) {
                        if (aboveDocSelectedButtons[buttonIndex.Group]) {
                            let aboveGroupArray = this.props.groupMappings.get(aboveDocGuid)!;
                            let propsDocPresId = StrCast(this.props.document.presentId);

                            this.halveGroupArray(aboveDoc, aboveGroupArray, droppedDoc, propsDocPresId);

                        } else {
                            let belowPresentId = StrCast(this.props.document.presentId);
                            let belowGroup = this.props.groupMappings.get(belowPresentId)!;
                            belowGroup.splice(belowGroup.indexOf(aboveDoc), 1);
                            belowGroup.unshift(droppedDoc);
                            droppedDoc.presentId = belowPresentId;
                            aboveDoc.presentId = Utils.GenerateGuid();
                        }


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

                            this.halveGroupArray(this.props.document, propsGroupArray, droppedDoc, belowDocGuid);

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

    /**
     * This method returns the selectedButtons boolean array of the passed in doc,
     * retrieving it from the back-up.
     */
    getSelectedButtonsOfDoc = async (paramDoc: Doc) => {
        let castedList = Cast(this.props.presButtonBackUp.selectedButtonDocs, listSpec(Doc));
        let foundSelectedButtons: boolean[] = new Array(7);

        //if this is the first time this doc mounts, push a doc for it to store
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

    //This is used to add dragging as an event.
    onPointerEnter = (e: React.PointerEvent): void => {
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

    //This is used to remove the dragging when dropped.
    onPointerLeave = (e: React.PointerEvent): void => {
        //to get currently selected presentation doc
        let selected = NumCast(this.props.mainDocument.selectedDoc, 0);

        this.header!.className = "presentationView-item";


        if (selected === this.props.index) {
            //this doc is selected
            this.header!.className = "presentationView-item presentationView-selected";

        }
        document.removeEventListener("pointermove", this.onDragMove, true);
    }

    /**
     * This method is passed in to be used when dragging a document.
     * It makes it possible to show dropping lines on drop targets.
     */
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

    /**
     * This method is passed in to on down event of presElement, so that drag and
     * drop can be completed with DragManager functionality.
     */
    @action
    move: DragManager.MoveFunction = (doc: Doc, target: Doc, addDoc) => {
        return this.props.document !== target && this.props.removeDocByRef(doc) && addDoc(doc);
    }

    /**
     * Helper method that gets called to divide a group array into two different groups
     * including the targetDoc in first part.
     * @param targetDoc document that is targeted as slicing point
     * @param propsGroupArray the array that gets divided into 2
     * @param droppedDoc the dropped document
     * @param belowDocGuid presentId of the belowGroup
     */
    private halveGroupArray(targetDoc: Doc, propsGroupArray: Doc[], droppedDoc: Doc, belowDocGuid: string) {
        let targetIndex = propsGroupArray.indexOf(targetDoc);
        let firstPart = propsGroupArray.slice(0, targetIndex + 1);
        let firstPartNewGuid = Utils.GenerateGuid();
        firstPart.forEach((doc: Doc) => doc.presentId = firstPartNewGuid);
        let secondPart = propsGroupArray.slice(targetIndex + 1);
        secondPart.unshift(droppedDoc);
        droppedDoc.presentId = belowDocGuid;
        this.props.groupMappings.set(firstPartNewGuid, firstPart);
        this.props.groupMappings.set(belowDocGuid, secondPart);
    }

    /**
     * Helper method that creates a new group, pushing above document first,
     * and dropped document second.
     * @param aboveDoc the document above dropped document
     * @param droppedDoc the dropped document itself
     * @param aboveDocGuid above document's presentId
     */
    private createNewGroup(aboveDoc: Doc, droppedDoc: Doc, aboveDocGuid: string) {
        let newGroup: Doc[] = [];
        newGroup.push(aboveDoc);
        newGroup.push(droppedDoc);
        droppedDoc.presentId = aboveDocGuid;
        this.props.groupMappings.set(aboveDocGuid, newGroup);
    }

    /**
      * Helper method that finds the above document's group, and pushes the
      * dropped document into that group, protecting the visual order of the
      * presentation elements.
      * @param aboveDoc the document above dropped document
      * @param droppedDoc the dropped document itself
      * @param aboveDocGuid above document's presentId
      */
    private protectOrderAndPush(aboveDocGuid: string, aboveDoc: Doc, droppedDoc: Doc) {
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
    }
    /**
     * This function is a getter to get if a document is in previewMode.
     */
    private get embedInline() {
        return BoolCast(this.props.document.embedOpen);
    }

    /**
     * This function sets document in presentation preview mode as the given value.
     */
    private set embedInline(value: boolean) {
        this.props.document.embedOpen = value;
    }

    /**
     * The function that recreates that context menu of presentation elements.
     */
    onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        ContextMenu.Instance.addItem({ description: this.embedInline ? "Collapse Inline" : "Expand Inline", event: () => this.embedInline = !this.embedInline, icon: "expand" });
        ContextMenu.Instance.displayMenu(e.clientX, e.clientY);
    }

    /**
     * The function that is responsible for rendering the a preview or not for this
     * presentation element.
     */
    renderEmbeddedInline = () => {
        if (!this.embedInline) {
            return (null);
        }

        let propDocWidth = NumCast(this.props.document.nativeWidth);
        let propDocHeight = NumCast(this.props.document.nativeHeight);
        let scale = () => {
            let newScale = 175 / NumCast(this.props.document.nativeWidth, 175);
            return newScale;
        };
        return (
            <div style={{
                position: "relative",
                height: propDocHeight === 0 ? 100 : propDocHeight * scale(),
                width: propDocWidth === 0 ? "auto" : propDocWidth * scale(),
                marginTop: 15

            }}>
                <DocumentView
                    fitToBox={StrCast(this.props.document.type).indexOf(DocumentType.COL) !== -1}
                    Document={this.props.document}
                    addDocument={returnFalse}
                    removeDocument={returnFalse}
                    ScreenToLocalTransform={Transform.Identity}
                    addDocTab={returnFalse}
                    renderDepth={1}
                    PanelWidth={() => 350}
                    PanelHeight={() => 90}
                    focus={emptyFunction}
                    selectOnLoad={false}
                    parentActive={returnFalse}
                    whenActiveChanged={returnFalse}
                    bringToFront={emptyFunction}
                    zoomToScale={emptyFunction}
                    getScale={returnOne}
                    ContainingCollectionView={undefined}
                    ContentScaling={scale}
                />
                <div style={{
                    width: " 100%",
                    height: " 100%",
                    position: "absolute",
                    left: 0,
                    top: 0,
                    background: "transparent",
                    zIndex: 2,

                }}></div>
            </div>
        );
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
        let dropAction = StrCast(this.props.document.dropAction) as dropActionType;
        let onItemDown = SetupDrag(this.presElRef, () => p.document, this.move, dropAction, this.props.mainDocument[Id], true);
        return (
            <div className={className} onContextMenu={this.onContextMenu} key={p.document[Id] + p.index}
                ref={this.presElRef}
                onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}
                onPointerDown={onItemDown}
                style={{
                    outlineColor: "maroon",
                    outlineStyle: "dashed",
                    outlineWidth: BoolCast(p.document.libraryBrush) ? `1px` : "0px",
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
                <button title="Open Right" className={this.selectedButtons[buttonIndex.OpenRight] ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onRightTabClick}><FontAwesomeIcon icon={"arrow-right"} /></button>

                <br />
                {this.renderEmbeddedInline()}
            </div>
        );
    }
}