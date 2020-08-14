import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faArrowAltCircleDown, faArrowAltCircleRight, faArrowAltCircleUp, faCheckCircle, faCloudUploadAlt, faLink, faPhotoVideo, faShare, faStopCircle, faSyncAlt, faTag, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../fields/Doc";
import { RichTextField } from '../../fields/RichTextField';
import { Cast, NumCast, BoolCast } from "../../fields/Types";
import { emptyFunction, setupMoveUpEvents, Utils } from "../../Utils";
import GoogleAuthenticationManager from '../apis/GoogleAuthenticationManager';
import { Pulls, Pushes } from '../apis/google_docs/GoogleApiClientUtils';
import { Docs, DocUtils } from '../documents/Documents';
import { DragManager } from '../util/DragManager';
import { CollectionDockingView, DockedFrameRenderer } from './collections/CollectionDockingView';
import { ParentDocSelector } from './collections/ParentDocumentSelector';
import './collections/ParentDocumentSelector.scss';
import './PropertiesButtons.scss';
import { MetadataEntryMenu } from './MetadataEntryMenu';
import { DocumentView } from './nodes/DocumentView';
import { GoogleRef } from "./nodes/formattedText/FormattedTextBox";
import { TemplateMenu } from "./TemplateMenu";
import { Template, Templates } from "./Templates";
import React = require("react");
import { Tooltip } from '@material-ui/core';
import { SelectionManager } from '../util/SelectionManager';
import SharingManager from '../util/SharingManager';
import { GooglePhotos } from '../apis/google_docs/GooglePhotosClientUtils';
import { ImageField } from '../../fields/URLField';
import { undoBatch, UndoManager } from '../util/UndoManager';
import { DocumentType } from '../documents/DocumentTypes';
import { InkField } from '../../fields/InkField';
import { PresBox } from './nodes/PresBox';
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

library.add(faLink);
library.add(faTag);
library.add(faTimes);
library.add(faArrowAltCircleDown);
library.add(faArrowAltCircleUp);
library.add(faArrowAltCircleRight);
library.add(faStopCircle);
library.add(faCheckCircle);
library.add(faCloudUploadAlt);
library.add(faSyncAlt);
library.add(faShare);
library.add(faPhotoVideo);

const cloud: IconProp = "cloud-upload-alt";
const fetch: IconProp = "sync-alt";

enum UtilityButtonState {
    Default,
    OpenRight,
    OpenExternally
}

@observer
export class PropertiesButtons extends React.Component<{}, {}> {
    private _dragRef = React.createRef<HTMLDivElement>();
    private _pullAnimating = false;
    private _pushAnimating = false;
    private _pullColorAnimating = false;

    @observable private pushIcon: IconProp = "arrow-alt-circle-up";
    @observable private pullIcon: IconProp = "arrow-alt-circle-down";
    @observable private pullColor: string = "white";
    @observable public isAnimatingFetch = false;
    @observable public isAnimatingPulse = false;

    @observable private openHover: UtilityButtonState = UtilityButtonState.Default;

    @observable public static Instance: PropertiesButtons;
    public static hasPushedHack = false;
    public static hasPulledHack = false;


    @computed get selectedDocumentView() {
        if (SelectionManager.SelectedDocuments().length) {
            return SelectionManager.SelectedDocuments()[0];
        } else { return undefined; }
    }
    @computed get selectedDoc() { return this.selectedDocumentView?.rootDoc; }
    @computed get dataDoc() { return this.selectedDocumentView?.dataDoc; }

    @computed get onClick() { return this.selectedDoc?.onClickBehavior ? this.selectedDoc?.onClickBehavior : "nothing"; }

    public startPullOutcome = action((success: boolean) => {
        if (!this._pullAnimating) {
            this._pullAnimating = true;
            this.pullIcon = success ? "check-circle" : "stop-circle";
            setTimeout(() => runInAction(() => {
                this.pullIcon = "arrow-alt-circle-down";
                this._pullAnimating = false;
            }), 1000);
        }
    });

