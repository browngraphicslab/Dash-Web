import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, reaction, runInAction, observable, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, DataSym, DocListCast } from "../../../fields/Doc";
import { documentSchema } from '../../../fields/documentSchemas';
import { Id } from "../../../fields/FieldSymbols";
import { createSchema, makeInterface, listSpec } from '../../../fields/Schema';
import { Cast, NumCast, BoolCast, ScriptCast, StrCast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnFalse, returnTrue, returnOne, returnZero, numberRange, setupMoveUpEvents } from "../../../Utils";
import { Transform } from "../../util/Transform";
import { ViewBoxBaseComponent } from '../DocComponent';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import "./PresElementBox.scss";
import React = require("react");
import { PresBox, PresMovement } from "../nodes/PresBox";
import { DocumentType } from "../../documents/DocumentTypes";
import { Tooltip } from "@material-ui/core";
import { DragManager } from "../../util/DragManager";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { undoBatch } from "../../util/UndoManager";
import { EditableView } from "../EditableView";
import { DocumentManager } from "../../util/DocumentManager";

export const presSchema = createSchema({
    presentationTargetDoc: Doc,
    presBox: Doc,
    presZoomButton: "boolean",
    presNavButton: "boolean",
    presHideTillShownButton: "boolean",
    presFadeButton: "boolean",
    presHideAfterButton: "boolean",
    presGroupButton: "boolean",
    presExpandInlineButton: "boolean"
});

type PresDocument = makeInterface<[typeof presSchema, typeof documentSchema]>;
const PresDocument = makeInterface(presSchema, documentSchema);
/**
 * This class models the view a document added to presentation will have in the presentation.
 * It involves some functionality for its buttons and options.
 */
