import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from '@material-ui/core';
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../fields/Doc";
import { RichTextField } from '../../fields/RichTextField';
import { Cast, NumCast, StrCast } from "../../fields/Types";
import { emptyFunction, setupMoveUpEvents, simulateMouseClick } from "../../Utils";
import { GoogleAuthenticationManager } from '../apis/GoogleAuthenticationManager';
import { Pulls, Pushes } from '../apis/google_docs/GoogleApiClientUtils';
import { Docs } from '../documents/Documents';
import { DocumentType } from '../documents/DocumentTypes';
import { CurrentUserUtils } from '../util/CurrentUserUtils';
import { DragManager } from '../util/DragManager';
import { SelectionManager } from '../util/SelectionManager';
import { SharingManager } from '../util/SharingManager';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { TabDocView } from './collections/TabDocView';
import './DocumentButtonBar.scss';
import { MetadataEntryMenu } from './MetadataEntryMenu';
import { DocumentLinksButton } from './nodes/DocumentLinksButton';
import { DocumentView } from './nodes/DocumentView';
import { GoogleRef } from "./nodes/formattedText/FormattedTextBox";
import { TemplateMenu } from "./TemplateMenu";
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
export class DocumentButtonBar extends React.Component<{ views: () => (DocumentView | undefined)[], stack?: any }, {}> {
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

    @observable public static Instance: DocumentButtonBar;
    public static hasPushedHack = false;
    public static hasPulledHack = false;

    constructor(props: { views: () => (DocumentView | undefined)[] }) {
        super(props);
        runInAction(() => DocumentButtonBar.Instance = this);
    }

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

    get view0() { return this.props.views()?.[0]; }

