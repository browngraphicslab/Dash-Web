import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faArrowAltCircleDown, faArrowAltCircleUp, faCheckCircle, faCloudUploadAlt, faLink, faShare, faStopCircle, faSyncAlt, faTag, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable, runInAction, computed } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../new_fields/Doc";
import { RichTextField } from '../../new_fields/RichTextField';
import { NumCast, StrCast, Cast } from "../../new_fields/Types";
import { emptyFunction } from "../../Utils";
import { Pulls, Pushes } from '../apis/google_docs/GoogleApiClientUtils';
import { DragManager } from "../util/DragManager";
import { UndoManager } from "../util/UndoManager";
import './DocumentButtonBar.scss';
import './collections/ParentDocumentSelector.scss';
import { LinkMenu } from "./linking/LinkMenu";
import { FormattedTextBox, GoogleRef } from "./nodes/FormattedTextBox";
import { TemplateMenu } from "./TemplateMenu";
import { Template, Templates } from "./Templates";
import React = require("react");
import { DocumentView } from './nodes/DocumentView';
import { ParentDocSelector } from './collections/ParentDocumentSelector';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { Id } from '../../new_fields/FieldSymbols';
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

library.add(faLink);
library.add(faTag);
library.add(faTimes);
library.add(faArrowAltCircleDown);
library.add(faArrowAltCircleUp);
library.add(faStopCircle);
library.add(faCheckCircle);
library.add(faCloudUploadAlt);
library.add(faSyncAlt);
library.add(faShare);

const cloud: IconProp = "cloud-upload-alt";
const fetch: IconProp = "sync-alt";

@observer
export class DocumentButtonBar extends React.Component<{ views: (DocumentView | undefined)[], stack?: any }, {}> {
    private _linkButton = React.createRef<HTMLDivElement>();
    private _downX = 0;
    private _downY = 0;
    private _pullAnimating = false;
    private _pushAnimating = false;
    private _pullColorAnimating = false;

    @observable private pushIcon: IconProp = "arrow-alt-circle-up";
    @observable private pullIcon: IconProp = "arrow-alt-circle-down";
    @observable private pullColor: string = "white";
    @observable public isAnimatingFetch = false;
    @observable public isAnimatingPulse = false;

    @observable private openHover = false;

    @observable public static Instance: DocumentButtonBar;
    public static hasPushedHack = false;
    public static hasPulledHack = false;

