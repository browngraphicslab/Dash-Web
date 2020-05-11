import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faArrowAltCircleDown, faPhotoVideo, faArrowAltCircleUp, faArrowAltCircleRight, faCheckCircle, faCloudUploadAlt, faLink, faShare, faStopCircle, faSyncAlt, faTag, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../new_fields/Doc";
import { RichTextField } from '../../new_fields/RichTextField';
import { NumCast, StrCast, Cast } from "../../new_fields/Types";
import { emptyFunction, setupMoveUpEvents } from "../../Utils";
import { Pulls, Pushes } from '../apis/google_docs/GoogleApiClientUtils';
import { UndoManager } from "../util/UndoManager";
import { CollectionDockingView, DockedFrameRenderer } from './collections/CollectionDockingView';
import { ParentDocSelector } from './collections/ParentDocumentSelector';
import './collections/ParentDocumentSelector.scss';
import './DocumentButtonBar.scss';
import { LinkMenu } from "./linking/LinkMenu";
import { DocumentView } from './nodes/DocumentView';
import { GoogleRef } from "./nodes/formattedText/FormattedTextBox";
import { TemplateMenu } from "./TemplateMenu";
import { Template, Templates } from "./Templates";
import React = require("react");
import { DragManager } from '../util/DragManager';
import { MetadataEntryMenu } from './MetadataEntryMenu';
import GoogleAuthenticationManager from '../apis/GoogleAuthenticationManager';
import { Docs } from '../documents/Documents';
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
export class DocumentButtonBar extends React.Component<{ views: () => (DocumentView | undefined)[], stack?: any }, {}> {
    private _linkButton = React.createRef<HTMLDivElement>();
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

    @action
    onLinkButtonMoved = (e: PointerEvent) => {
        if (this._linkButton.current !== null) {
            const linkDrag = UndoManager.StartBatch("Drag Link");
            this.view0 && DragManager.StartLinkDrag(this._linkButton.current, this.view0.props.Document, e.pageX, e.pageY, {
                dragComplete: dropEv => {
                    const linkDoc = dropEv.linkDragData?.linkDocument as Doc; // equivalent to !dropEve.aborted since linkDocument is only assigned on a completed drop
                    if (this.view0 && linkDoc) {
                        Doc.GetProto(linkDoc).linkRelationship = "hyperlink";

                        // we want to allow specific views to handle the link creation in their own way (e.g., rich text makes text hyperlinks)
                        // the dragged view can regiser a linkDropCallback to be notified that the link was made and to update their data structures
                        // however, the dropped document isn't so accessible.  What we do is set the newly created link document on the documentView
                        // The documentView passes a function prop returning this link doc to its descendants who can react to changes to it.
                        dropEv.linkDragData?.linkDropCallback?.(dropEv.linkDragData);
                        runInAction(() => this.view0!._link = linkDoc);
                        setTimeout(action(() => this.view0!._link = undefined), 0);
                    }
                    linkDrag?.end();
                },
                hideSource: false
            });
            return true;
        }
        return false;
    }


    onLinkButtonDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onLinkButtonMoved, emptyFunction, emptyFunction);
    }


    @computed
    get considerGoogleDocsPush() {
        const targetDoc = this.view0?.props.Document;
        const published = targetDoc && Doc.GetProto(targetDoc)[GoogleRef] !== undefined;
        const animation = this.isAnimatingPulse ? "shadow-pulse 1s linear infinite" : "none";
        return !targetDoc ? (null) : <div
            title={`${published ? "Push" : "Publish"} to Google Docs`}
            className="documentButtonBar-linker"
            style={{ animation }}
            onClick={async () => {
                await GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken();
                !published && runInAction(() => this.isAnimatingPulse = true);
                DocumentButtonBar.hasPushedHack = false;
                targetDoc[Pushes] = NumCast(targetDoc[Pushes]) + 1;
            }}>
            <FontAwesomeIcon className="documentdecorations-icon" icon={published ? (this.pushIcon as any) : cloud} size={published ? "sm" : "xs"} />
        </div>;
    }

    @computed
    get considerGoogleDocsPull() {
        const targetDoc = this.view0?.props.Document;
        const dataDoc = targetDoc && Doc.GetProto(targetDoc);
        const animation = this.isAnimatingFetch ? "spin 0.5s linear infinite" : "none";
        return !targetDoc || !dataDoc || !dataDoc[GoogleRef] ? (null) : <div className="documentButtonBar-linker"
            title={(() => {
                switch (this.openHover) {
                    default:
                    case UtilityButtonState.Default: return `${!dataDoc.unchanged ? "Pull from" : "Fetch"} Google Docs`;
                    case UtilityButtonState.OpenRight: return "Open in Right Split";
                    case UtilityButtonState.OpenExternally: return "Open in new Browser Tab";
                }
            })()}
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
        </div>;
    }
    @computed
    get pinButton() {
        const targetDoc = this.view0?.props.Document;
        const isPinned = targetDoc && Doc.isDocPinned(targetDoc);
        return !targetDoc ? (null) : <div className="documentButtonBar-linker"
            title={Doc.isDocPinned(targetDoc) ? "Unpin from presentation" : "Pin to presentation"}
            style={{ backgroundColor: isPinned ? "black" : "white", color: isPinned ? "white" : "black" }}
            onClick={e => DockedFrameRenderer.PinDoc(targetDoc, isPinned)}>
            <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="map-pin"
            />
        </div>;
    }

    @computed
    get linkButton() {
        const view0 = this.view0;
        const linkCount = view0 && DocListCast(view0.props.Document.links).length;
        return !view0 ? (null) : <div title="Drag(create link) Tap(view links)" className="documentButtonBar-linkFlyout" ref={this._linkButton}>
            <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                content={<LinkMenu docView={view0} addDocTab={view0.props.addDocTab} changeFlyout={emptyFunction} />}>
                <div className={"documentButtonBar-linkButton-" + (linkCount ? "nonempty" : "empty")} onPointerDown={this.onLinkButtonDown} >
                    {linkCount ? linkCount : <FontAwesomeIcon className="documentdecorations-icon" icon="link" size="sm" />}
                </div>
            </Flyout>
        </div>;
    }

    @computed
    get metadataButton() {
        const view0 = this.view0;
        return !view0 ? (null) : <div title="Show metadata panel" className="documentButtonBar-linkFlyout">
            <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                content={<MetadataEntryMenu docs={() => this.props.views().filter(dv => dv).map(dv => dv!.props.Document)} suggestWithFunction />  /* tfs: @bcz This might need to be the data document? */}>
                <div className={"documentButtonBar-linkButton-" + "empty"} onPointerDown={e => e.stopPropagation()} >
                    {<FontAwesomeIcon className="documentdecorations-icon" icon="tag" size="sm" />}
                </div>
            </Flyout>
        </div>;
    }

    @computed
    get contextButton() {
        return !this.view0 ? (null) : <ParentDocSelector Document={this.view0.props.Document} addDocTab={(doc, where) => {
            where === "onRight" ? CollectionDockingView.AddRightSplit(doc) :
                this.props.stack ? CollectionDockingView.Instance.AddTab(this.props.stack, doc) :
                    this.view0?.props.addDocTab(doc, "onRight");
            return true;
        }} />;
    }

    @observable _aliasDown = false;
    onAliasButtonDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onAliasButtonMoved, emptyFunction, emptyFunction);
    }
    onAliasButtonMoved = () => {
        if (this._dragRef.current) {
            const dragDocView = this.view0!;
            const dragData = new DragManager.DocumentDragData([dragDocView.props.Document]);
            const [left, top] = dragDocView.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            dragData.embedDoc = true;
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
        const view0 = this.view0;
        const templates: Map<Template, boolean> = new Map();
        const views = this.props.views();
        Array.from(Object.values(Templates.TemplateList)).map(template =>
            templates.set(template, views.reduce((checked, doc) => checked || doc?.props.Document["_show" + template.Name] ? true : false, false as boolean)));
        return !view0 ? (null) :
            <div title="Tap: Customize layout.  Drag: Create alias" className="documentButtonBar-linkFlyout" ref={this._dragRef}>
                <Flyout anchorPoint={anchorPoints.LEFT_TOP} onOpen={action(() => this._aliasDown = true)} onClose={action(() => this._aliasDown = false)}
                    content={!this._aliasDown ? (null) : <TemplateMenu docViews={views.filter(v => v).map(v => v as DocumentView)} templates={templates} />}>
                    <div className={"documentButtonBar-linkButton-empty"} ref={this._dragRef} onPointerDown={this.onAliasButtonDown} >
                        {<FontAwesomeIcon className="documentdecorations-icon" icon="edit" size="sm" />}
                    </div>
                </Flyout>
            </div>;
    }

    render() {
        if (!this.view0) return (null);

        const isText = this.view0.props.Document[Doc.LayoutFieldKey(this.view0.props.Document)] instanceof RichTextField;
        const considerPull = isText && this.considerGoogleDocsPull;
        const considerPush = isText && this.considerGoogleDocsPush;
        return <div className="documentButtonBar">
            <div className="documentButtonBar-button">
                {this.linkButton}
            </div>
            <div className="documentButtonBar-button">
                {this.templateButton}
            </div>
            <div className="documentButtonBar-button">
                {this.metadataButton}
            </div>
            <div className="documentButtonBar-button">
                {this.contextButton}
            </div>
            <div className="documentButtonBar-button">
                {this.pinButton}
            </div>
            <div className="documentButtonBar-button" style={{ display: !considerPush ? "none" : "" }}>
                {this.considerGoogleDocsPush}
            </div>
            <div className="documentButtonBar-button" style={{ display: !considerPull ? "none" : "" }}>
                {this.considerGoogleDocsPull}
            </div>
        </div>;
    }
}