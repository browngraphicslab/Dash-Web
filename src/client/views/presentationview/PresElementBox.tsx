import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DataSym, DocListCast } from "../../../fields/Doc";
import { documentSchema } from '../../../fields/documentSchemas';
import { Id } from "../../../fields/FieldSymbols";
import { createSchema, makeInterface, listSpec } from '../../../fields/Schema';
import { Cast, NumCast, BoolCast, ScriptCast, StrCast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnFalse, returnTrue, returnOne, returnZero, numberRange } from "../../../Utils";
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
     * The function that is called on click to turn Hiding document till press option on/off.
     * It also sets the beginning and end opacitys.
     */
    @action
    onHideDocumentUntilPressClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.rootDoc.presHideTillShownButton = !this.rootDoc.presHideTillShownButton;
        if (!this.rootDoc.presHideTillShownButton) {
            if (this.indexInPres >= this.itemIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            if (this.presStatus !== "edit" && this.indexInPres > this.itemIndex && this.targetDoc) {
                this.targetDoc.opacity = 0;
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
        this.rootDoc.presHideAfterButton = !this.rootDoc.presHideAfterButton;
        if (!this.rootDoc.presHideAfterButton) {
            if (this.indexInPres <= this.itemIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            if (this.rootDoc.presFadeButton) this.rootDoc.presFadeButton = false;
            if (this.presStatus !== "edit" && this.indexInPres < this.itemIndex && this.targetDoc) {
                this.targetDoc.opacity = 0;
            }
        }
    }

    @action
    progressivize = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.rootDoc.presProgressivize = !this.rootDoc.presProgressivize;
        const rootTarget = Cast(this.rootDoc.presentationTargetDoc, Doc, null);
        const docs = rootTarget.type === DocumentType.COL ? DocListCast(rootTarget[Doc.LayoutFieldKey(rootTarget)]) :
            DocListCast(rootTarget[Doc.LayoutFieldKey(rootTarget) + "-annotations"]);
        if (this.rootDoc.presProgressivize) {
            rootTarget.currentFrame = 0;
            CollectionFreeFormDocumentView.setupKeyframes(docs, docs.length, true);
            rootTarget.lastFrame = docs.length - 1;
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
        this.rootDoc.presFadeButton = !this.rootDoc.presFadeButton;
        if (!this.rootDoc.presFadeButton) {
            if (this.indexInPres <= this.itemIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            this.rootDoc.presHideAfterButton = false;
            if (this.presStatus !== "edit" && (this.indexInPres < this.itemIndex) && this.targetDoc) {
                this.targetDoc.opacity = 0.5;
            }
        }
    }

    /**
     * The function that is called on click to turn navigation option of docs on/off.
     */
    @action
    onNavigateDocumentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.rootDoc.presNavButton = !this.rootDoc.presNavButton;
        if (this.rootDoc.presNavButton) {
            this.rootDoc.presZoomButton = false;
            if (this.itemIndex === this.indexInPres) {
                this.props.focus(this.rootDoc);
            }
        }
    }

    /**
    * The function that is called on click to turn zoom option of docs on/off.
    */
    @action
    onZoomDocumentClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        this.rootDoc.presZoomButton = !this.rootDoc.presZoomButton;
        if (this.rootDoc.presZoomButton) {
            this.rootDoc.presNavButton = false;
            if (this.itemIndex === this.indexInPres) {
                this.props.focus(this.rootDoc);
            }
        }
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
    embedWidth = () => this.props.PanelWidth() - 20;
    // embedHeight = () => Math.min(this.props.PanelWidth() - 20, this.props.PanelHeight() - this.collapsedHeight);
    // embedWidth = () => this.props.PanelWidth() - 20;
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
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    ContentScaling={returnOne}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                />
                <div className="presElementBox-embeddedMask" />
            </div>;
    }

    @computed get duration() {
        let durationInS: number;
        if (this.targetDoc.presDuration) durationInS = NumCast(this.targetDoc.presDuration) / 1000;
        else durationInS = 2;
        return "V: " + durationInS + "s";
    }

    @computed get transition() {
        let transitionInS: number;
        if (this.targetDoc.presTransition) transitionInS = NumCast(this.targetDoc.presTransition) / 1000;
        else transitionInS = 0.5;
        return "M: " + transitionInS + "s";
    }

    render() {
        const treecontainer = this.props.ContainingCollectionDoc?._viewType === CollectionViewType.Tree;
        const className = "presElementBox-item" + (this.itemIndex === this.indexInPres ? " presElementBox-active" : "");
        const pbi = "presElementBox-interaction";
        return !(this.rootDoc instanceof Doc) || this.targetDoc instanceof Promise ? (null) : (
            <div className={className} key={this.props.Document[Id] + this.indexInPres}
                style={{ outlineWidth: Doc.IsBrushed(this.targetDoc) ? `1px` : "0px", }}
                onClick={e => {
                    if (e.ctrlKey || e.metaKey) {
                        PresBox.Instance.multiSelect(this.rootDoc);
                        console.log("cmmd click");
                    } else if (e.shiftKey) {
                        PresBox.Instance.shiftSelect(this.rootDoc);
                    } else {
                        this.props.focus(this.rootDoc); e.stopPropagation();
                        console.log("normal click");
                    }
                }}
                onPointerDown={e => e.stopPropagation()}
            >
                {treecontainer ? (null) : <>
                    <div className="presElementBox-number">
                        {`${this.indexInPres + 1}.`}
                    </div>
                    <div className="presElementBox-name">
                        {`${this.targetDoc?.title}`}
                    </div>
                    <Tooltip title={<><div className="dash-tooltip">{"Movement speed"}</div></>}><div className="presElementBox-time">{this.transition}</div></Tooltip>
                    <Tooltip title={<><div className="dash-tooltip">{"Duration of visibility"}</div></>}><div className="presElementBox-time">{this.duration}</div></Tooltip>
                    <Tooltip title={<><div className="dash-tooltip">{"Remove from presentation"}</div></>}><button
                        title="Close"
                        className="presElementBox-closeIcon"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                            this.props.removeDocument?.(this.rootDoc);
                            e.stopPropagation();
                        }}>
                        <FontAwesomeIcon icon={"trash"} onPointerDown={e => e.stopPropagation()} />
                    </button></Tooltip>
                    <Tooltip title={<><div className="dash-tooltip">{this.rootDoc.presExpandInlineButton ? "Expand" : "Minimize"}</div></>}><button title="Expand Inline" className={"presElementBox-expand" + (this.rootDoc.presExpandInlineButton ? "-selected" : "")} onClick={e => { e.stopPropagation(); this.presExpandDocumentClick(); }}>
                        <FontAwesomeIcon icon={(this.rootDoc.presExpandInlineButton ? "angle-up" : "angle-down")} onPointerDown={e => e.stopPropagation()} />
                    </button></Tooltip>
                </>}
                <div className="presElementBox-highlight" style={{ display: PresBox.Instance._selectedArray.includes(this.rootDoc) ? "block" : "none" }} />
                <div className="presElementBox-buttons" style={{ display: this.rootDoc.presExpandInlineButton ? "grid" : "none" }}>
                    <button title="Zoom" className={pbi + (this.rootDoc.presZoomButton ? "-selected" : "")} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search-plus"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Navigate" className={pbi + (this.rootDoc.presNavButton ? "-selected" : "")} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Hide Before" className={pbi + (this.rootDoc.presHideTillShownButton ? "-selected" : "")} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={"file"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Hide After" className={pbi + (this.rootDoc.presHideAfterButton ? "-selected" : "")} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={"file-download"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Progressivize" className={pbi + (this.rootDoc.presProgressivize ? "-selected" : "")} onClick={this.progressivize}><FontAwesomeIcon icon={"tasks"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Effect" className={pbi + (this.rootDoc.presEffect ? "-selected" : "")}>E</button>
                </div>
                {this.renderEmbeddedInline}
            </div>
        );
    }
}
