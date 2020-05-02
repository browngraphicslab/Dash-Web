import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DataSym, DocListCast } from "../../../new_fields/Doc";
import { documentSchema } from '../../../new_fields/documentSchemas';
import { Id } from "../../../new_fields/FieldSymbols";
import { createSchema, makeInterface } from '../../../new_fields/Schema';
import { Cast, NumCast, BoolCast } from "../../../new_fields/Types";
import { emptyFunction, emptyPath, returnFalse, returnTrue, returnOne, returnZero } from "../../../Utils";
import { Transform } from "../../util/Transform";
import { CollectionViewType } from '../collections/CollectionView';
import { ViewBoxBaseComponent } from '../DocComponent';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import "./PresElementBox.scss";
import React = require("react");

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
    @computed get indexInPres() { return DocListCast(this.layoutDoc.presOrderedDocs).findIndex(d => d === this.rootDoc); }
    @computed get collapsedHeight() { return NumCast(this.layoutDoc.presCollapsedHeight); }
    @computed get presStatus() { return BoolCast(this.layoutDoc.presStatus); }
    @computed get currentIndex() { return NumCast(this.layoutDoc.currentIndex); }
    @computed get targetDoc() { return this.rootDoc.presentationTargetDoc as Doc; }

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
            if (this.indexInPres >= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            if (this.presStatus && this.indexInPres > this.currentIndex && this.targetDoc) {
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
            if (this.indexInPres <= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            if (this.rootDoc.presFadeButton) this.rootDoc.presFadeButton = false;
            if (this.presStatus && this.indexInPres < this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 0;
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
        this.rootDoc.presFadeButton = !this.rootDoc.presFadeButton;
        if (!this.rootDoc.presFadeButton) {
            if (this.indexInPres <= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            this.rootDoc.presHideAfterButton = false;
            if (this.presStatus && (this.indexInPres < this.currentIndex) && this.targetDoc) {
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
            if (this.currentIndex === this.indexInPres) {
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
            if (this.currentIndex === this.indexInPres) {
                this.props.focus(this.rootDoc);
            }
        }
    }
    /**
     * Returns a local transformed coordinate array for given coordinates.
     */
    ScreenToLocalListTransform = (xCord: number, yCord: number) => [xCord, yCord];

    embedHeight = () => Math.min(this.props.PanelWidth() - 20, this.props.PanelHeight() - this.collapsedHeight);
    embedWidth = () => this.props.PanelWidth() - 20;
    /**
     * The function that is responsible for rendering the a preview or not for this
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
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    ContentScaling={returnOne}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                />
                <div className="presElementBox-embeddedMask" />
            </div>;
    }

    render() {
        const treecontainer = this.props.ContainingCollectionDoc?._viewType === CollectionViewType.Tree;
        const className = "presElementBox-item" + (this.currentIndex === this.indexInPres ? " presElementBox-active" : "");
        const pbi = "presElementBox-interaction";
        return !(this.rootDoc instanceof Doc) || this.targetDoc instanceof Promise ? (null) : (
            <div className={className} key={this.props.Document[Id] + this.indexInPres}
                style={{ outlineWidth: Doc.IsBrushed(this.targetDoc) ? `1px` : "0px", }}
                onClick={e => { this.props.focus(this.rootDoc); e.stopPropagation(); }}>
                {treecontainer ? (null) : <>
                    <strong className="presElementBox-name">
                        {`${this.indexInPres + 1}. ${this.targetDoc?.title}`}
                    </strong>
                    <button className="presElementBox-closeIcon" onPointerDown={e => e.stopPropagation()} onClick={e => this.props.removeDocument?.(this.rootDoc)}>X</button>
                    <br />
                </>}
                <div className="presElementBox-buttons">
                    <button title="Zoom" className={pbi + (this.rootDoc.presZoomButton ? "-selected" : "")} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Navigate" className={pbi + (this.rootDoc.presNavButton ? "-selected" : "")} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Hide Before" className={pbi + (this.rootDoc.presHideTillShownButton ? "-selected" : "")} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={"file"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Fade After" className={pbi + (this.rootDoc.presFadeButton ? "-selected" : "")} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={"file-download"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Hide After" className={pbi + (this.rootDoc.presHideAfterButton ? "-selected" : "")} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={"file-download"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Group With Up" className={pbi + (this.rootDoc.presGroupButton ? "-selected" : "")} onClick={e => { e.stopPropagation(); this.rootDoc.presGroupButton = !this.rootDoc.presGroupButton; }}><FontAwesomeIcon icon={"arrow-up"} onPointerDown={e => e.stopPropagation()} /></button>
                    <button title="Expand Inline" className={pbi + (this.rootDoc.presExpandInlineButton ? "-selected" : "")} onClick={e => { e.stopPropagation(); this.rootDoc.presExpandInlineButton = !this.rootDoc.presExpandInlineButton; }}><FontAwesomeIcon icon={"arrow-down"} onPointerDown={e => e.stopPropagation()} /></button>
                </div>
                {this.renderEmbeddedInline}
            </div>
        );
    }
}