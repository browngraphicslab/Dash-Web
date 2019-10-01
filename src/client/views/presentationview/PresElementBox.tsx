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
    private _embedHeight = 100;

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
    @computed get embedInline() { return BoolCast(this.props.Document.embedOpen); }

    set embedInline(value: boolean) { this.props.Document.embedOpen = value; }
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
        if (!this.embedInline || !(this.props.Document.target instanceof Doc)) {
            return (null);
        }

        let propDocWidth = NumCast(this.props.Document.nativeWidth);
        let propDocHeight = NumCast(this.props.Document.nativeHeight);
        let scale = () => 175 / NumCast(this.props.Document.nativeWidth, 175);
        return (
            <div className="presElementBox-embedded" style={{
                height: propDocHeight === 0 ? this._embedHeight : propDocHeight * scale(),
                width: propDocWidth === 0 ? "auto" : propDocWidth * scale(),
            }}>
                <DocumentView
                    fitToBox={StrCast(this.props.Document.type).indexOf(DocumentType.COL) !== -1}
                    Document={this.props.Document.target}
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

        let treecontainer = this.props.ContainingCollectionDoc && this.props.ContainingCollectionDoc.viewType === CollectionViewType.Tree;
        let className = "presElementBox-item" + (this.currentIndex === this.myIndex ? " presElementBox-selected" : "");
        return (
            <div className={className} key={p.Document[Id] + this.myIndex}
                style={{ outlineWidth: Doc.IsBrushed(p.Document) ? `1px` : "0px", }}
                onClick={e => p.focus(p.Document)}>
                {treecontainer ? (null) : <>
                    <strong className="presElementBox-name">
                        {`${this.myIndex + 1}. ${p.Document.title}`}
                    </strong>
                    <button className="presElementBox-icon" onPointerDown={e => e.stopPropagation()} onClick={e => this.props.removeDocument && this.props.removeDocument(p.Document)}>X</button>
                    <br />
                </>
                }
                <button title="Zoom" className={"presElementBox-interaction" + (this.showButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onZoomDocumentClick}><FontAwesomeIcon icon={"search"} /></button>
                <button title="Navigate" className={"presElementBox-interaction" + (this.navButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onNavigateDocumentClick}><FontAwesomeIcon icon={"location-arrow"} /></button>
                <button title="Hide Til Presented" className={"presElementBox-interaction" + (this.hideTillShownButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentUntilPressClick}><FontAwesomeIcon icon={fileSolid} /></button>
                <button title="Fade After Presented" className={"presElementBox-interaction" + (this.fadeButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onFadeDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Hide After Presented" className={"presElementBox-interaction" + (this.hideAfterButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={this.onHideDocumentAfterPresentedClick}><FontAwesomeIcon icon={faFileDownload} /></button>
                <button title="Group With Up" className={"presElementBox-interaction" + (this.groupButton ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={action((e: any) => { e.stopPropagation(); this.groupButton = !this.groupButton; })}> <FontAwesomeIcon icon={"arrow-up"} /> </button>
                <button title="Expand Inline" className={"presElementBox-interaction" + (this.embedInline ? "-selected" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={action((e: any) => {
                    this.embedInline = !this.embedInline;
                    this.props.Document.height = NumCast(this.props.Document.height) + (this.embedInline ? 1 : -1) * this._embedHeight;
                    e.stopPropagation();
                })}><FontAwesomeIcon icon={"arrow-down"} /></button>

                <br />
                {this.renderEmbeddedInline()}
            </div>
        );
    }
}