    public startPushOutcome = action((success: boolean) => {
        this.isAnimatingPulse = false;
        if (!this._pushAnimating) {
            this._pushAnimating = true;
            this.pushIcon = success ? "check-circle" : "stop-circle";
            setTimeout(() => runInAction(() => {
                this.pushIcon = "arrow-alt-circle-up";
                this._pushAnimating = false;
            }), 1000);
        }
    });

    public setPullState = action((unchanged: boolean) => {
        this.isAnimatingFetch = false;
        if (!this._pullColorAnimating) {
            this._pullColorAnimating = true;
            this.pullColor = unchanged ? "lawngreen" : "red";
            setTimeout(this.clearPullColor, 1000);
        }
    });

    private clearPullColor = action(() => {
        this.pullColor = "white";
        this._pullColorAnimating = false;
    });

    @computed
    get considerGoogleDocsPush() {
        const targetDoc = this.selectedDoc;
        const published = targetDoc && Doc.GetProto(targetDoc)[GoogleRef] !== undefined;
        const animation = this.isAnimatingPulse ? "shadow-pulse 1s linear infinite" : "none";
        return !targetDoc ? (null) : <Tooltip title={<div className="dash-tooltip">{`${published ? "Push" : "Publish"} to Google Docs`}</div>} placement="top">
            <div>
                <div
                    className="propertiesButtons-linker"
                    style={{ animation }}
                    onClick={async () => {
                        await GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken();
                        !published && runInAction(() => this.isAnimatingPulse = true);
                        PropertiesButtons.hasPushedHack = false;
                        targetDoc[Pushes] = NumCast(targetDoc[Pushes]) + 1;
                    }}>
                    <FontAwesomeIcon className="documentdecorations-icon" icon={published ? (this.pushIcon as any) : cloud} size={published ? "lg" : "sm"} />
                </div>
                <div className="propertiesButtons-title">Google</div>
            </div>
        </Tooltip>;
    }

    @computed
    get considerGoogleDocsPull() {
        const targetDoc = this.selectedDoc;
        const dataDoc = targetDoc && Doc.GetProto(targetDoc);
        const animation = this.isAnimatingFetch ? "spin 0.5s linear infinite" : "none";

        const title = (() => {
            switch (this.openHover) {
                default:
                case UtilityButtonState.Default: return `${!dataDoc?.unchanged ? "Pull from" : "Fetch"} Google Docs`;
                case UtilityButtonState.OpenRight: return "Open in Right Split";
                case UtilityButtonState.OpenExternally: return "Open in new Browser Tab";
            }
        })();

        return !targetDoc || !dataDoc || !dataDoc[GoogleRef] ? (null) : <Tooltip
            title={<><div className="dash-tooltip">{title}</div></>} placement="top">
            <div>
                <div className="propertiesButtons-linker"
                    style={{ backgroundColor: this.pullColor }}
                    onPointerEnter={action(e => {
                        if (e.altKey) {
                            this.openHover = UtilityButtonState.OpenExternally;
                        } else if (e.shiftKey) {
                            this.openHover = UtilityButtonState.OpenRight;
                        }
                    })}
                    onPointerLeave={action(() => this.openHover = UtilityButtonState.Default)}
                    onClick={async e => {
                        const googleDocUrl = `https://docs.google.com/document/d/${dataDoc[GoogleRef]}/edit`;
                        if (e.shiftKey) {
                            e.preventDefault();
                            let googleDoc = await Cast(dataDoc.googleDoc, Doc);
                            if (!googleDoc) {
                                const options = { _width: 600, _nativeWidth: 960, _nativeHeight: 800, isAnnotating: false, UseCors: false };
                                googleDoc = Docs.Create.WebDocument(googleDocUrl, options);
                                dataDoc.googleDoc = googleDoc;
                            }
                            CollectionDockingView.AddRightSplit(googleDoc);
                        } else if (e.altKey) {
                            e.preventDefault();
                            window.open(googleDocUrl);
                        } else {
                            this.clearPullColor();
                            PropertiesButtons.hasPulledHack = false;
                            targetDoc[Pulls] = NumCast(targetDoc[Pulls]) + 1;
                            dataDoc.unchanged && runInAction(() => this.isAnimatingFetch = true);
                        }
                    }}>
                    <FontAwesomeIcon className="documentdecorations-icon" size="lg"
                        color="black"
                        style={{ WebkitAnimation: animation, MozAnimation: animation }}
                        icon={(() => {
                            switch (this.openHover) {
                                default:
                                case UtilityButtonState.Default: return dataDoc.unchanged === false ? (this.pullIcon as any) : fetch;
                                case UtilityButtonState.OpenRight: return "arrow-alt-circle-right";
                                case UtilityButtonState.OpenExternally: return "share";
                            }
                        })()}
                    />
                </div>
                <div className="propertiesButtons-title" style={{ backgroundColor: "white", color: "black" }}>Fetch</div>
            </div>
        </Tooltip>;
    }
    @computed
    get pinButton() {
        const targetDoc = this.selectedDoc;
        const isPinned = targetDoc && Doc.isDocPinned(targetDoc);
        return !targetDoc ? (null) : <Tooltip title={<div className="dash-tooltip">{Doc.isDocPinned(targetDoc) ? "Unpin from presentation" : "Pin to presentation"}</div>} placement="top">
            <div>
                <div className="propertiesButtons-linker"
                    style={{ backgroundColor: isPinned ? "white" : "", color: isPinned ? "black" : "white" }}
                    onClick={e => DockedFrameRenderer.PinDoc(targetDoc, isPinned)}>
                    <FontAwesomeIcon className="documentdecorations-icon" size="lg" icon="map-pin" />
                </div>

                <div className="propertiesButtons-title"
                // style={{
                //     backgroundColor: Doc.isDocPinned(targetDoc) ? "white" : "black",
                //     color: Doc.isDocPinned(targetDoc) ? "black" : "white"
                // }}
                >{Doc.isDocPinned(targetDoc) ? "Unpin" : "Pin"}</div>
            </div>
        </Tooltip>;
    }

