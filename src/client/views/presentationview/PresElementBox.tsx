import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DataSym, DocListCast } from "../../../fields/Doc";
import { documentSchema } from '../../../fields/documentSchemas';
import { Id } from "../../../fields/FieldSymbols";
import { createSchema, makeInterface, listSpec } from '../../../fields/Schema';
import { Cast, NumCast, BoolCast, ScriptCast, StrCast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnFalse, returnTrue, returnOne, returnZero, numberRange, setupMoveUpEvents } from "../../../Utils";
import { Transform } from "../../util/Transform";
import { CollectionViewType } from '../collections/CollectionView';
import { ViewBoxBaseComponent } from '../DocComponent';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import "./PresElementBox.scss";
import React = require("react");
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { PresBox } from "../nodes/PresBox";
import { DocumentType } from "../../documents/DocumentTypes";
import { Tooltip } from "@material-ui/core";
import { DragManager } from "../../util/DragManager";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { undoBatch } from "../../util/UndoManager";
import { EditableView } from "../EditableView";

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

    embedHeight = () => 100;
    // embedWidth = () => this.props.PanelWidth();
    // embedHeight = () => Math.min(this.props.PanelWidth() - 20, this.props.PanelHeight() - this.collapsedHeight);
    embedWidth = () => this.props.PanelWidth() - 20;
    /**
     * The function that is responsible for rendering a preview or not for this
     * presentation element.
     */
    @computed get renderEmbeddedInline() {
        return !this.rootDoc.presExpandInlineButton || !this.targetDoc ? (null) :
            <div className="presElementBox-embedded" style={{ height: this.embedHeight(), width: this.embedWidth() }}>
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
                    searchFilterDocs={this.props.searchFilterDocs}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    ContentScaling={returnOne}
                />
                <div className="presElementBox-embeddedMask" />
            </div>;
    }

    @computed get duration() {
        let durationInS: number;
        if (this.rootDoc.type === DocumentType.AUDIO) { durationInS = NumCast(this.rootDoc.presEndTime) - NumCast(this.rootDoc.presStartTime); durationInS = Math.round(durationInS * 10) / 10 }
        else if (this.rootDoc.presDuration) durationInS = NumCast(this.rootDoc.presDuration) / 1000;
        else durationInS = 2;
        return "D: " + durationInS + "s";
    }

    @computed get transition() {
        let transitionInS: number;
        if (this.targetDoc.presTransition) transitionInS = NumCast(this.targetDoc.presTransition) / 1000;
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
            if (PresBox.Instance._eleArray.includes(this._itemRef.current!)) {
                setupMoveUpEvents(this, e, this.startDrag, emptyFunction, emptyFunction);
            } else {
                PresBox.Instance._selectedArray = [];
                PresBox.Instance._selectedArray.push(this.rootDoc);
                PresBox.Instance._eleArray = [];
                PresBox.Instance._eleArray.push(this._itemRef.current!);
                PresBox.Instance._dragArray = [];
                PresBox.Instance._dragArray.push(this._dragRef.current!);
                setupMoveUpEvents(this, e, this.startDrag, emptyFunction, emptyFunction);
            }
        }
    }

    headerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        DragManager.docsBeingDragged = [];
        this._highlightTopRef.current!.style.borderBottom = "0px";
        this._highlightBottomRef.current!.style.borderBottom = "0px";
    }

    startDrag = (e: PointerEvent, down: number[], delta: number[]) => {
        const activeItem = this.rootDoc;
        const dragData = new DragManager.DocumentDragData(PresBox.Instance.sortArray().map(doc => doc));
        const dragItem: HTMLElement[] = [];
        PresBox.Instance._dragArray.map(ele => {
            const drag = ele;
            drag.style.backgroundColor = "#d5dce2";
            drag.style.borderRadius = '5px';
            dragItem.push(drag);
        });
        if (activeItem) {
            DragManager.StartDocumentDrag(dragItem.map(ele => ele), dragData, e.clientX, e.clientY);
            activeItem.dragging = true;
            return true;
        }
        return false;
    }

    private _highlightTopRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _highlightBottomRef: React.RefObject<HTMLDivElement> = React.createRef();


    onPointerTop = (e: React.PointerEvent<HTMLDivElement>) => {
        if (DragManager.docsBeingDragged.length > 1) {
            this._highlightTopRef.current!.style.borderTop = "solid 2px #5B9FDD";
        }
    }

    onPointerBottom = (e: React.PointerEvent<HTMLDivElement>) => {
        if (DragManager.docsBeingDragged.length > 1) {
            this._highlightBottomRef.current!.style.borderBottom = "solid 2px #5B9FDD";
        }
    }

    onPointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
        if (DragManager.docsBeingDragged.length > 1) {
            this._highlightBottomRef.current!.style.borderBottom = "0px";
            this._highlightTopRef.current!.style.borderTop = "0px";
        }
    }

    @action
    toggleProperties = () => {
        if (CurrentUserUtils.propertiesWidth < 5) {
            CurrentUserUtils.propertiesWidth = 250;
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

    @action
    onSetValue = (value: string) => {
        this.rootDoc.title = value;
        return true;
    }

    render() {
        const className = "presElementBox-item" + (PresBox.Instance._selectedArray.includes(this.rootDoc) ? " presElementBox-active" : "");
        return !(this.rootDoc instanceof Doc) || this.targetDoc instanceof Promise ? (null) : (
            <div className={className} key={this.props.Document[Id] + this.indexInPres}
                ref={this._itemRef}
                style={{ outlineWidth: Doc.IsBrushed(this.targetDoc) ? `1px` : "0px", }}
                onClick={e => {
                    e.stopPropagation();
                    e.preventDefault();
                    // Command/ control click
                    if (e.ctrlKey || e.metaKey) {
                        PresBox.Instance.multiSelect(this.rootDoc, this._itemRef.current!, this._dragRef.current!);
                        // Shift click
                    } else if (e.shiftKey) {
                        PresBox.Instance.shiftSelect(this.rootDoc, this._itemRef.current!, this._dragRef.current!);
                        // Regular click
                    } else {
                        this.props.focus(this.rootDoc);
                        PresBox.Instance._eleArray = [];
                        PresBox.Instance._eleArray.push(this._itemRef.current!);
                        PresBox.Instance._dragArray = [];
                        PresBox.Instance._dragArray.push(this._dragRef.current!);
                    }
                }}
                onDoubleClick={e => {
                    console.log('double click to open');
                    this.toggleProperties();
                    this.props.focus(this.rootDoc);
                    PresBox.Instance._eleArray = [];
                    PresBox.Instance._eleArray.push(this._itemRef.current!);
                    PresBox.Instance._dragArray = [];
                    PresBox.Instance._dragArray.push(this._dragRef.current!);
                }}
                onPointerDown={this.headerDown}
                onPointerUp={this.headerUp}
            >
                <>
                    <div className="presElementBox-number">
                        {`${this.indexInPres + 1}.`}
                    </div>
                    <div ref={this._dragRef} className="presElementBox-name" style={{ maxWidth: (PresBox.Instance.toolbarWidth - 70) }}>
                        <EditableView ref={this._titleRef}
                            contents={this.rootDoc.title}
                            GetValue={() => StrCast(this.rootDoc.title)}
                            SetValue={action((value: string) => {
                                this.onSetValue(value);
                                return true;
                            })}
                        />
                    </div>
                    <Tooltip title={<><div className="dash-tooltip">{"Movement speed"}</div></>}><div className="presElementBox-time" style={{ display: PresBox.Instance.toolbarWidth > 300 ? "block" : "none" }}>{this.transition}</div></Tooltip>
                    <Tooltip title={<><div className="dash-tooltip">{"Duration"}</div></>}><div className="presElementBox-time" style={{ display: PresBox.Instance.toolbarWidth > 300 ? "block" : "none" }}>{this.duration}</div></Tooltip>
                    <Tooltip title={<><div className="dash-tooltip">{"Presentation pin view"}</div></>}><div className="presElementBox-time" style={{ fontWeight: 700, display: this.rootDoc.presPinView && PresBox.Instance.toolbarWidth > 300 ? "block" : "none" }}>V</div></Tooltip>
                    <Tooltip title={<><div className="dash-tooltip">{"Remove from presentation"}</div></>}><div
                        className="presElementBox-closeIcon"
                        onClick={this.removeItem}>
                        <FontAwesomeIcon icon={"trash"} onPointerDown={e => e.stopPropagation()} />
                    </div></Tooltip>
                    <Tooltip title={<><div className="dash-tooltip">{this.rootDoc.presExpandInlineButton ? "Minimize" : "Expand"}</div></>}><div className={"presElementBox-expand" + (this.rootDoc.presExpandInlineButton ? "-selected" : "")} onClick={e => { e.stopPropagation(); this.presExpandDocumentClick(); }}>
                        <FontAwesomeIcon icon={(this.rootDoc.presExpandInlineButton ? "angle-up" : "angle-down")} onPointerDown={e => e.stopPropagation()} />
                    </div></Tooltip>
                </>
                <div ref={this._highlightTopRef} onPointerOver={this.onPointerTop} onPointerLeave={this.onPointerLeave} className="presElementBox-highlightTop" style={{ zIndex: 299, backgroundColor: "rgba(0,0,0,0)" }} />
                <div ref={this._highlightBottomRef} onPointerOver={this.onPointerBottom} onPointerLeave={this.onPointerLeave} className="presElementBox-highlightBottom" style={{ zIndex: 299, backgroundColor: "rgba(0,0,0,0)" }} />
                <div className="presElementBox-highlight" style={{ backgroundColor: PresBox.Instance._selectedArray.includes(this.rootDoc) ? "#AEDDF8" : "rgba(0,0,0,0)" }} />
                {this.renderEmbeddedInline}
            </div>
        );
    }
}