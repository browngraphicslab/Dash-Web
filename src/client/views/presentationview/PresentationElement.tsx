import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile as fileRegular } from '@fortawesome/free-regular-svg-icons';
import { faArrowRight, faArrowUp, faFile as fileSolid, faFileDownload, faLocationArrow, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnEmptyString, returnFalse, returnOne } from "../../../Utils";
import { DocumentType } from "../../documents/DocumentTypes";
import { DragManager, dropActionType, SetupDrag } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { ContextMenu } from "../ContextMenu";
import { DocumentView } from "../nodes/DocumentView";
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
    presStatus: boolean;
    removeDocByRef(doc: Doc): boolean;
    PresElementsMappings: Map<Doc, PresentationElement>;
}

/**
 * This class models the view a document added to presentation will have in the presentation.
 * It involves some functionality for its buttons and options.
 */
@observer
export default class PresentationElement extends React.Component<PresentationElementProps> {

    private header?: HTMLDivElement | undefined;
    private listdropDisposer?: DragManager.DragDropDisposer;
    private presElRef: React.RefObject<HTMLDivElement> = React.createRef();

    componentWillUnmount() {
        this.listdropDisposer && this.listdropDisposer();
    }

    @computed get currentIndex() { return NumCast(this.props.mainDocument.selectedDoc); }

    @computed get showButton() { return BoolCast(this.props.document.showButton); }
    @computed get navButton() { return BoolCast(this.props.document.navButton); }
    @computed get hideTillShownButton() { return BoolCast(this.props.document.hideTillShownButton); }
    @computed get fadeButton() { return BoolCast(this.props.document.fadeButton); }
    @computed get hideAfterButton() { return BoolCast(this.props.document.hideAfterButton); }
    @computed get groupButton() { return BoolCast(this.props.document.groupButton); }
    @computed get openRightButton() { return BoolCast(this.props.document.openRightButton); }
    set showButton(val: boolean) { this.props.document.showButton = val; }
    set navButton(val: boolean) { this.props.document.navButton = val; }
    set hideTillShownButton(val: boolean) { this.props.document.hideTillShownButton = val; }
    set fadeButton(val: boolean) { this.props.document.fadeButton = val; }
    set hideAfterButton(val: boolean) { this.props.document.hideAfterButton = val; }
    set groupButton(val: boolean) { this.props.document.groupButton = val; }
    set openRightButton(val: boolean) { this.props.document.openRightButton = val; }

    //Lifecycle function that makes sure that button BackUp is received when mounted.
    async componentDidMount() {
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

    @action
    onGroupClick = (e: React.MouseEvent) => {
        this.groupButton = !this.groupButton;
    }

    /**
     * The function that is called on click to turn Hiding document till press option on/off.
     * It also sets the beginning and end opacitys.
     */
    @action
    onHideDocumentUntilPressClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.hideTillShownButton = !this.hideTillShownButton;
        if (!this.hideTillShownButton) {
            if (this.props.index >= this.currentIndex) {
                this.props.document.opacity = 1;
            }
        } else {
            if (this.props.presStatus) {
                if (this.props.index > this.currentIndex) {
                    this.props.document.opacity = 0;
                }
            }
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
        this.hideAfterButton = !this.hideAfterButton;
        if (!this.hideAfterButton) {
            if (this.props.index <= this.currentIndex) {
                this.props.document.opacity = 1;
            }
        } else {
            if (this.fadeButton) this.fadeButton = false;
            if (this.props.presStatus) {
                if (this.props.index < this.currentIndex) {
                    this.props.document.opacity = 0;
                }
            }
        }
    }

    /**
     * The function that is called on click to turn fading document after presented option on/off.
     * It also makes sure that the option swithches from hide-after to this one, since both
     * can't coexist.
     */
    @action
    onFadeDocumentAfterPresentedClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.fadeButton = !this.fadeButton;
        if (!this.fadeButton) {
            if (this.props.index <= this.currentIndex) {
                this.props.document.opacity = 1;
            }
        } else {
            this.hideAfterButton = false;
            if (this.props.presStatus) {
                if (this.props.index < this.currentIndex) {
                    this.props.document.opacity = 0.5;
                }
            }
        }
    }

    /**
     * The function that is called on click to turn navigation option of docs on/off.
     */
    @action
    onNavigateDocumentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.navButton = !this.navButton;
        if (this.navButton) {
            this.showButton = false;
            if (this.currentIndex === this.props.index) {
                this.props.gotoDocument(this.props.index, this.props.index);
            }
        }
    }

    /**
    * The function that is called on click to turn zoom option of docs on/off.
    */
    @action
    onZoomDocumentClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        this.showButton = !this.showButton;
        if (!this.showButton) {
            this.props.document.viewScale = 1;
        } else {
            this.navButton = false;
            if (this.currentIndex === this.props.index) {
                this.props.gotoDocument(this.props.index, this.props.index);
            }
        }
    }

    /**
     * Function that opens up the option to open a element on right when navigated,
     * instead of openening it as tab as default.
     */
    @action
    onRightTabClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        this.openRightButton = !this.openRightButton;
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

    //This is used to add dragging as an event.
    onPointerEnter = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && SelectionManager.GetIsDragging()) {

            this.header!.className = "presentationView-item";

            if (this.currentIndex === this.props.index) {
                //this doc is selected
                this.header!.className = "presentationView-item presentationView-selected";
            }
            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }

    //This is used to remove the dragging when dropped.
    onPointerLeave = (e: React.PointerEvent): void => {
        this.header!.className = "presentationView-item";

        if (this.currentIndex === this.props.index) {
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
        Doc.UnBrushDoc(this.props.document);
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
                    pinToPres={returnFalse}
                    renderDepth={1}
                    PanelWidth={() => 350}
                    PanelHeight={() => 90}
                    focus={emptyFunction}
                    backgroundColor={returnEmptyString}
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

        let className = " presentationView-item";
        if (this.currentIndex === p.index) {
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
                    outlineWidth: Doc.IsBrushed(p.document) ? `1px` : "0px",
                }}
                onClick={e => { p.gotoDocument(p.index, this.currentIndex); e.stopPropagation(); }}>
                <strong className="presentationView-name">
                    {`${p.index + 1}. ${title}`}
                </strong>
                <button className="presentation-icon" onPointerDown={(e) => e.stopPropagation()} onClick={e => { this.props.deleteDocument(p.index); e.stopPropagation(); }}>X</button>
                <br></br>
                <button title="Zoom" className={this.showButton ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={this.navButton ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Document Till Presented" className={this.hideTillShownButton ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade Document After Presented" className={this.fadeButton ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Hide Document After Presented" className={this.hideAfterButton ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Group With Up" className={this.groupButton ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onGroupClick}> <FontAwesomeIcon icon={"arrow-up"} /> </button>
                <button title="Open Right" className={this.openRightButton ? "presentation-interaction-selected" : "presentation-interaction"} onPointerDown={(e) => e.stopPropagation()} onClick={this.onRightTabClick}><FontAwesomeIcon icon={"arrow-right"} /></button>

                <br />
                {this.renderEmbeddedInline()}
            </div>
        );
    }
}