import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile as fileRegular } from '@fortawesome/free-regular-svg-icons';
import { faArrowDown, faArrowUp, faFile as fileSolid, faFileDownload, faLocationArrow, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DataSym } from "../../../new_fields/Doc";
import { documentSchema } from '../../../new_fields/documentSchemas';
import { Id } from "../../../new_fields/FieldSymbols";
import { createSchema, makeInterface } from '../../../new_fields/Schema';
import { Cast, NumCast } from "../../../new_fields/Types";
import { emptyFunction, emptyPath, returnFalse, returnTrue } from "../../../Utils";
import { Transform } from "../../util/Transform";
import { CollectionViewType } from '../collections/CollectionView';
import { ViewBoxBaseComponent } from '../DocComponent';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import "./PresElementBox.scss";
import React = require("react");

library.add(faArrowUp);
library.add(fileSolid);
library.add(faLocationArrow);
library.add(fileRegular as any);
library.add(faSearch);
library.add(faArrowDown);

export const presSchema = createSchema({
    presentationTargetDoc: Doc,
    presBox: Doc,
    zoomButton: "boolean",
    navButton: "boolean",
    hideTillShownButton: "boolean",
    fadeButton: "boolean",
    hideAfterButton: "boolean",
    groupButton: "boolean",
    expandInlineButton: "boolean"
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
    @computed get indexInPres() { return NumCast(this.presElementDoc?.presentationIndex); }
    @computed get presBoxDoc() { return Cast(this.presElementDoc?.presBox, Doc) as Doc; }
    @computed get presElementDoc() { return this.rootDoc; }
    @computed get presLayoutDoc() { return this.layoutDoc; }
    @computed get targetDoc() { return this.presElementDoc?.presentationTargetDoc as Doc; }
    @computed get currentIndex() { return NumCast(this.presBoxDoc?._itemIndex); }

    componentDidMount() {
        this._heightDisposer = reaction(() => [this.presElementDoc.expandInlineButton, this.presElementDoc.collapsedHeight],
            params => this.presLayoutDoc._height = NumCast(params[1]) + (Number(params[0]) ? 100 : 0), { fireImmediately: true });
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
        this.presElementDoc.hideTillShownButton = !this.presElementDoc.hideTillShownButton;
        if (!this.presElementDoc.hideTillShownButton) {
            if (this.indexInPres >= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            if (this.presBoxDoc.presStatus && this.indexInPres > this.currentIndex && this.targetDoc) {
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
        this.presElementDoc.hideAfterButton = !this.presElementDoc.hideAfterButton;
        if (!this.presElementDoc.hideAfterButton) {
            if (this.indexInPres <= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            if (this.presElementDoc.fadeButton) this.presElementDoc.fadeButton = false;
            if (this.presBoxDoc.presStatus && this.indexInPres < this.currentIndex && this.targetDoc) {
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
        this.presElementDoc.fadeButton = !this.presElementDoc.fadeButton;
        if (!this.presElementDoc.fadeButton) {
            if (this.indexInPres <= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            this.presElementDoc.hideAfterButton = false;
            if (this.presBoxDoc.presStatus && (this.indexInPres < this.currentIndex) && this.targetDoc) {
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
        this.presElementDoc.navButton = !this.presElementDoc.navButton;
        if (this.presElementDoc.navButton) {
            this.presElementDoc.zoomButton = false;
            if (this.currentIndex === this.indexInPres) {
                this.props.focus(this.presElementDoc);
            }
        }
    }

    /**
    * The function that is called on click to turn zoom option of docs on/off.
    */
    @action
    onZoomDocumentClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        this.presElementDoc.zoomButton = !this.presElementDoc.zoomButton;
        if (!this.presElementDoc.zoomButton) {
            this.presElementDoc.viewScale = 1;
        } else {
            this.presElementDoc.navButton = false;
            if (this.currentIndex === this.indexInPres) {
                this.props.focus(this.presElementDoc);
            }
        }
    }
    /**
     * Returns a local transformed coordinate array for given coordinates.
     */
    ScreenToLocalListTransform = (xCord: number, yCord: number) => [xCord, yCord];

    embedHeight = () => this.props.PanelHeight() - NumCast(this.presElementDoc.collapsedHeight);
    embedWidth = () => this.props.PanelWidth() - 20;
    /**
     * The function that is responsible for rendering the a preview or not for this
     * presentation element.
     */
    renderEmbeddedInline = () => {
        return !this.presElementDoc.expandInlineButton || !this.targetDoc ? (null) :
            <div className="presElementBox-embedded" style={{ height: this.embedHeight() }}>
                <ContentFittingDocumentView
                    Document={this.targetDoc}
                    DataDocument={this.targetDoc[DataSym] !== this.targetDoc && this.targetDoc[DataSym]}
                    LibraryPath={emptyPath}
                    fitToBox={true}
                    rootSelected={returnTrue}
                    addDocument={returnFalse}
                    removeDocument={returnFalse}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    PanelWidth={this.embedWidth}
                    PanelHeight={this.embedHeight}
                    getTransform={Transform.Identity}
                    active={this.props.active}
                    moveDocument={this.props.moveDocument!}
                    renderDepth={this.props.renderDepth + 1}
                    focus={emptyFunction}
                    whenActiveChanged={returnFalse}
                />
                <div className="presElementBox-embeddedMask" />
            </div>;
    }

    render() {
        const treecontainer = this.props.ContainingCollectionDoc?._viewType === CollectionViewType.Tree;
        const className = "presElementBox-item" + (this.currentIndex === this.indexInPres ? " presElementBox-selected" : "");
        const pbi = "presElementBox-interaction";
        return !(this.presElementDoc instanceof Doc) || this.targetDoc instanceof Promise ? (null) : (
            <div className={className} key={this.props.Document[Id] + this.indexInPres}
                style={{ outlineWidth: Doc.IsBrushed(this.targetDoc) ? `1px` : "0px", }}
                onClick={e => { this.props.focus(this.presElementDoc); e.stopPropagation(); }}>
                {treecontainer ? (null) : <>
                    <strong className="presElementBox-name">
                        {`${this.indexInPres + 1}. ${this.targetDoc?.title}`}
                    </strong>
                    <button className="presElementBox-closeIcon" onPointerDown={e => e.stopPropagation()} onClick={e => this.props.removeDocument?.(this.presElementDoc)}>X</button>
                    <br />
                </>}
                <button title="Zoom" className={pbi + (this.presElementDoc.zoomButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={pbi + (this.presElementDoc.navButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Before" className={pbi + (this.presElementDoc.hideTillShownButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade After" className={pbi + (this.presElementDoc.fadeButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Hide After" className={pbi + (this.presElementDoc.hideAfterButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Group With Up" className={pbi + (this.presElementDoc.groupButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); this.presElementDoc.groupButton = !this.presElementDoc.groupButton; }}><FontAwesomeIcon icon={"arrow-up"} /></button>
                <button title="Expand Inline" className={pbi + (this.presElementDoc.expandInlineButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); this.presElementDoc.expandInlineButton = !this.presElementDoc.expandInlineButton; }}><FontAwesomeIcon icon={"arrow-down"} /></button>

                <br style={{ lineHeight: 0.1 }} />
                {this.renderEmbeddedInline()}
            </div>
        );
    }
}