    @computed
    get considerGoogleDocsPush() {
        const targetDoc = this.view0?.props.Document;
        const published = targetDoc && Doc.GetProto(targetDoc)[GoogleRef] !== undefined;
        const animation = this.isAnimatingPulse ? "shadow-pulse 1s linear infinite" : "none";
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{`${published ? "Push" : "Publish"} to Google Docs`}</div></>}>
            <div
                className="documentButtonBar-linker"
                style={{ animation }}
                onClick={async () => {
                    await GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken();
                    !published && runInAction(() => this.isAnimatingPulse = true);
                    DocumentButtonBar.hasPushedHack = false;
                    targetDoc[Pushes] = NumCast(targetDoc[Pushes]) + 1;
                }}>
                <FontAwesomeIcon className="documentdecorations-icon" icon={published ? (this.pushIcon as any) : cloud} size={published ? "sm" : "xs"} />
            </div></Tooltip>;
    }

    @computed
    get considerGoogleDocsPull() {
        const targetDoc = this.view0?.props.Document;
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
            title={<><div className="dash-tooltip">{title}</div></>}>
            <div className="documentButtonBar-linker"
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
                        DocumentButtonBar.hasPulledHack = false;
                        targetDoc[Pulls] = NumCast(targetDoc[Pulls]) + 1;
                        dataDoc.unchanged && runInAction(() => this.isAnimatingFetch = true);
                    }
                }}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm"
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
            </div></Tooltip>;
    }
    @computed
    get pinButton() {
        const targetDoc = this.view0?.props.Document;
        let isPinned = targetDoc && Doc.isDocPinned(targetDoc);
        // More than 1 document selected then all must be in presentation for isPinned to be true (then it will unpin all)
        if (SelectionManager.SelectedDocuments().length > 1) {
            SelectionManager.SelectedDocuments().forEach((docView: DocumentView) => {
                if (Doc.isDocPinned(docView.props.Document)) isPinned = true;
                else isPinned = false;
            });
        }
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{Doc.isDocPinned(targetDoc) ? "Unpin from presentation" : "Pin to presentation"}</div></>}>
            <div className="documentButtonBar-linker"
                style={{ backgroundColor: isPinned ? "white" : "", color: isPinned ? "black" : "white", border: isPinned ? "black 1px solid " : "" }}
                onClick={e => this.props.views().map(view => view && TabDocView.PinDoc(view.props.Document, isPinned))}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="map-pin"
                />
            </div></Tooltip>;
    }

    @computed
    get shareButton() {
        const targetDoc = this.view0?.props.Document;
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{"Open Sharing Manager"}</div></>}>
            <div className="documentButtonBar-linker" style={{ color: "white" }} onClick={e => SharingManager.Instance.open(this.view0, targetDoc)}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="users"
                />
            </div></Tooltip >;
    }

    @computed
    get annotateButton() {
        const targetDoc = this.view0?.props.Document;
        const isAnnotating = targetDoc?.isAnnotating;
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{`${isAnnotating ? "Exit" : "Enter"} annotation mode`}</div></>}>
            <div className="documentButtonBar-linker" style={{ backgroundColor: isAnnotating ? "white" : "", color: isAnnotating ? "black" : "white", }}
                onClick={e => targetDoc.isAnnotating = !targetDoc.isAnnotating}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="edit" />
            </div></Tooltip >;
    }

    @computed
    get menuButton() {
        const targetDoc = this.view0?.props.Document;
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{`Open Context Menu`}</div></>}>
            <div className="documentButtonBar-linker" style={{ color: "white", cursor: "context-menu" }} onClick={e => this.openContextMenu(e)}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="bars" />
            </div></Tooltip >;
    }

    @computed
    get moreButton() {
        const targetDoc = this.view0?.props.Document;
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{`${CurrentUserUtils.propertiesWidth > 0 ? "Close" : "Open"} Properties Panel`}</div></>}>
            <div className="documentButtonBar-linker" style={{ color: "white", cursor: "e-resize" }} onClick={action(e =>
                CurrentUserUtils.propertiesWidth = CurrentUserUtils.propertiesWidth > 0 ? 0 : 250)}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="ellipsis-h" />
            </div></Tooltip >;
    }

    @computed
    get metadataButton() {
        const view0 = this.view0;
        return !view0 ? (null) : <Tooltip title={<><div className="dash-tooltip">Show metadata panel</div></>}>
            <div className="documentButtonBar-linkFlyout">
                <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                    content={<MetadataEntryMenu docs={this.props.views().filter(dv => dv).map(dv => dv!.props.Document)} suggestWithFunction />  /* tfs: @bcz This might need to be the data document? */}>
                    <div className={"documentButtonBar-linkButton-" + "empty"} onPointerDown={e => e.stopPropagation()} >
                        {<FontAwesomeIcon className="documentdecorations-icon" icon="tag" size="sm" />}
                    </div>
                </Flyout>
            </div></Tooltip>;
    }
    @observable _aliasDown = false;
    onAliasButtonDown = action((e: React.PointerEvent): void => {
        this.props.views()[0]?.select(false);
        this._tooltipOpen = false;
        setupMoveUpEvents(this, e, this.onAliasButtonMoved, emptyFunction, emptyFunction);
    })
    onAliasButtonMoved = () => {
        if (this._dragRef.current) {
            const dragDocView = this.view0!;
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

    _ref = React.createRef<HTMLDivElement>();
    @observable _tooltipOpen: boolean = false;
    @computed
    get templateButton() {
        const view0 = this.view0;
        const templates: Map<string, boolean> = new Map();
        const views = this.props.views();
        Array.from(["Caption", "Title", "TitleHover"]).map(template =>
            templates.set(template, views.reduce((checked, doc) => checked || doc?.props.Document["_show" + template] ? true : false, false as boolean)));
        return !view0 ? (null) :
            <Tooltip title={<div className="dash-tooltip">CustomizeLayout</div>} open={this._tooltipOpen} onClose={action(() => this._tooltipOpen = false)} placement="bottom">
                <div className="documentButtonBar-linkFlyout" ref={this._dragRef}
                    onPointerEnter={action(() => !this._ref.current?.getBoundingClientRect().width && (this._tooltipOpen = true))} >

                    <Flyout anchorPoint={anchorPoints.LEFT_TOP} onOpen={action(() => this._aliasDown = true)} onClose={action(() => this._aliasDown = false)}
                        content={!this._aliasDown ? (null) : <div ref={this._ref}> <TemplateMenu docViews={views.filter(v => v).map(v => v as DocumentView)} templates={templates} /></div>}>
                        <div className={"documentButtonBar-linkButton-empty"} ref={this._dragRef} onPointerDown={this.onAliasButtonDown} >
                            {<FontAwesomeIcon className="documentdecorations-icon" icon="edit" size="sm" />}
                        </div>
                    </Flyout>
                </div>
            </Tooltip>;
    }

    openContextMenu = (e: React.MouseEvent) => {
        let child = SelectionManager.SelectedDocuments()[0].ContentDiv!.children[0];
        while (child.children.length) {
            const next = Array.from(child.children).find(c => typeof (c.className) === "string");
            if (next?.className.includes("documentView-node")) break;
            if (next?.className.includes("dashFieldView")) break;
            if (next) child = next;
            else break;
        }
        simulateMouseClick(child, e.clientX, e.clientY - 30, e.screenX, e.screenY - 30);
    }

    render() {
        if (!this.view0) return (null);

        const isText = this.view0.props.Document[this.view0.LayoutFieldKey] instanceof RichTextField;
        const considerPull = isText && this.considerGoogleDocsPull;
        const considerPush = isText && this.considerGoogleDocsPush;
        return <div className="documentButtonBar">
            <div className="documentButtonBar-button">
                <DocumentLinksButton links={this.view0.allLinks} View={this.view0} AlwaysOn={true} InMenu={true} StartLink={true} />
            </div>
            {DocumentLinksButton.StartLink || !Doc.UserDoc()["documentLinksButton-fullMenu"] ? <div className="documentButtonBar-button">
                <DocumentLinksButton links={this.view0.allLinks} View={this.view0} AlwaysOn={true} InMenu={true} StartLink={false} />
            </div> : (null)}
            {!Doc.UserDoc()["documentLinksButton-fullMenu"] ? (null) : <div className="documentButtonBar-button">
                {this.templateButton}
            </div>
            /*<div className="documentButtonBar-button">
                {this.metadataButton}
            </div>
            <div className="documentButtonBar-button">
                {this.contextButton}
            </div> */}
            <div className="documentButtonBar-button">
                {this.pinButton}
            </div>
            {!Doc.UserDoc()["documentLinksButton-fullMenu"] ? (null) : <div className="documentButtonBar-button">
                {this.shareButton}
            </div>}
            {![DocumentType.VID, DocumentType.WEB].includes(StrCast(this.view0.props.Document.type) as DocumentType) ? (null) : <div className="documentButtonBar-button">
                {this.annotateButton}
            </div>}
            <div className="documentButtonBar-button" style={{ display: !considerPush ? "none" : "" }}>
                {this.considerGoogleDocsPush}
            </div>
            <div className="documentButtonBar-button" style={{ display: !considerPull ? "none" : "" }}>
                {this.considerGoogleDocsPull}
            </div>
            <div className="documentButtonBar-button">
                {this.menuButton}
            </div>
            {/* {Doc.UserDoc().noviceMode ? (null) : <div className="documentButtonBar-button">
                {this.moreButton}
            </div>} */}
        </div>;
    }
}
