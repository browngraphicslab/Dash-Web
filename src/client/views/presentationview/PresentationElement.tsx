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

        if (this.presElRef.current) {
            this.header = this.presElRef.current;
            this.createListDropTarget(this.presElRef.current);
        }
    }

    //Lifecycle function that makes sure button BackUp is received when not re-mounted bu re-rendered.
    async componentDidUpdate() {
        this.receiveButtonBackUp();
    }

    receiveButtonBackUp = async () => {

        //get the list that stores docs that keep track of buttons
        let castedList = Cast(this.props.presButtonBackUp.selectedButtonDocs, listSpec(Doc));
        if (!castedList) {
            this.props.presButtonBackUp.selectedButtonDocs = castedList = new List<Doc>();
        }
        //if this is the first time this doc mounts, push a doc for it to store
        if (castedList.length <= this.props.index) {
            let newDoc = new Doc();
            let defaultBooleanArray: boolean[] = new Array(6);
            newDoc.selectedButtons = new List(defaultBooleanArray);
            castedList.push(newDoc);
            //otherwise update the selected buttons depending on storage.
        } else {
            let curDoc: Doc = await castedList[this.props.index];
            let selectedButtonOfDoc = Cast(curDoc.selectedButtons, listSpec("boolean"), null);
            if (selectedButtonOfDoc !== undefined) {
                runInAction(() => this.selectedButtons = selectedButtonOfDoc);
            }
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
        let castedList = (await DocListCastAsync(this.props.presButtonBackUp.selectedButtonDocs))!;
        castedList[this.props.index].selectedButtons = new List(this.selectedButtons);

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
        let scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        return [yCord + scrollTop, xCord + scrollLeft];
    }


    listDrop = (e: Event, de: DragManager.DropEvent) => {
        let x = this.ScreenToLocalListTransform(de.x, de.y);
        let rect = this.header!.getBoundingClientRect();
        let bounds = this.ScreenToLocalListTransform(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        if (de.data instanceof DragManager.DocumentDragData) {
            let addDoc = (doc: Doc) => Doc.AddDocToList(this.props.mainDocument, "data", doc, this.props.document, before);
            e.stopPropagation();
            //where does treeViewId come from
            let movedDocs = (de.data.options === this.props.mainDocument[Id] ? de.data.draggedDocuments : de.data.droppedDocuments);
            return (de.data.dropAction || de.data.userDropAction) ?
                de.data.droppedDocuments.reduce((added: boolean, d: Doc) => Doc.AddDocToList(this.props.mainDocument, "data", d, this.props.document, before) || added, false)
                : (de.data.moveDocument) ?
                    movedDocs.reduce((added: boolean, d: Doc) => de.data.moveDocument(d, this.props.document, addDoc) || added, false)
                    : de.data.droppedDocuments.reduce((added: boolean, d: Doc) => Doc.AddDocToList(this.props.mainDocument, "data", d, this.props.document, before), false);
        }
        return false;
    }

    onPointerEnter = (e: React.PointerEvent): void => {
        //this.props.document.libraryBrush = true;
        if (e.buttons === 1 && SelectionManager.GetIsDragging()) {
            //this.header!.className = "treeViewItem-header";
            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        this.props.document.libraryBrush = false;
        //this.header!.className = "treeViewItem-header";
        document.removeEventListener("pointermove", this.onDragMove, true);
    }

    onDragMove = (e: PointerEvent): void => {
        this.props.document.libraryBrush = false;
        let x = this.ScreenToLocalListTransform(e.clientX, e.clientY);
        let rect = this.header!.getBoundingClientRect();
        let bounds = this.ScreenToLocalListTransform(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        this.header!.className = "treeViewItem-header";
        // if (before) this.header!.className += " treeViewItem-header-above";
        // else if (!before) this.header!.className += " treeViewItem-header-below";
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

        let className = "presentationView-item";
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
                onPointerEnter={onEnter} onPointerLeave={onLeave}
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
                <button className="presentation-icon" onClick={e => { this.props.deleteDocument(p.index); e.stopPropagation(); }}>X</button>
                <br></br>
                <button title="Zoom" className={this.selectedButtons[buttonIndex.Show] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={this.selectedButtons[buttonIndex.Navigate] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Document Till Presented" className={this.selectedButtons[buttonIndex.HideTillPressed] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade Document After Presented" className={this.selectedButtons[buttonIndex.FadeAfter] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} color={"gray"} /></button>
                <button title="Hide Document After Presented" className={this.selectedButtons[buttonIndex.HideAfter] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Group With Up" className={this.selectedButtons[buttonIndex.Group] ? "presentation-interaction-selected" : "presentation-interaction"} onClick={(e) => {
                    e.stopPropagation();
                    this.changeGroupStatus();
                    this.onGroupClick(p.document, p.index, this.selectedButtons[buttonIndex.Group]);
                }}> <FontAwesomeIcon icon={"arrow-up"} /> </button>

            </div>
        );
    }
}