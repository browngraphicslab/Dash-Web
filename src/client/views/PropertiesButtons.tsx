import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faArrowAltCircleDown, faArrowAltCircleRight, faArrowAltCircleUp, faCheckCircle, faCloudUploadAlt, faLink, faPhotoVideo, faShare, faStopCircle, faSyncAlt, faTag, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../fields/Doc";
import { RichTextField } from '../../fields/RichTextField';
import { Cast, NumCast } from "../../fields/Types";
import { emptyFunction, setupMoveUpEvents } from "../../Utils";
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

    @observable selectedDocumentView: DocumentView | undefined = SelectionManager.LastSelection();
    @observable selectedDoc: Doc | undefined = this.selectedDocumentView?.props.Document;

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

    //get view0() { return this.props.views()?.[0]; }

    @computed
    get considerGoogleDocsPush() {
        const targetDoc = this.selectedDoc;
        const published = targetDoc && Doc.GetProto(targetDoc)[GoogleRef] !== undefined;
        const animation = this.isAnimatingPulse ? "shadow-pulse 1s linear infinite" : "none";
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{`${published ? "Push" : "Publish"} to Google Docs`}</div></>}>
            <div
                className="propertiesButtons-linker"
                style={{ animation }}
                onClick={async () => {
                    await GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken();
                    !published && runInAction(() => this.isAnimatingPulse = true);
                    PropertiesButtons.hasPushedHack = false;
                    targetDoc[Pushes] = NumCast(targetDoc[Pushes]) + 1;
                }}>
                <FontAwesomeIcon className="documentdecorations-icon" icon={published ? (this.pushIcon as any) : cloud} size={published ? "sm" : "xs"} />
            </div></Tooltip>;
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
            title={<><div className="dash-tooltip">{title}</div></>}>
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
        const targetDoc = this.selectedDoc;
        const isPinned = targetDoc && Doc.isDocPinned(targetDoc);
        return !targetDoc ? (null) : <Tooltip title={<><div className="dash-tooltip">{Doc.isDocPinned(targetDoc) ? "Unpin from presentation" : "Pin to presentation"}</div></>}>
            <div className="propertiesButtons-linker"
                style={{ backgroundColor: isPinned ? "black" : "white", color: isPinned ? "white" : "black" }}
                onClick={e => DockedFrameRenderer.PinDoc(targetDoc, isPinned)}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="map-pin"
                />
            </div></Tooltip>;
    }

    @computed
    get metadataButton() {
        //const view0 = this.view0;
        if (this.selectedDoc) {
            return <Tooltip title={<><div className="dash-tooltip">Show metadata panel</div></>}>
                <div className="propertiesButtons-linkFlyout">
                    <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                        content={<MetadataEntryMenu docs={[this.selectedDoc]} suggestWithFunction />  /* tfs: @bcz This might need to be the data document? */}>
                        <div className={"propertiesButtons-linkButton-" + "empty"} onPointerDown={e => e.stopPropagation()} >
                            {<FontAwesomeIcon className="documentdecorations-icon" icon="tag" size="sm" />}
                        </div>
                    </Flyout>
                </div></Tooltip>;
        } else {
            return null;
        }

    }

    // @computed
    // get contextButton() {
    //     return <ParentDocSelector Document={this.Document} addDocTab={(doc, where) => {
    //         where === "onRight" ? CollectionDockingView.AddRightSplit(doc) :
    //                 this.props.doc.props.addDocTab(doc, "onRight");
    //         return true;
    //     }} />;
    // }

    @observable _aliasDown = false;
    onAliasButtonDown = (e: React.PointerEvent): void => {
        //setupMoveUpEvents(this, e, this.onAliasButtonMoved, emptyFunction, emptyFunction);

    }

    // onAliasButtonMoved = () => {
    //     if (this._dragRef.current) {
    //         const dragDocView = this.props.doc!;
    //         if (dragDocView.props){
    //             const dragData = new DragManager.DocumentDragData([dragDocView.props.Document]);
    //             const [left, top] = dragDocView.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
    //             dragData.dropAction = "alias";
    //             DragManager.StartDocumentDrag([dragDocView.ContentDiv!], dragData, left, top, {
    //             offsetX: dragData.offset[0],
    //             offsetY: dragData.offset[1],
    //             hideSource: false
    //         });
    //         return true;
    //         }

    //     }
    //     return false;
    // }

    // @computed
    // get templateButton() {
    //     //const view0 = this.view0;
    //     const templates: Map<Template, boolean> = new Map();
    //     //const views = this.props.views();
    //     Array.from(Object.values(Templates.TemplateList)).map(template =>
    //         templates.set(template, views.reduce((checked, doc) => checked || doc?.props.Document["_show" + template.Name] ? true : false, false as boolean)));
    //     return !this.props.doc ? (null) :
    //         <Tooltip title={<><div className="dash-tooltip">Tap: Customize layout.  Drag: Create alias</div></>}>
    //             <div className="propertiesButtons-linkFlyout" ref={this._dragRef}>
    //                 <Flyout anchorPoint={anchorPoints.LEFT_TOP} onOpen={action(() => this._aliasDown = true)} onClose={action(() => this._aliasDown = false)}
    //                     content={!this._aliasDown ? (null) : <TemplateMenu docViews={views.filter(v => v).map(v => v as DocumentView)} templates={templates} />}>
    //                     <div className={"propertiesButtons-linkButton-empty"} ref={this._dragRef} onPointerDown={this.onAliasButtonDown} >
    //                         {<FontAwesomeIcon className="documentdecorations-icon" icon="edit" size="sm" />}
    //                     </div>
    //                 </Flyout>
    //             </div></Tooltip>;
    // }

    render() {
        if (!this.selectedDoc) return (null);

        const isText = this.selectedDoc[Doc.LayoutFieldKey(this.selectedDoc)] instanceof RichTextField;
        const considerPull = isText && this.considerGoogleDocsPull;
        const considerPush = isText && this.considerGoogleDocsPush;
        return <div className="propertiesButtons">
            {/* <div className="propertiesButtons-button">
                {this.templateButton}
            </div> */}
            <div className="propertiesButtons-button">
                {this.metadataButton}
            </div>
            {/* <div className="propertiesButtons-button">
                {this.contextButton}
            </div> */}
            <div className="propertiesButtons-button">
                {this.pinButton}
            </div>
            <div className="propertiesButtons-button" style={{ display: !considerPush ? "none" : "" }}>
                {this.considerGoogleDocsPush}
            </div>
            <div className="propertiesButtons-button" style={{ display: !considerPull ? "none" : "" }}>
                {this.considerGoogleDocsPull}
            </div>
        </div>;
    }
}