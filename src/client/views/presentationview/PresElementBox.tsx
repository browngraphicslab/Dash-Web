import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile as fileRegular } from '@fortawesome/free-regular-svg-icons';
import { faArrowDown, faArrowUp, faFile as fileSolid, faFileDownload, faLocationArrow, faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed } from "mobx";
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
import { DocComponent } from '../DocComponent';
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
export class PresElementBox extends DocComponent<FieldViewProps, PresDocument>(PresDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PresElementBox, fieldKey); }

    @computed get indexInPres() { return DocListCast(this.presentationDoc[this.Document.presBoxKey || ""]).indexOf(this.props.Document); }
    @computed get presentationDoc() { return Cast(this.Document.presBox, Doc) as Doc; }
    @computed get targetDoc() { return this.Document.presentationTargetDoc as Doc; }
    @computed get currentIndex() { return NumCast(this.presentationDoc.selectedDoc); }

    /**
     * The function that is called on click to turn Hiding document till press option on/off.
     * It also sets the beginning and end opacitys.
     */
    @action
    onHideDocumentUntilPressClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.Document.hideTillShownButton = !this.Document.hideTillShownButton;
        if (!this.Document.hideTillShownButton) {
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
        this.Document.hideAfterButton = !this.Document.hideAfterButton;
        if (!this.Document.hideAfterButton) {
            if (this.indexInPres <= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            if (this.Document.fadeButton) this.Document.fadeButton = false;
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
        this.Document.fadeButton = !this.Document.fadeButton;
        if (!this.Document.fadeButton) {
            if (this.indexInPres <= this.currentIndex && this.targetDoc) {
                this.targetDoc.opacity = 1;
            }
        } else {
            this.Document.hideAfterButton = false;
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
        this.Document.navButton = !this.Document.navButton;
        if (this.Document.navButton) {
            this.Document.showButton = false;
            if (this.currentIndex === this.indexInPres) {
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

        this.Document.showButton = !this.Document.showButton;
        if (!this.Document.showButton) {
            this.props.Document.viewScale = 1;
        } else {
            this.Document.navButton = false;
            if (this.currentIndex === this.indexInPres) {
                this.props.focus(this.props.Document);
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
        if (!this.Document.embedOpen || !this.targetDoc) {
            return (null);
        }

        const propDocWidth = NumCast(this.layoutDoc.nativeWidth);
        const propDocHeight = NumCast(this.layoutDoc.nativeHeight);
        const scale = () => 175 / NumCast(this.layoutDoc.nativeWidth, 175);
        return (
            <div className="presElementBox-embedded" style={{
                height: propDocHeight === 0 ? NumCast(this.layoutDoc.height) - NumCast(this.layoutDoc.collapsedHeight) : propDocHeight * scale(),
                width: propDocWidth === 0 ? "auto" : propDocWidth * scale(),
            }}>
                <ContentFittingDocumentView
                    Document={this.targetDoc}
                    LibraryPath={emptyPath}
                    fitToBox={StrCast(this.targetDoc.type).indexOf(DocumentType.COL) !== -1}
                    addDocument={returnFalse}
                    removeDocument={returnFalse}
                    ruleProvider={undefined}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    PanelWidth={() => this.props.PanelWidth() - 20}
                    PanelHeight={() => 100}
                    getTransform={Transform.Identity}
                    active={this.props.active}
                    moveDocument={this.props.moveDocument!}
                    renderDepth={1}
                    focus={emptyFunction}
                    whenActiveChanged={returnFalse}
                />
                <div className="presElementBox-embeddedMask" />
            </div>
        );
    }

    render() {
        const treecontainer = this.props.ContainingCollectionDoc && this.props.ContainingCollectionDoc.viewType === CollectionViewType.Tree;
        const className = "presElementBox-item" + (this.currentIndex === this.indexInPres ? " presElementBox-selected" : "");
        const pbi = "presElementBox-interaction";
        return (
            <div className={className} key={this.props.Document[Id] + this.indexInPres}
                style={{ outlineWidth: Doc.IsBrushed(this.targetDoc) ? `1px` : "0px", }}
                onClick={e => { this.props.focus(this.props.Document); e.stopPropagation(); }}>
                {treecontainer ? (null) : <>
                    <strong className="presElementBox-name">
                        {`${this.indexInPres + 1}. ${this.Document.title}`}
                    </strong>
                    <button className="presElementBox-closeIcon" onPointerDown={e => e.stopPropagation()} onClick={e => this.props.removeDocument && this.props.removeDocument(this.props.Document)}>X</button>
                    <br />
                </>}
                <button title="Zoom" className={pbi + (this.Document.showButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={pbi + (this.Document.navButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Before" className={pbi + (this.Document.hideTillShownButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade After" className={pbi + (this.Document.fadeButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Hide After" className={pbi + (this.Document.hideAfterButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Group With Up" className={pbi + (this.Document.groupButton ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); this.Document.groupButton = !this.Document.groupButton; }}><FontAwesomeIcon icon={"arrow-up"} /></button>
                <button title="Expand Inline" className={pbi + (this.Document.embedOpen ? "-selected" : "")} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); this.Document.embedOpen = !this.Document.embedOpen; }}><FontAwesomeIcon icon={"arrow-down"} /></button>

                <br style={{ lineHeight: 0.1 }} />
                {this.renderEmbeddedInline()}
            </div>
        );
    }
}