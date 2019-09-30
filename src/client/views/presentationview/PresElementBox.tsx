import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile as fileRegular } from '@fortawesome/free-regular-svg-icons';
import { faArrowDown, faArrowUp, faFile as fileSolid, faFileDownload, faLocationArrow, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnEmptyString, returnFalse, returnOne } from "../../../Utils";
import { DocumentType } from "../../documents/DocumentTypes";
import { DragManager, dropActionType, SetupDrag } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { DocumentView } from "../nodes/DocumentView";
import React = require("react");
import "./PresElementBox.scss";
import { FieldViewProps, FieldView } from '../nodes/FieldView';
import { PresBox } from '../nodes/PresBox';


library.add(faArrowUp);
library.add(fileSolid);
library.add(faLocationArrow);
library.add(fileRegular as any);
library.add(faSearch);
library.add(faArrowDown);

interface PresElementProps {
    presBox: PresBox;
}

/**
 * This class models the view a document added to presentation will have in the presentation.
 * It involves some functionality for its buttons and options.
 */
@observer
export class PresElementBox extends React.Component<PresElementProps & FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(PresElementBox); }
    private header?: HTMLDivElement | undefined;
    private listdropDisposer?: DragManager.DragDropDisposer;
    private presElRef: React.RefObject<HTMLDivElement> = React.createRef();

    @computed get myIndex() { return DocListCast(this.props.presBox.props.Document[this.props.presBox.props.fieldKey]).indexOf(this.props.Document) }
    @computed get presentationDoc() { return this.props.presBox.props.Document; }
    @computed get presentationFieldKey() { return this.props.presBox.props.fieldKey; }
    @computed get currentIndex() { return NumCast(this.presentationDoc.selectedDoc); }
    @computed get showButton() { return BoolCast(this.props.Document.showButton); }
    @computed get navButton() { return BoolCast(this.props.Document.navButton); }
    @computed get hideTillShownButton() { return BoolCast(this.props.Document.hideTillShownButton); }
    @computed get fadeButton() { return BoolCast(this.props.Document.fadeButton); }
    @computed get hideAfterButton() { return BoolCast(this.props.Document.hideAfterButton); }
    @computed get groupButton() { return BoolCast(this.props.Document.groupButton); }
    @computed get embedInline() { return BoolCast(this.props.Document.embedOpen); }

    set embedInline(value: boolean) { this.props.Document.embedOpen = value; }
    set showButton(val: boolean) { this.props.Document.showButton = val; }
    set navButton(val: boolean) { this.props.Document.navButton = val; }
    set hideTillShownButton(val: boolean) { this.props.Document.hideTillShownButton = val; }
    set fadeButton(val: boolean) { this.props.Document.fadeButton = val; }
    set hideAfterButton(val: boolean) { this.props.Document.hideAfterButton = val; }
    set groupButton(val: boolean) { this.props.Document.groupButton = val; }

    //Lifecycle function that makes sure that button BackUp is received when mounted.
    componentDidMount() {
        if (this.presElRef.current) {
            this.header = this.presElRef.current;
            this.createListDropTarget(this.presElRef.current);
        }
    }

    componentWillUnmount() {
        this.listdropDisposer && this.listdropDisposer();
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
            if (this.myIndex >= this.currentIndex) {
                (this.props.Document.target as Doc).opacity = 1;
            }
        } else {
            if (this.presentationDoc.presStatus) {
                if (this.myIndex > this.currentIndex) {
                    (this.props.Document.target as Doc).opacity = 0;
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
            if (this.myIndex <= this.currentIndex) {
                (this.props.Document.target as Doc).opacity = 1;
            }
        } else {
            if (this.fadeButton) this.fadeButton = false;
            if (this.presentationDoc.presStatus) {
                if (this.myIndex < this.currentIndex) {
                    (this.props.Document.target as Doc).opacity = 0;
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
            if (this.myIndex <= this.currentIndex) {
                (this.props.Document.target as Doc).opacity = 1;
            }
        } else {
            this.hideAfterButton = false;
            if (this.presentationDoc.presStatus) {
                if (this.myIndex < this.currentIndex) {
                    (this.props.Document.target as Doc).opacity = 0.5;
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
            if (this.currentIndex === this.myIndex) {
                this.props.focus(this.props.Document);
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
            this.props.Document.viewScale = 1;
        } else {
            this.navButton = false;
            if (this.currentIndex === this.myIndex) {
                this.props.focus(this.props.Document);
            }
        }
    }

    /**
     * Creating a drop target for drag and drop when called.
     */
    protected createListDropTarget = (ele: HTMLDivElement) => {
        this.listdropDisposer && this.listdropDisposer();
        ele && (this.listdropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.listDrop.bind(this) } }));
    }

    /**
     * Returns a local transformed coordinate array for given coordinates.
     */
    ScreenToLocalListTransform = (xCord: number, yCord: number) => [xCord, yCord];

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
            let addDoc = (doc: Doc) => Doc.AddDocToList(this.presentationDoc, this.presentationFieldKey, doc, this.props.Document, before);
            e.stopPropagation();
            //where does treeViewId come from
            let movedDocs = (de.data.options === this.presentationDoc[Id] ? de.data.draggedDocuments : de.data.droppedDocuments);
            //console.log("How is this causing an issue");
            document.removeEventListener("pointermove", this.onDragMove, true);
            return (de.data.dropAction || de.data.userDropAction) ?
                de.data.droppedDocuments.reduce((added: boolean, d: Doc) => Doc.AddDocToList(this.presentationDoc, this.presentationFieldKey, d, this.props.Document, before) || added, false)
                : (de.data.moveDocument) ?
                    movedDocs.reduce((added: boolean, d: Doc) => de.data.moveDocument(d, this.props.Document, addDoc) || added, false)
                    : de.data.droppedDocuments.reduce((added: boolean, d: Doc) => Doc.AddDocToList(this.presentationDoc, this.presentationFieldKey, d, this.props.Document, before), false);
        }
        document.removeEventListener("pointermove", this.onDragMove, true);

        return false;
    }

    //This is used to add dragging as an event.
    onPointerEnter = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && SelectionManager.GetIsDragging()) {
            this.header!.className = "presElementBox-item" + (this.currentIndex === this.myIndex ? "presElementBox-selected" : "");

            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }

    //This is used to remove the dragging when dropped.
    onPointerLeave = (e: React.PointerEvent): void => {
        this.header!.className = "presElementBox-item" + (this.currentIndex === this.myIndex ? " presElementBox-selected" : "");

        document.removeEventListener("pointermove", this.onDragMove, true);
    }

    /**
     * This method is passed in to be used when dragging a document.
     * It makes it possible to show dropping lines on drop targets.
     */
    onDragMove = (e: PointerEvent): void => {
        Doc.UnBrushDoc(this.props.Document);
        let x = this.ScreenToLocalListTransform(e.clientX, e.clientY);
        let rect = this.header!.getBoundingClientRect();
        let bounds = this.ScreenToLocalListTransform(rect.left, rect.top + rect.height / 2);
        this.header!.className = "presElementBox-item presElementBox-item-" + (x[1] < bounds[1] ? "above" : "below");
        e.stopPropagation();
    }

    /**
     * This method is passed in to on down event of presElement, so that drag and
     * drop can be completed with DragManager functionality.
     */
    @action
    move: DragManager.MoveFunction = (doc: Doc, target: Doc, addDoc) => {
        return this.props.Document !== target && (this.props.removeDocument ? this.props.removeDocument(doc) : false) && addDoc(doc);
    }

    /**
     * The function that is responsible for rendering the a preview or not for this
     * presentation element.
     */
    renderEmbeddedInline = () => {
        if (!this.embedInline || !(this.props.Document.target instanceof Doc)) {
            return (null);
        }

        let propDocWidth = NumCast(this.props.Document.nativeWidth);
        let propDocHeight = NumCast(this.props.Document.nativeHeight);
        let scale = () => 175 / NumCast(this.props.Document.nativeWidth, 175);
        return (
            <div className="presElementBox-embedded" style={{
                height: propDocHeight === 0 ? 100 : propDocHeight * scale(),
                width: propDocWidth === 0 ? "auto" : propDocWidth * scale(),
            }}>
                <DocumentView
                    fitToBox={StrCast(this.props.Document.type).indexOf(DocumentType.COL) !== -1}
                    Document={this.props.Document.target as Doc}
                    addDocument={returnFalse}
                    removeDocument={returnFalse}
                    ruleProvider={undefined}
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
                    ContainingCollectionDoc={undefined}
                    ContentScaling={scale}
                />
                <div className="presElementBox-embeddedMask" />
            </div>
        );
    }

    render() {
        let p = this.props;

        let className = "presElementBox-item" + (this.currentIndex === this.myIndex ? " presElementBox-selected" : "");
        let dropAction = StrCast(this.props.Document.dropAction) as dropActionType;
        let onItemDown = SetupDrag(this.presElRef, () => p.Document, this.move, dropAction, this.presentationDoc[Id], true);
        return (
            <div className={className} key={p.Document[Id] + this.myIndex}
                ref={this.presElRef}
                onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}
                onPointerDown={onItemDown}
                style={{ outlineWidth: Doc.IsBrushed(p.Document) ? `1px` : "0px", }}
                onClick={e => p.focus(p.Document)}>
                <strong className="presElementBox-name">
                    {`${this.myIndex + 1}. ${p.Document.title}`}
                </strong>
                <button className="presElementBox-icon" onPointerDown={e => e.stopPropagation()} onClick={e => this.props.removeDocument && this.props.removeDocument(p.Document)}>X</button>
                <br />
                <button title="Zoom" className={"presElementBox-interaction" + (this.showButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={"presElementBox-interaction" + (this.navButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Til Presented" className={"presElementBox-interaction" + (this.hideTillShownButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade After Presented" className={"presElementBox-interaction" + (this.fadeButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Hide After Presented" className={"presElementBox-interaction" + (this.hideAfterButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Group With Up" className={"presElementBox-interaction" + (this.groupButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={action(() => this.groupButton = !this.groupButton)}> <FontAwesomeIcon icon={"arrow-up"} /> </button>
                <button title="Expand Inline" className={"presElementBox-interaction" + (this.embedInline ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={action(() => this.embedInline = !this.embedInline)}><FontAwesomeIcon icon={"arrow-down"} /></button>

                <br />
                {this.renderEmbeddedInline()}
            </div>
        );
    }
}