import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from '@material-ui/core';
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, Opt } from "../../fields/Doc";
import { InkField } from '../../fields/InkField';
import { RichTextField } from '../../fields/RichTextField';
import { BoolCast, Cast, NumCast, StrCast } from "../../fields/Types";
import { ImageField } from '../../fields/URLField';
import { GoogleAuthenticationManager } from '../apis/GoogleAuthenticationManager';
import { Pulls, Pushes } from '../apis/google_docs/GoogleApiClientUtils';
import { GooglePhotos } from '../apis/google_docs/GooglePhotosClientUtils';
import { Docs, DocUtils } from '../documents/Documents';
import { DocumentType } from '../documents/DocumentTypes';
import { SelectionManager } from '../util/SelectionManager';
import { undoBatch } from '../util/UndoManager';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { CollectionViewType } from './collections/CollectionView';
import { DocumentView } from './nodes/DocumentView';
import { GoogleRef } from "./nodes/formattedText/FormattedTextBox";
import './PropertiesButtons.scss';
import React = require("react");
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

    public static hasPushedHack = false;
    public static hasPulledHack = false;

    @observable public static Instance: PropertiesButtons;
    @observable private openHover = UtilityButtonState.Default;
    @observable private pushIcon: IconProp = "arrow-alt-circle-up";
    @observable private pullIcon: IconProp = "arrow-alt-circle-down";
    @observable private pullColor: string = "white";
    @observable public isAnimatingFetch = false;
    @observable public isAnimatingPulse = false;

    @computed get selectedDoc() { return SelectionManager.SelectedSchemaDoc() || this.selectedDocumentView?.rootDoc; }
    @computed get selectedDocumentView() { return SelectionManager.Views().length ? SelectionManager.Views()[0] : undefined; }
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
                case UtilityButtonState.Default: return `${!dataDoc?.googleDocUnchanged ? "Pull from" : "Fetch"} Google Docs`;
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
                                const options = { _width: 600, _nativeWidth: 960, _nativeHeight: 800, useCors: false };
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
                            dataDoc.googleDocUnchanged && runInAction(() => this.isAnimatingFetch = true);
                        }
                    }}>
                    <FontAwesomeIcon className="documentdecorations-icon" size="lg" color="black"
                        style={{ WebkitAnimation: animation, MozAnimation: animation }}
                        icon={(() => {
                            switch (this.openHover) {
                                default:
                                case UtilityButtonState.Default: return dataDoc.googleDocUnchanged === false ? (this.pullIcon as any) : fetch;
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

    @action
    makeMask = (inkDoc: Doc) => {
        inkDoc.isInkMask = !inkDoc.isInkMask;
        inkDoc._backgroundColor = inkDoc.isInkMask ? "rgba(0,0,0,0.7)" : undefined;
        inkDoc.mixBlendMode = inkDoc.isInkMask ? "hard-light" : undefined;
        inkDoc.color = "#9b9b9bff";
        inkDoc._stayInCollection = inkDoc.isInkMask ? true : undefined;
    }
    propToggleBtn = (label: string, property: string, tooltip: (on?: any) => string, icon: (on: boolean) => string, onClick?: (dv: Opt<DocumentView>, doc: Doc, property: string) => void) => {
        const targetDoc = this.selectedDoc;
        const onPropToggle = (dv: Opt<DocumentView>, doc: Doc, prop: string) => (dv?.layoutDoc || doc)[prop] = (dv?.layoutDoc || doc)[prop] ? undefined : true;
        return !targetDoc ? (null) : <Tooltip
            title={<div className={`dash-tooltip`}>{tooltip(targetDoc?.[property])} </div>} placement="top">
            <div>
                <div className={`propertiesButtons-linkButton-empty toggle-${StrCast(targetDoc[property]).includes(":hover") ? "hover" : targetDoc[property] ? "on" : "off"}`}
                    onPointerDown={undoBatch(() => {
                        if (SelectionManager.Views().length) {
                            SelectionManager.Views().forEach(dv => (onClick ?? onPropToggle)(dv, dv.rootDoc, property));
                        } else if (targetDoc) (onClick ?? onPropToggle)(undefined, targetDoc, property);
                    })} >
                    <FontAwesomeIcon className="documentdecorations-icon" size="lg" icon={icon(BoolCast(targetDoc?.[property])) as any} />
                </div>
                <div className="propertiesButtons-title">{label}</div>
            </div>
        </Tooltip>;
    }
    @computed get lockButton() {
        return this.propToggleBtn("Position", "_lockedPosition", on => `${on ? "Unlock" : "Lock"} XY location on freeform view`, on => on ? "unlock" : "lock");
    }
    @computed get panButton() {
        return this.propToggleBtn("Pan", "_lockedTransform", on => `${on ? "Unlock" : "Lock"} panning of view`, on => on ? "unlock" : "lock");
    }
    @computed get dictationButton() {
        return this.propToggleBtn("Dictate", "_showAudio", on => `${on ? "Hide" : "Show"} dictation/recording controls`, () => "microphone");
    }
    @computed get maskButton() {
        return this.propToggleBtn("Mask", "isInkMask", on => on ? "Make plain ink" : "Make highlight mask", () => "paint-brush", (dv, doc) => this.makeMask(dv?.layoutDoc || doc));
    }
    @computed get clustersButton() {
        return this.propToggleBtn("Clusters", "_useClusters", on => `${on ? "Hide" : "Show"} clusters`, () => "braille");
    }
    @computed get fitContentButton() {
        return this.propToggleBtn("Fit All", "_fitToBox", on => `${on ? "Don't" : ""} fit content to container visible area`, on => on ? "expand-arrows-alt" : "compress-arrows-alt");
    }
    @computed get fitWidthButton() {
        return this.propToggleBtn("Fit Wid", "_fitWidth", on => `${on ? "Don't" : ""} fit content to width of container`, on => on ? "arrows-alt-h" : "arrows-alt-h");
    }
    @computed get captionButton() {
        return this.propToggleBtn("Caption", "_showCaption", on => `${on ? "Hide" : "Show"} caption footer`, on => "closed-captioning", (dv, doc) => (dv?.rootDoc || doc)._showCaption = (dv?.rootDoc || doc)._showCaption === undefined ? "caption" : undefined);
    }
    @computed get chromeButton() {
        return this.propToggleBtn("Controls", "_chromeStatus", on => `${on === "enabled" ? "Hide" : "Show"} editing UI`, on => "edit", (dv, doc) => (dv?.rootDoc || doc)._chromeStatus = (dv?.rootDoc || doc)._chromeStatus === undefined ? "enabled" : undefined);
    }
    @computed get titleButton() {
        return this.propToggleBtn("Title", "_showTitle", on => "Switch between title styles", on => "text-width", (dv, doc) => (dv?.rootDoc || doc)._showTitle = !(dv?.rootDoc || doc)._showTitle ? "title" : (dv?.rootDoc || doc)._showTitle === "title" ? "title:hover" : undefined);
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

    @computed
    get onClickButton() {
        return !this.selectedDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">Choose onClick behavior</div></>} placement="top">
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
    }

    @undoBatch
    @action
    handleOptionChange = (e: any) => {
        this.selectedDoc && (this.selectedDoc.onClickBehavior = e.target.value);

        SelectionManager.Views().filter(dv => dv.docView).map(dv => dv.docView!).forEach(docView => {
            docView.noOnClick();
            switch (e.target.value) {
                case "enterPortal": docView.makeIntoPortal(); break;
                case "toggleDetail": docView.toggleDetail(); break;
                case "linkInPlace": docView.toggleFollowLink("inPlace", true, false); break;
                case "linkOnRight": docView.toggleFollowLink("add:right", false, false); break;
            }
        });
    }

    @undoBatch @action
    editOnClickScript = () => {
        if (this.selectedDoc) {
            if (SelectionManager.Views().length) SelectionManager.Views().forEach(dv => DocUtils.makeCustomViewClicked(dv.rootDoc, undefined, "onClick"));
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
            {Doc.UserDoc().noviceMode ? (null) : <div onPointerDown={this.editOnClickScript} className="onClickFlyout-editScript"> Edit onClick Script</div>}
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
            <div className="propertiesButtons-button" style={{ display: isFreeForm ? "" : "none" }}>
                {this.panButton}
            </div>
            <div className="propertiesButtons-button">
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
            <div className="propertiesButtons-button" style={{ display: !isFreeForm && !isText ? "none" : "" }}>
                {this.fitContentButton}
            </div>
            <div className="propertiesButtons-button">
                {this.fitWidthButton}
            </div>
            <div className="propertiesButtons-button" style={{ display: !isInk ? "none" : "" }}>
                {this.maskButton}
            </div>
        </div>;
    }
}