@observer
export class PresElementBox extends ViewBoxBaseComponent<FieldViewProps, PresDocument>(PresDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresElementBox, fieldKey); }
    _heightDisposer: IReactionDisposer | undefined;

    @observable _dragging = false;
    // these fields are conditionally computed fields on the layout document that take this document as a parameter
    @computed get indexInPres() { return Number(this.lookupField("indexInPres")); }  // the index field is where this document is in the presBox display list (since this value is different for each presentation element, the value can't be stored on the layout template which is used by all display elements)
    @computed get collapsedHeight() { return Number(this.lookupField("presCollapsedHeight")); } // the collapsed height changes depending on the state of the presBox.  We could store this on the presentation element template if it's used by only one presentation - but if it's shared by multiple, then this value must be looked up
    @computed get presStatus() { return StrCast(this.lookupField("presStatus")); }
    @computed get itemIndex() { return NumCast(this.lookupField("_itemIndex")); }
    @computed get presBox() { return Cast(this.lookupField("presBox"), Doc, null); }
    @computed get targetDoc() { return Cast(this.rootDoc.presentationTargetDoc, Doc, null) || this.rootDoc; }

    componentDidMount() {
        this._heightDisposer = reaction(() => [this.rootDoc.presExpandInlineButton, this.collapsedHeight],
            params => this.layoutDoc._height = NumCast(params[1]) + (Number(params[0]) ? 100 : 0), { fireImmediately: true });
    }
    componentWillUnmount() {
        this._heightDisposer?.();
    }

    /**
     * Returns a local transformed coordinate array for given coordinates.
     */
    ScreenToLocalListTransform = (xCord: number, yCord: number) => [xCord, yCord];

    @action
    presExpandDocumentClick = () => {
        this.rootDoc.presExpandInlineButton = !this.rootDoc.presExpandInlineButton;
    }

    embedHeight = (): number => 97;
    // embedWidth = () => this.props.PanelWidth();
    // embedHeight = () => Math.min(this.props.PanelWidth() - 20, this.props.PanelHeight() - this.collapsedHeight);
    embedWidth = (): number => this.props.PanelWidth() - 30;
    /**
     * The function that is responsible for rendering a preview or not for this
     * presentation element.
     */
    @computed get renderEmbeddedInline() {
        return !this.rootDoc.presExpandInlineButton || !this.targetDoc ? (null) :
            <div className="presItem-embedded" style={{ height: this.embedHeight(), width: this.embedWidth() }}>
                <ContentFittingDocumentView
                    Document={this.targetDoc}
                    DataDoc={this.targetDoc[DataSym] !== this.targetDoc && this.targetDoc[DataSym]}
                    LibraryPath={emptyPath}
                    fitToBox={true}
                    backgroundColor={this.props.backgroundColor}
                    rootSelected={returnTrue}
                    addDocument={returnFalse}
                    removeDocument={returnFalse}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    PanelWidth={this.embedWidth}
                    PanelHeight={this.embedHeight}
                    ScreenToLocalTransform={Transform.Identity}
                    parentActive={this.props.active}
                    moveDocument={this.props.moveDocument!}
                    renderDepth={this.props.renderDepth + 1}
                    focus={emptyFunction}
                    whenActiveChanged={returnFalse}
                    bringToFront={returnFalse}
                    opacity={returnOne}
                    docFilters={this.props.docFilters}
                    docRangeFilters={this.props.docRangeFilters}
                    searchFilterDocs={this.props.searchFilterDocs}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    ContentScaling={returnOne}
                />
                <div className="presItem-embeddedMask" />
            </div>;
    }

    @computed get duration() {
        let durationInS: number;
        if (this.rootDoc.type === DocumentType.AUDIO) { durationInS = NumCast(this.rootDoc.presEndTime) - NumCast(this.rootDoc.presStartTime); durationInS = Math.round(durationInS * 10) / 10; }
        else if (this.rootDoc.presDuration) durationInS = NumCast(this.rootDoc.presDuration) / 1000;
        else durationInS = 2;
        return this.rootDoc.presMovement === PresMovement.Jump ? (null) : "D: " + durationInS + "s";
    }

    @computed get transition() {
        let transitionInS: number;
        if (this.rootDoc.presTransition) transitionInS = NumCast(this.rootDoc.presTransition) / 1000;
        else transitionInS = 0.5;
        return "M: " + transitionInS + "s";
    }

    private _itemRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _dragRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _titleRef: React.RefObject<EditableView> = React.createRef();


    @action
    headerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        const element = e.target as any;
        e.stopPropagation();
        e.preventDefault();
        if (element && !(e.ctrlKey || e.metaKey)) {
            if (PresBox.Instance._selectedArray.includes(this.rootDoc)) {
                PresBox.Instance._selectedArray.length === 1 && PresBox.Instance.regularSelect(this.rootDoc, this._itemRef.current!, this._dragRef.current!, false);
                setupMoveUpEvents(this, e, this.startDrag, emptyFunction, emptyFunction);
            } else {
                setupMoveUpEvents(this, e, ((e: PointerEvent) => {
                    PresBox.Instance.regularSelect(this.rootDoc, this._itemRef.current!, this._dragRef.current!, false);
                    return this.startDrag(e);
                }), emptyFunction, emptyFunction);
            }
        }
    }

    headerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
    }

    startDrag = (e: PointerEvent) => {
        const miniView: boolean = this.toolbarWidth <= 100;
        const activeItem = this.rootDoc;
        const dragArray = PresBox.Instance._dragArray;
        const dragData = new DragManager.DocumentDragData(PresBox.Instance.sortArray());
        const dragItem: HTMLElement[] = [];
        if (dragArray.length === 1) {
            const doc = dragArray[0];
            doc.className = miniView ? "presItem-miniSlide" : "presItem-slide";
            dragItem.push(doc);
        } else if (dragArray.length >= 1) {
            const doc = document.createElement('div');
            doc.className = "presItem-multiDrag";
            doc.innerText = "Move " + PresBox.Instance._selectedArray.length + " slides";
            doc.style.position = 'absolute';
            doc.style.top = (e.clientY) + 'px';
            doc.style.left = (e.clientX - 50) + 'px';
            dragItem.push(doc);
        }

        // const dropEvent = () => runInAction(() => this._dragging = false);
        if (activeItem) {
            DragManager.StartDocumentDrag(dragItem.map(ele => ele), dragData, e.clientX, e.clientY, undefined);
            // runInAction(() => this._dragging = true);
            return true;
        }
        return false;
    }

    onPointerOver = (e: any) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
    }

    onPointerMove = (e: PointerEvent) => {
        const slide = this._itemRef.current!;
        let dragIsPresItem: boolean = DragManager.docsBeingDragged.length > 0 ? true : false;
        for (const doc of DragManager.docsBeingDragged) {
            if (!doc.presentationTargetDoc) dragIsPresItem = false;
        }
        if (slide && dragIsPresItem) {
            const rect = slide.getBoundingClientRect();
            const y = e.clientY - rect.top;  //y position within the element.
            const height = slide.clientHeight;
            const halfLine = height / 2;
            if (y <= halfLine) {
                slide.style.borderTop = "solid 2px #5B9FDD";
                slide.style.borderBottom = "0px";
            } else if (y > halfLine) {
                slide.style.borderTop = "0px";
                slide.style.borderBottom = "solid 2px #5B9FDD";
            }
        }
        document.removeEventListener("pointermove", this.onPointerMove);
    }

    onPointerLeave = (e: any) => {
        this._itemRef.current!.style.borderTop = "0px";
        this._itemRef.current!.style.borderBottom = "0px";
        document.removeEventListener("pointermove", this.onPointerMove);
    }

    @action
    toggleProperties = () => {
        if (CurrentUserUtils.propertiesWidth < 5) {
            action(() => (CurrentUserUtils.propertiesWidth = 250));
        }
    }

    @undoBatch
    removeItem = action((e: React.MouseEvent) => {
        this.props.removeDocument?.(this.rootDoc);
        if (PresBox.Instance._selectedArray.includes(this.rootDoc)) {
            PresBox.Instance._selectedArray.splice(PresBox.Instance._selectedArray.indexOf(this.rootDoc), 1);
        }
        e.stopPropagation();
    });

    @undoBatch
    @action
    onSetValue = (value: string) => {
        this.rootDoc.title = !value.trim().length ? "-untitled-" : value;
        return true;
    }

    /**
     * Method called for updating the view of the currently selected document
     * 
     * @param targetDoc 
     * @param activeItem 
     */
    @undoBatch
    @action
    updateView = (targetDoc: Doc, activeItem: Doc) => {
        if (targetDoc.type === DocumentType.PDF || targetDoc.type === DocumentType.WEB || targetDoc.type === DocumentType.RTF) {
            const scroll = targetDoc._scrollTop;
            activeItem.presPinViewScroll = scroll;
        } else if (targetDoc.type === DocumentType.VID) {
            activeItem.presPinTimecode = targetDoc._currentTimecode;
        } else if (targetDoc.type === DocumentType.COMPARISON) {
            const clipWidth = targetDoc._clipWidth;
            activeItem.presPinClipWidth = clipWidth;
        } else {
            const x = targetDoc._panX;
            const y = targetDoc._panY;
            const scale = targetDoc._viewScale;
            activeItem.presPinViewX = x;
            activeItem.presPinViewY = y;
            activeItem.presPinViewScale = scale;
        }
    }

    @computed
    get toolbarWidth(): number {
        const presBoxDocView = DocumentManager.Instance.getDocumentView(this.presBox);
        let width: number = NumCast(this.presBox._width);
        if (presBoxDocView) width = presBoxDocView.props.PanelWidth();
        return width;
    }

    @computed get mainItem() {
        const isSelected: boolean = PresBox.Instance._selectedArray.includes(this.rootDoc);
        const toolbarWidth: number = this.toolbarWidth;
        const showMore: boolean = this.toolbarWidth >= 300;
        const miniView: boolean = this.toolbarWidth <= 100;
        const targetDoc: Doc = this.targetDoc;
        const activeItem: Doc = this.rootDoc;
        return (
            <div className={`presItem-container`} key={this.props.Document[Id] + this.indexInPres}
                ref={this._itemRef}
                style={{ backgroundColor: isSelected ? "#AEDDF8" : "rgba(0,0,0,0)", opacity: this._dragging ? 0.3 : 1 }}
                onClick={e => {
                    e.stopPropagation();
                    e.preventDefault();
                    PresBox.Instance.modifierSelect(this.rootDoc, this._itemRef.current!, this._dragRef.current!, !e.shiftKey && !e.ctrlKey && !e.metaKey, e.ctrlKey || e.metaKey, e.shiftKey);
                }}
                onDoubleClick={action(e => {
                    this.toggleProperties();
                    PresBox.Instance.regularSelect(this.rootDoc, this._itemRef.current!, this._dragRef.current!, true);
                })}
                onPointerOver={this.onPointerOver}
                onPointerLeave={this.onPointerLeave}
                onPointerDown={this.headerDown}
                onPointerUp={this.headerUp}
            >
                {miniView ?
                    <div className={`presItem-miniSlide ${isSelected ? "active" : ""}`} ref={miniView ? this._dragRef : null}>
                        {`${this.indexInPres + 1}.`}
                    </div>
                    :
                    <div className="presItem-number">
                        {`${this.indexInPres + 1}.`}
                    </div>}
                {miniView ? (null) : <div ref={miniView ? null : this._dragRef} className={`presItem-slide ${isSelected ? "active" : ""}`}>
                    <div className="presItem-name" style={{ maxWidth: showMore ? (toolbarWidth - 175) : toolbarWidth - 85, cursor: isSelected ? 'text' : 'grab' }}>
                        <EditableView
                            ref={this._titleRef}
                            editing={!isSelected ? false : undefined}
                            contents={activeItem.title}
                            GetValue={() => StrCast(activeItem.title)}
                            SetValue={this.onSetValue}
                        />
                    </div>
                    <Tooltip title={<><div className="dash-tooltip">{"Movement speed"}</div></>}><div className="presItem-time" style={{ display: showMore ? "block" : "none" }}>{this.transition}</div></Tooltip>
                    <Tooltip title={<><div className="dash-tooltip">{"Duration"}</div></>}><div className="presItem-time" style={{ display: showMore ? "block" : "none" }}>{this.duration}</div></Tooltip>
                    <div className={"presItem-slideButtons"}>
                        <Tooltip title={<><div className="dash-tooltip">{"Update view"}</div></>}>
                            <div className="slideButton"
                                onClick={() => this.updateView(targetDoc, activeItem)}
                                style={{ fontWeight: 700, display: activeItem.presPinView ? "flex" : "none" }}>V</div>
                        </Tooltip>
                        {/* <Tooltip title={<><div className="dash-tooltip">{"Group with up"}</div></>}>
                            <div className="slideButton"
                                onClick={() => activeItem.groupWithUp = !activeItem.groupWithUp}
                                style={{ fontWeight: 700, display: activeItem.presPinView ? "flex" : "none" }}>
                                <FontAwesomeIcon icon={""} onPointerDown={e => e.stopPropagation()} />
                            </div>
                        </Tooltip> */}
                        <Tooltip title={<><div className="dash-tooltip">{this.rootDoc.presExpandInlineButton ? "Minimize" : "Expand"}</div></>}><div className={"slideButton"} onClick={e => { e.stopPropagation(); this.presExpandDocumentClick(); }}>
                            <FontAwesomeIcon icon={this.rootDoc.presExpandInlineButton ? "eye-slash" : "eye"} onPointerDown={e => e.stopPropagation()} />
                        </div></Tooltip>
                        <Tooltip title={<><div className="dash-tooltip">{"Remove from presentation"}</div></>}><div
                            className={"slideButton"}
                            onClick={this.removeItem}>
                            <FontAwesomeIcon icon={"trash"} onPointerDown={e => e.stopPropagation()} />
                        </div></Tooltip>
                    </div>
                    <div className="presItem-docName" style={{ maxWidth: showMore ? (toolbarWidth - 175) : toolbarWidth - 85 }}>{activeItem.presPinView ? (<><i>View of </i> {targetDoc.title}</>) : targetDoc.title}</div>
                    {this.renderEmbeddedInline}
                </div>}
            </div >);
    }

    render() {
        return !(this.rootDoc instanceof Doc) || this.targetDoc instanceof Promise ? (null) : this.mainItem;
    }
}