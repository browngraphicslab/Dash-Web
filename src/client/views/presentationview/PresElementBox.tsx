import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile as fileRegular } from '@fortawesome/free-regular-svg-icons';
import { faArrowDown, faArrowUp, faFile as fileSolid, faFileDownload, faLocationArrow, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, reaction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { documentSchema } from '../../../new_fields/documentSchemas';
import { Id } from "../../../new_fields/FieldSymbols";
import { createSchema, makeInterface } from '../../../new_fields/Schema';
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnFalse, emptyPath } from "../../../Utils";
import { DocumentType } from "../../documents/DocumentTypes";
import { Transform } from "../../util/Transform";
import { CollectionViewType } from '../collections/CollectionView';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import { DocComponent, DocExtendableComponent } from '../DocComponent';
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
    presBoxKey: "string",
    showButton: "boolean",
    navButton: "boolean",
    hideTillShownButton: "boolean",
    fadeButton: "boolean",
    hideAfterButton: "boolean",
    groupButton: "boolean",
    embedOpen: "boolean"
});

type PresDocument = makeInterface<[typeof presSchema, typeof documentSchema]>;
const PresDocument = makeInterface(presSchema, documentSchema);
/**
 * This class models the view a document added to presentation will have in the presentation.
 * It involves some functionality for its buttons and options.
 */