    constructor(props: { views: (DocumentView | undefined)[] }) {
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

    get view0() { return this.props.views && this.props.views.length ? this.props.views[0] : undefined; }

    @action
    onLinkButtonMoved = (e: PointerEvent): void => {
        if (this._linkButton.current !== null && (Math.abs(e.clientX - this._downX) > 3 || Math.abs(e.clientY - this._downY) > 3)) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved);
            document.removeEventListener("pointerup", this.onLinkButtonUp);
            const linkDrag = UndoManager.StartBatch("Drag Link");
            this.view0 && DragManager.StartLinkDrag(this._linkButton.current, this.view0.props.Document, e.pageX, e.pageY, {
                dragComplete: dropEv => {
                    const linkDoc = dropEv.linkDragData?.linkDocument; // equivalent to !dropEve.aborted since linkDocument is only assigned on a completed drop
                    if (this.view0 && linkDoc && FormattedTextBox.ToolTipTextMenu) {
                        const proto = Doc.GetProto(linkDoc);
                        proto.sourceContext = this.view0.props.ContainingCollectionDoc;

                        const anchor2Title = linkDoc.anchor2 instanceof Doc ? StrCast(linkDoc.anchor2.title) : "-untitled-";
                        if (linkDoc.anchor2 instanceof Doc) {
                            const text = FormattedTextBox.ToolTipTextMenu.MakeLinkToSelection(linkDoc[Id], anchor2Title, e.ctrlKey ? "onRight" : "inTab", linkDoc.anchor2[Id]);
                            proto.title = text === "" ? proto.title : text + " to " + linkDoc.anchor2.title; // TODO open to more descriptive descriptions of following in text link
                        }
                    }
                    linkDrag?.end();
                },
                hideSource: false
            });
        }
        e.stopPropagation();
    }


    onLinkButtonDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.addEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        document.addEventListener("pointerup", this.onLinkButtonUp);
        e.stopPropagation();
    }

    onLinkButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        e.stopPropagation();
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
            onClick={() => {
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
            title={`${!dataDoc.unchanged ? "Pull from" : "Fetch"} Google Docs`}
            style={{ backgroundColor: this.pullColor }}
            onPointerEnter={e => e.altKey && runInAction(() => this.openHover = true)}
            onPointerLeave={action(() => this.openHover = false)}
            onClick={e => {
                if (e.altKey) {
                    e.preventDefault();
                    window.open(`https://docs.google.com/document/d/${dataDoc[GoogleRef]}/edit`);
                } else {
                    this.clearPullColor();
                    DocumentButtonBar.hasPulledHack = false;
                    targetDoc[Pulls] = NumCast(targetDoc[Pulls]) + 1;
                    dataDoc.unchanged && runInAction(() => this.isAnimatingFetch = true);
                }
            }}>
            <FontAwesomeIcon className="documentdecorations-icon" size="sm"
                style={{ WebkitAnimation: animation, MozAnimation: animation }}
                icon={this.openHover ? "share" : dataDoc.unchanged === false ? (this.pullIcon as any) : fetch}
            />
        </div>;
    }

    @computed
    get linkButton() {
        const view0 = this.view0;
        const linkCount = view0 && DocListCast(view0.props.Document.links).length;
        return !view0 ? (null) : <div title="Drag(create link) Tap(view links)" className="documentButtonBar-linkFlyout" ref={this._linkButton}>
            <Flyout anchorPoint={anchorPoints.RIGHT_TOP}
                content={<LinkMenu docView={view0} addDocTab={view0.props.addDocTab} changeFlyout={emptyFunction} />}>
                <div className={"documentButtonBar-linkButton-" + (linkCount ? "nonempty" : "empty")} onPointerDown={this.onLinkButtonDown} >
                    {linkCount ? linkCount : <FontAwesomeIcon className="documentdecorations-icon" icon="link" size="sm" />}
                </div>
            </Flyout>
        </div>;
    }

    @computed
    get contextButton() {
        return !this.view0 ? (null) : <ParentDocSelector Views={this.props.views.filter(v => v).map(v => v as DocumentView)} Document={this.view0.props.Document} addDocTab={(doc, data, where) => {
            where === "onRight" ? CollectionDockingView.AddRightSplit(doc, data) :
                this.props.stack ? CollectionDockingView.Instance.AddTab(this.props.stack, doc, data) :
                    this.view0?.props.addDocTab(doc, data, "onRight");
            return true;
        }} />;
    }

    render() {
        if (!this.view0) return (null);
        const templates: Map<Template, boolean> = new Map();
        Array.from(Object.values(Templates.TemplateList)).map(template =>
            templates.set(template, this.props.views.reduce((checked, doc) => checked || doc?.getLayoutPropStr("show" + template.Name) ? true : false, false as boolean)));

        const isText = this.view0.props.Document.data instanceof RichTextField; // bcz: Todo - can't assume layout is using the 'data' field.  need to add fieldKey to DocumentView
        const considerPull = isText && this.considerGoogleDocsPull;
        const considerPush = isText && this.considerGoogleDocsPush;
        return <div className="documentButtonBar">
            <div className="documentButtonBar-button">
                {this.linkButton}
            </div>
            <div className="documentButtonBar-button">
                <TemplateMenu docs={this.props.views.filter(v => v).map(v => v as DocumentView)} templates={templates} />
            </div>
            <div className="documentButtonBar-button" style={{ display: !considerPush ? "none" : "" }}>
                {this.considerGoogleDocsPush}
            </div>
            <div className="documentButtonBar-button" style={{ display: !considerPull ? "none" : "" }}>
                {this.considerGoogleDocsPull}
            </div>
            {this.contextButton}
        </div>;
    }
}