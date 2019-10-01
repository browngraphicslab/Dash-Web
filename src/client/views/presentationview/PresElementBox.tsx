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
import { Transform } from "../../util/Transform";
import { CollectionViewType } from '../collections/CollectionBaseView';
import { DocumentView } from "../nodes/DocumentView";
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import "./PresElementBox.scss";
import React = require("react");
import { CollectionSchemaPreview } from '../collections/CollectionSchemaView';


library.add(faArrowUp);
library.add(fileSolid);
library.add(faLocationArrow);
library.add(fileRegular as any);
library.add(faSearch);
library.add(faArrowDown);
/**
 * This class models the view a document added to presentation will have in the presentation.
 * It involves some functionality for its buttons and options.
 */
@observer
export class PresElementBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(PresElementBox); }

    @computed get myIndex() { return DocListCast(this.presentationDoc[this.presentationFieldKey]).indexOf(this.props.Document); }
    @computed get presentationDoc() { return this.props.Document.presBox as Doc; }
    @computed get presentationFieldKey() { return StrCast(this.props.Document.presBoxKey); }
    @computed get currentIndex() { return NumCast(this.presentationDoc.selectedDoc); }
    @computed get showButton() { return BoolCast(this.props.Document.showButton); }
    @computed get navButton() { return BoolCast(this.props.Document.navButton); }
    @computed get hideTillShownButton() { return BoolCast(this.props.Document.hideTillShownButton); }
    @computed get fadeButton() { return BoolCast(this.props.Document.fadeButton); }
    @computed get hideAfterButton() { return BoolCast(this.props.Document.hideAfterButton); }
    @computed get groupButton() { return BoolCast(this.props.Document.groupButton); }
    @computed get embedOpen() { return BoolCast(this.props.Document.embedOpen); }

    set embedOpen(value: boolean) { this.props.Document.embedOpen = value; }
    set showButton(val: boolean) { this.props.Document.showButton = val; }
    set navButton(val: boolean) { this.props.Document.navButton = val; }
    set hideTillShownButton(val: boolean) { this.props.Document.hideTillShownButton = val; }
    set fadeButton(val: boolean) { this.props.Document.fadeButton = val; }
    set hideAfterButton(val: boolean) { this.props.Document.hideAfterButton = val; }
    set groupButton(val: boolean) { this.props.Document.groupButton = val; }

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
     * Returns a local transformed coordinate array for given coordinates.
     */
    ScreenToLocalListTransform = (xCord: number, yCord: number) => [xCord, yCord];

    /**
     * The function that is responsible for rendering the a preview or not for this
     * presentation element.
     */
    renderEmbeddedInline = () => {
        if (!this.embedOpen || !(this.props.Document.target instanceof Doc)) {
            return (null);
        }

        let propDocWidth = NumCast(this.props.Document.nativeWidth);
        let propDocHeight = NumCast(this.props.Document.nativeHeight);
        let scale = () => 175 / NumCast(this.props.Document.nativeWidth, 175);
        return (
            <div className="presElementBox-embedded" style={{
                height: propDocHeight === 0 ? NumCast(this.props.Document.height) - NumCast(this.props.Document.collapsedHeight) : propDocHeight * scale(),
                width: propDocWidth === 0 ? "auto" : propDocWidth * scale(),
            }}>
                <CollectionSchemaPreview
                    fitToBox={StrCast(this.props.Document.target.type).indexOf(DocumentType.COL) !== -1}
                    Document={this.props.Document.target}
                    addDocument={returnFalse}
                    removeDocument={returnFalse}
                    ruleProvider={undefined}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    PanelWidth={() => this.props.PanelWidth() - 20}
                    PanelHeight={() => 100}
                    setPreviewScript={emptyFunction}
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
        let p = this.props;

        let treecontainer = this.props.ContainingCollectionDoc && this.props.ContainingCollectionDoc.viewType === CollectionViewType.Tree;
        let className = "presElementBox-item" + (this.currentIndex === this.myIndex ? " presElementBox-selected" : "");
        let pbi = "presElementBox-interaction";
        return (
            <div className={className} key={p.Document[Id] + this.myIndex}
                style={{ outlineWidth: Doc.IsBrushed(p.Document.target as Doc) ? `1px` : "0px", }}
                onClick={e => { p.focus(p.Document); e.stopPropagation(); }}>
                {treecontainer ? (null) : <>
                    <strong className="presElementBox-name">
                        {`${this.myIndex + 1}. ${p.Document.title}`}
                    </strong>
                    <button className="presElementBox-closeIcon" onPointerDown={e => e.stopPropagation()} onClick={e => this.props.removeDocument && this.props.removeDocument(p.Document)}>X</button>
                    <br />
                </>
                }
                <button title="Zoom" className={pbi + (this.showButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={pbi + (this.navButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Before" className={pbi + (this.hideTillShownButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade After" className={pbi + (this.fadeButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Hide After" className={pbi + (this.hideAfterButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Group With Up" className={pbi + (this.groupButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={action((e: any) => { e.stopPropagation(); this.groupButton = !this.groupButton; })}><FontAwesomeIcon icon={"arrow-up"} /></button>
                <button title="Expand Inline" className={pbi + (this.embedOpen ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={action((e: any) => { e.stopPropagation(); this.embedOpen = !this.embedOpen; })}><FontAwesomeIcon icon={"arrow-down"} /></button>

                <br style={{ lineHeight: 0.1 }} />
                {this.renderEmbeddedInline()}
            </div>
        );
    }
}