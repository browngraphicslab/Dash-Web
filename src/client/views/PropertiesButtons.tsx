import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from '@material-ui/core';
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../fields/Doc";
import { InkField } from '../../fields/InkField';
import { RichTextField } from '../../fields/RichTextField';
import { Cast, NumCast } from "../../fields/Types";
import { ImageField } from '../../fields/URLField';
import { GoogleAuthenticationManager } from '../apis/GoogleAuthenticationManager';
import { Pulls, Pushes } from '../apis/google_docs/GoogleApiClientUtils';
import { GooglePhotos } from '../apis/google_docs/GooglePhotosClientUtils';
import { Docs, DocUtils } from '../documents/Documents';
import { DocumentType } from '../documents/DocumentTypes';
import { SelectionManager } from '../util/SelectionManager';
import { undoBatch } from '../util/UndoManager';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { GoogleRef } from "./nodes/formattedText/FormattedTextBox";
import './PropertiesButtons.scss';
import React = require("react");
import { CollectionViewType } from './collections/CollectionView';
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;


const cloud: IconProp = "cloud-upload-alt";
const fetch: IconProp = "sync-alt";

enum UtilityButtonState {
    Default,
    OpenRight,
    OpenExternally
}

@observer
export class PropertiesButtons extends React.Component<{}, {}> {
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