@observer
export class PresElementBox extends DocExtendableComponent<FieldViewProps, PresDocument>(PresDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresElementBox, fieldKey); }

    _heightDisposer: IReactionDisposer | undefined;
    @computed get indexInPres() { return this.originalLayout?.presBoxKey ? DocListCast(this.presentationDoc[StrCast(this.originalLayout?.presBoxKey)]).indexOf(this.originalLayout) : 0; }
    @computed get presentationDoc() { return Cast(this.originalLayout?.presBox, Doc) as Doc; }
    @computed get originalLayout() { return this.props.Document.expandedTemplate as Doc; }
    @computed get targetDoc() { return this.originalLayout?.presentationTargetDoc as Doc; }
    @computed get currentIndex() { return NumCast(this.presentationDoc?.selectedDoc); }

    componentDidMount() {
        this._heightDisposer = reaction(() => [this.originalLayout.embedOpen, this.originalLayout.collapsedHeight],
            params => this.originalLayout._height = NumCast(params[1]) + (Number(params[0]) ? 100 : 0), { fireImmediately: true });
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
        this.originalLayout.hideTillShownButton = !this.originalLayout.hideTillShownButton;
        if (!this.originalLayout.hideTillShownButton) {
            if (this.indexInPres >= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            if (this.presentationDoc.presStatus && this.indexInPres > this.currentIndex && this.targetDoc) {
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
        this.originalLayout.hideAfterButton = !this.originalLayout.hideAfterButton;
        if (!this.originalLayout.hideAfterButton) {
            if (this.indexInPres <= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            if (this.originalLayout.fadeButton) this.originalLayout.fadeButton = false;
            if (this.presentationDoc.presStatus && this.indexInPres < this.currentIndex && this.targetDoc) {
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
        this.originalLayout.fadeButton = !this.originalLayout.fadeButton;
        if (!this.originalLayout.fadeButton) {
            if (this.indexInPres <= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            this.originalLayout.hideAfterButton = false;
            if (this.presentationDoc.presStatus && (this.indexInPres < this.currentIndex) && this.targetDoc) {
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
        this.originalLayout.navButton = !this.originalLayout.navButton;
        if (this.originalLayout.navButton) {
            this.originalLayout.showButton = false;
            if (this.currentIndex === this.indexInPres) {
                this.props.focus(this.originalLayout);
            }
        }
    }

    /**
    * The function that is called on click to turn zoom option of docs on/off.
    */
    @action
    onZoomDocumentClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        this.originalLayout.showButton = !this.originalLayout.showButton;
        if (!this.originalLayout.showButton) {
            this.originalLayout.viewScale = 1;
        } else {
            this.originalLayout.navButton = false;
            if (this.currentIndex === this.indexInPres) {
                this.props.focus(this.originalLayout);
            }
        }
    }
    /**
     * Returns a local transformed coordinate array for given coordinates.
     */
    ScreenToLocalListTransform = (xCord: number, yCord: number) => [xCord, yCord];

    /**
     * The function that is responsible for rendering the a preview or not for this
     * presentation element.
     */
    renderEmbeddedInline = () => {
        if (!this.originalLayout.embedOpen || !this.targetDoc) {
            return (null);
        }

        const propDocWidth = NumCast(this.layoutDoc._nativeWidth);
        const propDocHeight = NumCast(this.layoutDoc._nativeHeight);
        const scale = () => 175 / NumCast(this.layoutDoc._nativeWidth, 175);
        const layoutDoc = Doc.Layout(this.props.Document);
        if (!layoutDoc.embeddedView) {
            layoutDoc.embeddedView = Doc.MakeAlias(this.originalLayout);
            (layoutDoc.embeddedView as Doc).layoutKey = "layout";
        }
        const embedHeight = propDocHeight === 0 ? this.props.PanelHeight() - NumCast(this.originalLayout.collapsedHeight) : propDocHeight * scale();
        return (
            <div className="presElementBox-embedded" style={{
                height: embedHeight,
                width: propDocWidth === 0 ? "auto" : propDocWidth * scale(),
            }}>
                <ContentFittingDocumentView
                    Document={layoutDoc.embeddedView as Doc}
                    DataDocument={this.props.DataDoc}
                    LibraryPath={emptyPath}
                    fitToBox={StrCast(this.targetDoc.type).indexOf(DocumentType.COL) !== -1}
                    addDocument={returnFalse}
                    removeDocument={returnFalse}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    PanelWidth={() => this.props.PanelWidth() - 20}
                    PanelHeight={() => embedHeight}
                    getTransform={Transform.Identity}
                    active={this.props.active}
                    moveDocument={this.props.moveDocument!}
                    renderDepth={this.props.renderDepth + 1}
                    focus={emptyFunction}
                    whenActiveChanged={returnFalse}
                />
                <div className="presElementBox-embeddedMask" />
            </div>
        );
    }

    render() {
        const treecontainer = this.props.ContainingCollectionDoc?._viewType === CollectionViewType.Tree;
        const className = "presElementBox-item" + (this.currentIndex === this.indexInPres ? " presElementBox-selected" : "");
        const pbi = "presElementBox-interaction";
        return !this.originalLayout ? (null) : (
            <div className={className} key={this.props.Document[Id] + this.indexInPres}
                style={{ outlineWidth: Doc.IsBrushed(this.targetDoc) ? `1px` : "0px", }}
                onClick={e => { this.props.focus(this.originalLayout); e.stopPropagation(); }}>
                {treecontainer ? (null) : <>
                    <strong className="presElementBox-name">
                        {`${this.indexInPres + 1}. ${this.targetDoc?.title}`}
                    </strong>
                    <button className="presElementBox-closeIcon" onPointerDown={e => e.stopPropagation()} onClick={e => this.props.removeDocument && this.props.removeDocument(this.originalLayout)}>X</button>
                    <br />
                </>}
                <button title="Zoom" className={pbi + (this.originalLayout.showButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={pbi + (this.originalLayout.navButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Before" className={pbi + (this.originalLayout.hideTillShownButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade After" className={pbi + (this.originalLayout.fadeButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Hide After" className={pbi + (this.originalLayout.hideAfterButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Group With Up" className={pbi + (this.originalLayout.groupButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); this.originalLayout.groupButton = !this.originalLayout.groupButton; }}><FontAwesomeIcon icon={"arrow-up"} /></button>
                <button title="Expand Inline" className={pbi + (this.originalLayout.embedOpen ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); this.originalLayout.embedOpen = !this.originalLayout.embedOpen; }}><FontAwesomeIcon icon={"arrow-down"} /></button>

                <br style={{ lineHeight: 0.1 }} />
                {this.renderEmbeddedInline()}
            </div>
        );
    }
}