    @computed
    get pinWithViewButton() {
        const targetDoc = this.selectedDoc;
        if (targetDoc) {
            const x = targetDoc._panX;
            const y = targetDoc._panY;
            const scale = targetDoc._viewScale;
        }
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{"Pin with this view"}</div></>} placement="top">
            <div>
                <div className="propertiesButtons-linker"
                    onClick={e => {
                        if (targetDoc) {
                            DockedFrameRenderer.PinDoc(targetDoc, false);
                            const activeDoc = PresBox.Instance.childDocs[PresBox.Instance.childDocs.length - 1];
                            const x = targetDoc._panX;
                            const y = targetDoc._panY;
                            const scale = targetDoc._viewScale;
                            activeDoc.presPinView = true;
                            activeDoc.presPinViewX = x;
                            activeDoc.presPinViewY = y;
                            activeDoc.presPinViewScale = scale;
                        }
                    }}>
                    <FontAwesomeIcon className="documentdecorations-icon" size="lg" icon="map-pin" />
                    <div style={{ position: 'relative', fontSize: 25, fontWeight: 700, transform: 'translate(0, -28px)', color: 'rgba(250,250,250,0.55)' }}>V</div>
                </div>

                <div className="propertiesButtons-title">{"View"}</div>
            </div>
        </Tooltip>;
    }


    @computed
    get metadataButton() {
        //const view0 = this.view0;
        if (this.selectedDoc) {
            return <Tooltip title={<><div className="dash-tooltip">Show metadata panel</div></>} placement="top">
                <div className="propertiesButtons-linkFlyout">
                    <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                        content={<MetadataEntryMenu docs={[this.selectedDoc]} suggestWithFunction />  /* tfs: @bcz This might need to be the data document? */}>
                        <div>
                            <div className={"propertiesButtons-linkButton-" + "empty"} onPointerDown={e => e.stopPropagation()} >
                                {<FontAwesomeIcon className="documentdecorations-icon" icon="tag" size="lg" />}
                            </div>
                            <div className="propertiesButtons-title">Metadata</div>
                        </div>
                    </Flyout>
                </div></Tooltip>;
        } else {
            return null;
        }

    }

    @observable _aliasDown = false;
    onAliasButtonDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onAliasButtonMoved, emptyFunction, emptyFunction);
    }
    @undoBatch
    onAliasButtonMoved = () => {
        if (this._dragRef.current) {
            const dragDocView = this.selectedDocumentView!;
            const dragData = new DragManager.DocumentDragData([dragDocView.props.Document]);
            const [left, top] = dragDocView.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            dragData.dropAction = "alias";
            DragManager.StartDocumentDrag([dragDocView.ContentDiv!], dragData, left, top, {
                offsetX: dragData.offset[0],
                offsetY: dragData.offset[1],
                hideSource: false
            });
            return true;
        }
        return false;
    }

    @computed
    get templateButton() {
        const docView = this.selectedDocumentView;
        const templates: Map<Template, boolean> = new Map();
        const views = [this.selectedDocumentView];
        Array.from(Object.values(Templates.TemplateList)).map(template =>
            templates.set(template, views.reduce((checked, doc) => checked || doc?.props.Document["_show" + template.Name] ? true : false, false as boolean)));
        return !docView ? (null) :
            <Tooltip title={<><div className="dash-tooltip">Customize layout</div></>} placement="top">
                <div className="propertiesButtons-linkFlyout">
                    <Flyout anchorPoint={anchorPoints.LEFT_TOP} //onOpen={action(() => this._aliasDown = true)} onClose={action(() => this._aliasDown = false)}
                        content={<TemplateMenu docViews={views.filter(v => v).map(v => v as DocumentView)} templates={templates} />}>
                        <div>
                            <div className={"propertiesButtons-linkButton-empty"} >
                                {<FontAwesomeIcon className="documentdecorations-icon" icon="edit" size="lg" />}
                            </div>
                            <div className="propertiesButtons-title">Layout</div>
                        </div>
                    </Flyout>
                </div></Tooltip>;
    }

    @undoBatch
    onCopy = () => {
        if (this.selectedDoc && this.selectedDocumentView) {
            // const copy = Doc.MakeCopy(this.selectedDocumentView.props.Document, true);
            // copy.x = NumCast(this.selectedDoc.x) + NumCast(this.selectedDoc._width);
            // copy.y = NumCast(this.selectedDoc.y) + 30;
            // this.selectedDocumentView.props.addDocument?.(copy);
            const alias = Doc.MakeAlias(this.selectedDoc);
            alias.x = NumCast(this.selectedDoc.x) + NumCast(this.selectedDoc._width);
            alias.y = NumCast(this.selectedDoc.y) + 30;
            this.selectedDocumentView.props.addDocument?.(alias);
        }
    }

    @computed
    get copyButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{"Tap or Drag to create an alias"}</div></>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"}
                    ref={this._dragRef}
                    onPointerDown={this.onAliasButtonDown}
                    onClick={this.onCopy}>
                    {<FontAwesomeIcon className="documentdecorations-icon" icon="copy" size="lg" />}
                </div>
                <div className="propertiesButtons-title">Alias</div>
            </div>
        </Tooltip>;
    }

    @action @undoBatch
    onLock = () => {
        this.selectedDocumentView?.toggleLockPosition();
    }

    @computed
    get lockButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">{this.selectedDoc?.lockedPosition ?
                "Unlock Position" : "Lock Position"}</div></>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"}
                    style={{ backgroundColor: BoolCast(this.selectedDoc?.lockedPosition) ? "white" : "" }}
                    onPointerDown={this.onLock} >
                    {<FontAwesomeIcon className="documentdecorations-icon"
                        color={BoolCast(this.selectedDoc?.lockedPosition) ? "black" : "white"}
                        icon={BoolCast(this.selectedDoc?.lockedPosition) ? "unlock" : "lock"} size="lg" />}
                </div>
                <div className="propertiesButtons-title"
                // style={{
                //     backgroundColor: BoolCast(this.selectedDoc?.lockedPosition) ? "white" : "black",
                //     color: BoolCast(this.selectedDoc?.lockedPosition) ? "black" : "white"
                // }}
                >Position </div>
            </div>
        </Tooltip>;
    }

    @computed
    get downloadButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">{"Download Document"}</div></>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"}
                    onPointerDown={async () => {
                        if (this.selectedDocumentView?.props.Document) {
                            Doc.Zip(this.selectedDocumentView?.props.Document);
                        }
                    }}>
                    {<FontAwesomeIcon className="propertiesButtons-icon"
                        icon="download" size="lg" />}
                </div>
                <div className="propertiesButtons-title"> downld </div>
            </div>
        </Tooltip>;
    }

    @computed
    get deleteButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">Close Document</div></>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"}
                    onPointerDown={this.deleteDocument}>
                    {<FontAwesomeIcon className="propertiesButtons-icon"
                        icon="times" size="lg" />}
                </div>
                <div className="propertiesButtons-title"> close </div>
            </div>
        </Tooltip>;
    }

    @undoBatch
    @action
    deleteDocument = () => {
        const selected = SelectionManager.SelectedDocuments().slice();
        selected.map(dv => dv.props.removeDocument?.(dv.props.Document));
        this.selectedDoc && (this.selectedDoc.deleted = true);
        this.selectedDocumentView?.props.ContainingCollectionView?.removeDocument(this.selectedDocumentView?.props.Document);
        SelectionManager.DeselectAll();
    }

    @computed
    get sharingButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">{"Share Document"}</div></>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"}
                    onPointerDown={() => {
                        if (this.selectedDocumentView) {
                            SharingManager.Instance.open(this.selectedDocumentView);
                        }
                    }}>
                    {<FontAwesomeIcon className="propertiesButtons-icon"
                        icon="users" size="lg" />}
                </div>
                <div className="propertiesButtons-title"> share </div>
            </div>
        </Tooltip>;
    }

    @computed
    get onClickButton() {
        if (this.selectedDoc) {
            return <Tooltip title={<><div className="dash-tooltip">Choose onClick behavior</div></>} placement="top">
                <div>
                    <div className="propertiesButtons-linkFlyout">
                        <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                            content={this.onClickFlyout}>
                            <div className={"propertiesButtons-linkButton-empty"} onPointerDown={e => e.stopPropagation()} >
                                {<FontAwesomeIcon className="documentdecorations-icon" icon="mouse-pointer" size="lg" />}
                            </div>
                        </Flyout>
                    </div>
                    <div className="propertiesButtons-title"> onclick </div>
                </div>
            </Tooltip>;
        } else {
            return null;
        }
    }

    @undoBatch
    @action
    handleOptionChange = (e: any) => {
        const value = e.target.value;
        this.selectedDoc && (this.selectedDoc.onClickBehavior = e.target.value);
        if (value === "nothing") {
            this.selectedDocumentView?.noOnClick();
        } else if (value === "enterPortal") {
            this.selectedDocumentView?.noOnClick();
            this.selectedDocumentView?.makeIntoPortal();
        } else if (value === "toggleDetail") {
            this.selectedDocumentView?.noOnClick();
            this.selectedDocumentView?.toggleDetail();
        } else if (value === "linkInPlace") {
            this.selectedDocumentView?.noOnClick();
            this.selectedDocumentView?.toggleFollowLink("inPlace", true, false);
        } else if (value === "linkOnRight") {
            this.selectedDocumentView?.noOnClick();
            this.selectedDocumentView?.toggleFollowLink("onRight", false, false);
        }
    }

    @undoBatch @action
    editOnClickScript = () => {
        if (this.selectedDoc) {
            DocUtils.makeCustomViewClicked(this.selectedDoc, undefined, "onClick");
        }
    }

    @computed
    get onClickFlyout() {
        return <div><form>
            <div className="radio">
                <label>
                    <input type="radio" value="nothing"
                        checked={this.onClick === 'nothing'}
                        onChange={this.handleOptionChange} />
                    Select Document
                </label>
            </div>
            <div className="radio">
                <label>
                    <input type="radio" value="enterPortal"
                        checked={this.onClick === 'enterPortal'}
                        onChange={this.handleOptionChange} />
                    Enter Portal
                </label>
            </div>
            <div className="radio">
                <label>
                    <input type="radio" value="toggleDetail"
                        checked={this.onClick === 'toggleDetail'}
                        onChange={this.handleOptionChange} />
                    Toggle Detail
                </label>
            </div>
            <div className="radio">
                <label>
                    <input type="radio" value="linkInPlace"
                        checked={this.onClick === 'linkInPlace'}
                        onChange={this.handleOptionChange} />
                    Follow Link
                </label>
            </div>
            <div className="radio">
                <label>
                    <input type="radio" value="linkOnRight"
                        checked={this.onClick === 'linkOnRight'}
                        onChange={this.handleOptionChange} />
                    Open Link on Right
                </label>
            </div>
        </form>
            <div onPointerDown={this.editOnClickScript} className="onClickFlyout-editScript"> Edit onClick Script</div>
        </div>;
    }

    @computed
    get googlePhotosButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">{"Export to Google Photos"}</div></>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"}
                    onPointerDown={() => {
                        if (this.selectedDocumentView) {
                            GooglePhotos.Export.CollectionToAlbum({ collection: this.selectedDocumentView.Document }).then(console.log);
                        }
                    }}>
                    {<FontAwesomeIcon className="documentdecorations-icon"
                        icon="cloud-upload-alt" size="lg" />}
                </div>
                <div className="propertiesButtons-title"> google </div>
            </div>
        </Tooltip>;
    }

    @computed
    get clustersButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">{this.selectedDoc?.useClusters ? "Stop Showing Clusters" : "Show Clusters"}</div></>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"}
                    style={{ backgroundColor: this.selectedDoc?.useClusters ? "white" : "" }}
                    onPointerDown={this.changeClusters}>
                    {<FontAwesomeIcon className="documentdecorations-icon"
                        color={this.selectedDoc?.useClusters ? "black" : "white"}
                        icon="braille" size="lg" />}
                </div>
                <div className="propertiesButtons-title"
                // style={{
                //     backgroundColor: this.selectedDoc?.useClusters ? "white" : "black",
                //     color: this.selectedDoc?.useClusters ? "black" : "white"
                // }}
                > clusters </div>
            </div>
        </Tooltip>;
    }

    @action @undoBatch
    changeFitToBox = () => {
        this.selectedDoc && (this.selectedDoc._fitToBox = !this.selectedDoc._fitToBox);
    }

    @action @undoBatch
    changeClusters = () => {
        this.selectedDoc && (this.selectedDoc.useClusters = !this.selectedDoc.useClusters);
    }

    @computed
    get fitContentButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">{this.selectedDoc?._fitToBox ? "Stop Fitting Content" : "Fit Content"}</div></>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"}
                    style={{ backgroundColor: this.selectedDoc?._fitToBox ? "white" : "" }}
                    onPointerDown={this.changeFitToBox}>
                    {<FontAwesomeIcon className="documentdecorations-icon"
                        color={this.selectedDoc?._fitToBox ? "black" : "white"}
                        icon="expand" size="lg" />}
                </div>
                <div className="propertiesButtons-title"
                // style={{
                //     backgroundColor: this.selectedDoc?._fitToBox ? "white" : "black",
                //     color: this.selectedDoc?._fitToBox ? "black" : "white"
                // }}
                > {this.selectedDoc?._fitToBox ? "unfit" : "fit"} </div>
            </div>
        </Tooltip>;
    }

    @undoBatch
    @action
    private makeMask = () => {
        if (this.selectedDoc) {
            this.selectedDoc._backgroundColor = "rgba(0,0,0,0.7)";
            this.selectedDoc.mixBlendMode = "hard-light";
            this.selectedDoc.color = "#9b9b9bff";
            this.selectedDoc._stayInCollection = true;
            this.selectedDoc.isInkMask = true;
        }
    }

    @computed
    get maskButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">Make Mask</div></>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"}
                    onPointerDown={this.makeMask}>
                    {<FontAwesomeIcon className="documentdecorations-icon"
                        color="white" icon="paint-brush" size="lg" />}
                </div>
                <div className="propertiesButtons-title"> mask </div>
            </div>
        </Tooltip>;
    }

    @computed
    get contextButton() {
        if (this.selectedDoc) {
            return <Tooltip title={<><div className="dash-tooltip">Show Context</div></>} placement="top">
                <div>
                    <div className={"propertiesButtons-linkButton-empty"}>
                        <ParentDocSelector Document={this.selectedDoc} addDocTab={(doc, where) => {
                            where === "onRight" ? CollectionDockingView.AddRightSplit(doc) :
                                this.selectedDocumentView?.props.addDocTab(doc, "onRight");
                            return true;
                        }} />
                    </div>
                    <div className="propertiesButtons-title"> context </div>
                </div>
            </Tooltip>;
        } else {
            return false;
        }

    }

    // @computed
    // get importButton() {
    //     const targetDoc = this.selectedDoc;
    //     return !targetDoc ? (null) : <Tooltip
    //         title={<><div className="dash-tooltip">{"Import a Document"}</div></>}>
    //         <div className={"propertiesButtons-linkButton-empty"}
    //             onPointerDown={() => {
    //                 if (this.selectedDocumentView) {
    //                     CollectionFreeFormView.importDocument(100, 100);
    //                 }
    //             }}>
    //             {<FontAwesomeIcon className="documentdecorations-icon"
    //                 icon="upload" size="sm" />}
    //         </div>
    //     </Tooltip>;
    // }


    render() {
        if (!this.selectedDoc) return (null);

        const isText = this.selectedDoc[Doc.LayoutFieldKey(this.selectedDoc)] instanceof RichTextField;
        const considerPull = isText && this.considerGoogleDocsPull;
        const considerPush = isText && this.considerGoogleDocsPush;
        const isImage = this.selectedDoc[Doc.LayoutFieldKey(this.selectedDoc)] instanceof ImageField;
        const isInk = this.selectedDoc[Doc.LayoutFieldKey(this.selectedDoc)] instanceof InkField;
        const isCollection = this.selectedDoc.type === DocumentType.COL ? true : false;
        const isFreeForm = this.selectedDoc._viewType === "freeform" ? true : false;
        const hasContext = this.selectedDoc.context ? true : false;

        return <div><div className="propertiesButtons" style={{ paddingBottom: "5.5px" }}>
            <div className="propertiesButtons-button">
                {this.templateButton}
            </div>
            {/* <div className="propertiesButtons-button">
                {this.metadataButton}
            </div> */}
            <div className="propertiesButtons-button">
                {this.pinButton}
            </div>
            <div className="propertiesButtons-button">
                {this.pinWithViewButton}
            </div>
            <div className="propertiesButtons-button" style={{ display: hasContext ? "" : "none" }}>
                {this.copyButton}
            </div>
            <div className="propertiesButtons-button">
                {this.lockButton}
            </div>
            <div className="propertiesButtons-button">
                {this.downloadButton}
            </div>
            <div className="propertiesButtons-button">
                {this.deleteButton}
            </div>
            <div className="propertiesButtons-button">
                {this.onClickButton}
            </div>
            <div className="propertiesButtons-button">
                {this.sharingButton}
            </div>
            <div className="propertiesButtons-button">
                {this.contextButton}
            </div>
            <div className="propertiesButtons-button" style={{ display: !considerPush ? "none" : "" }}>
                {this.considerGoogleDocsPush}
            </div>
            <div className="propertiesButtons-button" style={{ display: !considerPull ? "none" : "" }}>
                {this.considerGoogleDocsPull}
            </div>
            <div className="propertiesButtons-button" style={{ display: !isImage ? "none" : "" }}>
                {this.googlePhotosButton}
            </div>
            {/* <div className="propertiesButtons-button" style={{ display: !isCollection ? "none" : "" }}>
                    {this.importButton}
                </div> */}

            <div className="propertiesButtons-button" style={{ display: !isFreeForm ? "none" : "" }}>
                {this.clustersButton}
            </div>

            <div className="propertiesButtons-button" style={{ display: !isFreeForm ? "none" : "" }}>
                {this.fitContentButton}
            </div>

            <div className="propertiesButtons-button" style={{ display: !isInk ? "none" : "" }}>
                {this.maskButton}
            </div>
        </div>
        </div>;
    }
}