    @computed get selectedDoc() { return SelectionManager.SelectedSchemaDoc() || this.selectedDocumentView?.rootDoc; }
    @computed get selectedDocumentView() {
        if (SelectionManager.SelectedDocuments().length) {
            return SelectionManager.SelectedDocuments()[0];
        } else return undefined;
    }

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
                        e.altKey && (this.openHover = UtilityButtonState.OpenExternally);
                        e.shiftKey && (this.openHover = UtilityButtonState.OpenRight);
                    })}
                    onPointerLeave={action(() => this.openHover = UtilityButtonState.Default)}
                    onClick={async e => {
                        const googleDocUrl = `https://docs.google.com/document/d/${dataDoc[GoogleRef]}/edit`;
                        if (e.shiftKey) {
                            e.preventDefault();
                            let googleDoc = await Cast(dataDoc.googleDoc, Doc);
                            if (!googleDoc) {
                                const options = { _width: 600, _fitWidth: true, _nativeWidth: 960, _nativeHeight: 800, isAnnotating: false, useCors: false };
                                googleDoc = Docs.Create.WebDocument(googleDocUrl, options);
                                dataDoc.googleDoc = googleDoc;
                            }
                            CollectionDockingView.AddSplit(googleDoc, "right");
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
                    <FontAwesomeIcon className="documentdecorations-icon" size="lg" color="black"
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

    @action @undoBatch
    onLock = () => {
        SelectionManager.SelectedDocuments().forEach(dv => dv.toggleLockPosition());
    }

    @computed
    get lockButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<div className="dash-tooltip">{`${this.selectedDoc?.lockedPosition ? "Unlock" : "Lock"} Position`}</div>} placement="top">
            <div>
                <div className={`propertiesButtons-linkButton-empty toggle-${targetDoc.lockedPosition ? "on" : "off"}`} onPointerDown={this.onLock} >
                    <FontAwesomeIcon className="documentdecorations-icon" size="lg"
                        color={this.selectedDoc?.lockedPosition ? "black" : "white"}
                        icon={this.selectedDoc?.lockedPosition ? "unlock" : "lock"} />
                </div>
                <div className="propertiesButtons-title"
                >Position </div>
            </div>
        </Tooltip>;
    }

    @computed
    get downloadButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<div className="dash-tooltip">{"Download Document"}</div>} placement="top">
            <div>
                <div className={"propertiesButtons-linkButton-empty"} onPointerDown={() => this.selectedDoc && Doc.Zip(this.selectedDoc)}>
                    <FontAwesomeIcon className="propertiesButtons-icon" icon="download" size="lg" />
                </div>
                <div className="propertiesButtons-title"> downld </div>
            </div>
        </Tooltip>;
    }

    @undoBatch
    @action
    setDictation = () => {
        SelectionManager.SelectedDocuments().forEach(dv => dv.rootDoc._showAudio = dv.rootDoc._showAudio === !dv.rootDoc._showAudio);
    }

    @computed
    get dictationButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip title={<div className="dash-tooltip">{"Show Dictation Controls"}</div>} placement="top">
            <div>
                <div className={`propertiesButtons-linkButton-empty toggle-${targetDoc._showAudio ? "on" : "off"}`} onPointerDown={this.setDictation}>
                    <FontAwesomeIcon className="propertiesButtons-icon" icon="microphone" size="lg" />
                </div>
                <div className="propertiesButtons-title"> Dictate </div>
            </div>
        </Tooltip>;
    }


    @undoBatch
    @action
    setTitle = () => {
        SelectionManager.SelectedDocuments().forEach(dv => dv.rootDoc._showTitle = dv.rootDoc._showTitle === undefined ? "title" : undefined);
    }

    @computed
    get titleButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip title={<div className="dash-tooltip">{"Show Title Header"}</div>} placement="top">
            <div>
                <div className={`propertiesButtons-linkButton-empty toggle-${targetDoc._showTitle ? "on" : "off"}`} onPointerDown={this.setTitle}>
                    <FontAwesomeIcon className="propertiesButtons-icon" icon="text-width" size="lg" />
                </div>
                <div className="propertiesButtons-title"> Title </div>
            </div>
        </Tooltip>;
    }

    @undoBatch
    @action
    setCaption = () => {
        SelectionManager.SelectedDocuments().forEach(dv => dv.rootDoc._showCaption = dv.rootDoc._showCaption === undefined ? "caption" : undefined);
    }

    @computed
    get captionButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip title={<div className="dash-tooltip">{"Show Caption Footer"}</div>} placement="top">
            <div>
                <div className={`propertiesButtons-linkButton-empty toggle-${targetDoc._showCaption ? "on" : "off"}`} onPointerDown={this.setCaption}>
                    <FontAwesomeIcon className="propertiesButtons-icon" icon="closed-captioning" size="lg" />
                </div>
                <div className="propertiesButtons-title"> Caption </div>
            </div>
        </Tooltip>;
    }

    @undoBatch
    @action
    setChrome = () => {
        SelectionManager.SelectedDocuments().forEach(dv => dv.rootDoc._chromeStatus = dv.rootDoc._chromeStatus === "disabled" ? "enabled" : "disabled");
    }

    @computed
    get chromeButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip title={<div className="dash-tooltip">{"Show Editing UI"}</div>} placement="top">
            <div>
                <div className={`propertiesButtons-linkButton-empty toggle-${targetDoc._chromeStatus === "enabled" ? "on" : "off"}`} onPointerDown={this.setChrome}>
                    <FontAwesomeIcon className="propertiesButtons-icon" icon="edit" size="lg" />
                </div>
                <div className="propertiesButtons-title"> Controls </div>
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

        SelectionManager.SelectedDocuments().forEach(dv => {
            if (value === "nothing") {
                dv.noOnClick();
            } else if (value === "enterPortal") {
                dv.noOnClick();
                dv.makeIntoPortal();
            } else if (value === "toggleDetail") {
                dv.noOnClick();
                dv.toggleDetail();
            } else if (value === "linkInPlace") {
                dv.noOnClick();
                dv.toggleFollowLink("inPlace", true, false);
            } else if (value === "linkOnRight") {
                dv.noOnClick();
                dv.toggleFollowLink("add:right", false, false);
            }
        });
    }

    @undoBatch @action
    editOnClickScript = () => {
        if (this.selectedDoc) {
            if (SelectionManager.SelectedDocuments().length) SelectionManager.SelectedDocuments().forEach(dv => DocUtils.makeCustomViewClicked(dv.rootDoc, undefined, "onClick"));
            else DocUtils.makeCustomViewClicked(this.selectedDoc, undefined, "onClick");
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
                    onPointerDown={() => this.selectedDoc && GooglePhotos.Export.CollectionToAlbum({ collection: this.selectedDoc }).then(console.log)}>
                    {<FontAwesomeIcon className="documentdecorations-icon" icon="cloud-upload-alt" size="lg" />}
                </div>
                <div className="propertiesButtons-title"> google </div>
            </div>
        </Tooltip>;
    }

    @computed
    get clustersButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">{this.selectedDoc?._useClusters ? "Stop Showing Clusters" : "Show Clusters"}</div></>} placement="top">
            <div>
                <div className={`propertiesButtons-linkButton-empty toggle-${targetDoc._useClusters ? "on" : "off"}`} onPointerDown={this.changeClusters}>
                    <FontAwesomeIcon className="documentdecorations-icon" icon="braille" size="lg" />
                </div>
                <div className="propertiesButtons-title" > clusters </div>
            </div>
        </Tooltip>;
    }

    @action @undoBatch
    changeFitToBox = () => {
        if (this.selectedDoc) {
            if (SelectionManager.SelectedDocuments().length) SelectionManager.SelectedDocuments().forEach(dv => dv.rootDoc._fitToBox = !dv.rootDoc._fitToBox);
            else this.selectedDoc._fitToBox = !this.selectedDoc._fitToBox;
        }
    }

    @action @undoBatch
    changeClusters = () => {
        if (this.selectedDoc) {
            if (SelectionManager.SelectedDocuments().length) SelectionManager.SelectedDocuments().forEach(dv => dv.rootDoc._useClusters = !dv.rootDoc._useClusters);
            else this.selectedDoc._useClusters = !this.selectedDoc._useClusters;
        }
    }

    @computed
    get fitContentButton() {
        const targetDoc = this.selectedDoc;
        return !targetDoc ? (null) : <Tooltip
            title={<><div className="dash-tooltip">{this.selectedDoc?._fitToBox ? "Stop Fitting Content" : "Fit Content"}</div></>} placement="top">
            <div>
                <div className={`propertiesButtons-linkButton-empty toggle-${targetDoc._fitToBox ? "on" : "off"}`} onPointerDown={this.changeFitToBox}>
                    <FontAwesomeIcon className="documentdecorations-icon" icon="expand" size="lg" />
                </div>
                <div className="propertiesButtons-title"> {this.selectedDoc?._fitToBox ? "unfit" : "fit"} </div>
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
                <div className={"propertiesButtons-linkButton-empty"} onPointerDown={this.makeMask}>
                    <FontAwesomeIcon className="documentdecorations-icon" color="white" icon="paint-brush" size="lg" />
                </div>
                <div className="propertiesButtons-title"> mask </div>
            </div>
        </Tooltip>;
    }

    render() {
        if (!this.selectedDoc) return (null);

        const layoutField = this.selectedDoc[Doc.LayoutFieldKey(this.selectedDoc)];
        const isText = layoutField instanceof RichTextField;
        const isImage = layoutField instanceof ImageField;
        const isInk = layoutField instanceof InkField;
        const isCollection = this.selectedDoc.type === DocumentType.COL;
        const isFreeForm = this.selectedDoc._viewType === CollectionViewType.Freeform;
        const considerPull = isText && this.considerGoogleDocsPull;
        const considerPush = isText && this.considerGoogleDocsPush;

        return <div className="propertiesButtons" style={{ paddingBottom: "5.5px" }}>
            <div className="propertiesButtons-button">
                {this.titleButton}
            </div>
            <div className="propertiesButtons-button">
                {this.captionButton}
            </div>
            <div className="propertiesButtons-button" style={{ display: isCollection ? "" : "none" }}>
                {this.chromeButton}
            </div>
            <div className="propertiesButtons-button">
                {this.lockButton}
            </div>
            <div className="propertiesButtons-button" style={{ display: isText || isImage ? "" : "none" }}>
                {this.dictationButton}
            </div>
            <div className="propertiesButtons-button">
                {this.onClickButton}
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

            <div className="propertiesButtons-button" style={{ display: !isFreeForm ? "none" : "" }}>
                {this.clustersButton}
            </div>
            <div className="propertiesButtons-button" style={{ display: !isFreeForm ? "none" : "" }}>
                {this.fitContentButton}
            </div>
            <div className="propertiesButtons-button" style={{ display: !isInk ? "none" : "" }}>
                {this.maskButton}
            </div>
        </div>;
    }
}
