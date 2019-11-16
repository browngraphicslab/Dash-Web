import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faArrowAltCircleDown, faArrowAltCircleUp, faCheckCircle, faCloudUploadAlt, faLink, faShare, faStopCircle, faSyncAlt, faTag, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../new_fields/Doc";
import { RichTextField } from '../../new_fields/RichTextField';
import { NumCast, StrCast } from "../../new_fields/Types";
import { emptyFunction } from "../../Utils";
import { Pulls, Pushes } from '../apis/google_docs/GoogleApiClientUtils';
import { DragLinksAsDocuments, DragManager } from "../util/DragManager";
import { LinkManager } from '../util/LinkManager';
import { UndoManager } from "../util/UndoManager";
import './DocumentButtonBar.scss';
import './collections/ParentDocumentSelector.scss';
import { LinkMenu } from "./linking/LinkMenu";
import { MetadataEntryMenu } from './MetadataEntryMenu';
import { FormattedTextBox, GoogleRef } from "./nodes/FormattedTextBox";
import { TemplateMenu } from "./TemplateMenu";
import { Template, Templates } from "./Templates";
import React = require("react");
import { DocumentView } from './nodes/DocumentView';
import { ParentDocSelector } from './collections/ParentDocumentSelector';
import { CollectionDockingView } from './collections/CollectionDockingView';
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
export class DocumentButtonBar extends React.Component<{ views: DocumentView[], stack?: any }, {}> {
    private _linkButton = React.createRef<HTMLDivElement>();
    private _linkerButton = React.createRef<HTMLDivElement>();
    private _aliasButton = React.createRef<HTMLDivElement>();
    private _tooltipoff = React.createRef<HTMLDivElement>();
    private _textDoc?: Doc;
    public static Instance: DocumentButtonBar;

    constructor(props: { views: DocumentView[] }) {
        super(props);
        DocumentButtonBar.Instance = this;
    }

    @observable public pushIcon: IconProp = "arrow-alt-circle-up";
    @observable public pullIcon: IconProp = "arrow-alt-circle-down";
    @observable public pullColor: string = "white";
    @observable public isAnimatingFetch = false;
    @observable public openHover = false;
    public pullColorAnimating = false;

    private pullAnimating = false;
    private pushAnimating = false;

    public startPullOutcome = action((success: boolean) => {
        if (!this.pullAnimating) {
            this.pullAnimating = true;
            this.pullIcon = success ? "check-circle" : "stop-circle";
            setTimeout(() => runInAction(() => {
                this.pullIcon = "arrow-alt-circle-down";
                this.pullAnimating = false;
            }), 1000);
        }
    });

    public startPushOutcome = action((success: boolean) => {
        if (!this.pushAnimating) {
            this.pushAnimating = true;
            this.pushIcon = success ? "check-circle" : "stop-circle";
            setTimeout(() => runInAction(() => {
                this.pushIcon = "arrow-alt-circle-up";
                this.pushAnimating = false;
            }), 1000);
        }
    });

    public setPullState = action((unchanged: boolean) => {
        this.isAnimatingFetch = false;
        if (!this.pullColorAnimating) {
            this.pullColorAnimating = true;
            this.pullColor = unchanged ? "lawngreen" : "red";
            setTimeout(this.clearPullColor, 1000);
        }
    });

    private clearPullColor = action(() => {
        this.pullColor = "white";
        this.pullColorAnimating = false;
    });

    onLinkerButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("pointermove", this.onLinkerButtonMoved);
        document.addEventListener("pointermove", this.onLinkerButtonMoved);
        document.removeEventListener("pointerup", this.onLinkerButtonUp);
        document.addEventListener("pointerup", this.onLinkerButtonUp);
    }

    onAliasButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("pointermove", this.onAliasButtonMoved);
        document.addEventListener("pointermove", this.onAliasButtonMoved);
        document.removeEventListener("pointerup", this.onAliasButtonUp);
        document.addEventListener("pointerup", this.onAliasButtonUp);
    }

    onLinkerButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkerButtonMoved);
        document.removeEventListener("pointerup", this.onLinkerButtonUp);
        e.stopPropagation();
    }

    onAliasButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onAliasButtonMoved);
        document.removeEventListener("pointerup", this.onAliasButtonUp);
        e.stopPropagation();
    }

    @action
    onLinkerButtonMoved = (e: PointerEvent): void => {
        if (this._linkerButton.current !== null) {
            document.removeEventListener("pointermove", this.onLinkerButtonMoved);
            document.removeEventListener("pointerup", this.onLinkerButtonUp);
            let docView = this.props.views[0];
            let container = docView.props.ContainingCollectionDoc ? docView.props.ContainingCollectionDoc.proto : undefined;
            let dragData = new DragManager.LinkDragData(docView.props.Document, container ? [container] : []);
            let linkDrag = UndoManager.StartBatch("Drag Link");
            DragManager.StartLinkDrag(this._linkerButton.current, dragData, e.pageX, e.pageY, {
                handlers: {
                    dragComplete: () => {
                        let tooltipmenu = FormattedTextBox.ToolTipTextMenu;
                        let linkDoc = dragData.linkDocument;
                        if (linkDoc && tooltipmenu) {
                            let proto = Doc.GetProto(linkDoc);
                            if (proto && docView) {
                                proto.sourceContext = docView.props.ContainingCollectionDoc;
                            }
                            let text = tooltipmenu.makeLink(linkDoc, StrCast(linkDoc.anchor2.title), e.ctrlKey ? "onRight" : "inTab");
                            if (linkDoc instanceof Doc && linkDoc.anchor2 instanceof Doc) {
                                proto.title = text === "" ? proto.title : text + " to " + linkDoc.anchor2.title; // TODODO open to more descriptive descriptions of following in text link
                            }
                        }
                        linkDrag && linkDrag.end();
                    }
                },
                hideSource: false
            });
        }
        e.stopPropagation();
    }

    @action
    onAliasButtonMoved = (e: PointerEvent): void => {
        if (this._aliasButton.current !== null) {
            document.removeEventListener("pointermove", this.onAliasButtonMoved);
            document.removeEventListener("pointerup", this.onAliasButtonUp);

            let dragDocView = this.props.views[0];
            let dragData = new DragManager.DocumentDragData([dragDocView.props.Document]);
            const [left, top] = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).inverse().transformPoint(0, 0);
            dragData.offset = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).transformDirection(e.clientX - left, e.clientY - top);
            dragData.embedDoc = true;
            dragData.dropAction = "alias";
            DragManager.StartDocumentDrag([dragDocView.ContentDiv!], dragData, e.x, e.y, {
                offsetX: dragData.offset[0],
                offsetY: dragData.offset[1],
                handlers: {
                    dragComplete: action(emptyFunction),
                },
                hideSource: false
            });
        }
        e.stopPropagation();
    }

    onLinkButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.addEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        document.addEventListener("pointerup", this.onLinkButtonUp);
    }

    onLinkButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        e.stopPropagation();
    }

    onLinkButtonMoved = async (e: PointerEvent) => {
        if (this._linkButton.current !== null && (e.movementX > 1 || e.movementY > 1)) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved);
            document.removeEventListener("pointerup", this.onLinkButtonUp);
            DragLinksAsDocuments(this._linkButton.current, e.x, e.y, this.props.views[0].props.Document);
        }
        e.stopPropagation();
    }

    aliasDragger = () => {
        return (<div className="linkButtonWrapper">
            <div title="Drag Alias" className="linkButton-linker" ref={this._aliasButton} onPointerDown={this.onAliasButtonDown}>
                <FontAwesomeIcon className="documentdecorations-icon" icon="image" size="sm" />
            </div>
        </div>);
    }

    private get targetDoc() {
        return this.props.views[0].props.Document;
    }

    considerGoogleDocsPush = () => {
        let canPush = this.targetDoc.data && this.targetDoc.data instanceof RichTextField;
        if (!canPush) return (null);
        let published = Doc.GetProto(this.targetDoc)[GoogleRef] !== undefined;
        let icon: IconProp = published ? (this.pushIcon as any) : cloud;
        return (
            <div className={"linkButtonWrapper"}>
                <div title={`${published ? "Push" : "Publish"} to Google Docs`} className="linkButton-linker" onClick={() => {
                    DocumentButtonBar.hasPushedHack = false;
                    this.targetDoc[Pushes] = NumCast(this.targetDoc[Pushes]) + 1;
                }}>
                    <FontAwesomeIcon className="documentdecorations-icon" icon={icon} size={published ? "sm" : "xs"} />
                </div>
            </div>
        );
    }

    considerGoogleDocsPull = () => {
        let canPull = this.targetDoc.data && this.targetDoc.data instanceof RichTextField;
        let dataDoc = Doc.GetProto(this.targetDoc);
        if (!canPull || !dataDoc[GoogleRef]) return (null);
        let icon = dataDoc.unchanged === false ? (this.pullIcon as any) : fetch;
        icon = this.openHover ? "share" : icon;
        let animation = this.isAnimatingFetch ? "spin 0.5s linear infinite" : "none";
        let title = `${!dataDoc.unchanged ? "Pull from" : "Fetch"} Google Docs`;
        return (
            <div className={"linkButtonWrapper"}>
                <div
                    title={title}
                    className="linkButton-linker"
                    style={{
                        backgroundColor: this.pullColor,
                        transition: "0.2s ease all"
                    }}
                    onPointerEnter={e => e.altKey && runInAction(() => this.openHover = true)}
                    onPointerLeave={() => runInAction(() => this.openHover = false)}
                    onClick={e => {
                        if (e.altKey) {
                            e.preventDefault();
                            window.open(`https://docs.google.com/document/d/${dataDoc[GoogleRef]}/edit`);
                        } else {
                            this.clearPullColor();
                            DocumentButtonBar.hasPulledHack = false;
                            this.targetDoc[Pulls] = NumCast(this.targetDoc[Pulls]) + 1;
                            dataDoc.unchanged && runInAction(() => this.isAnimatingFetch = true);
                        }
                    }}>
                    <FontAwesomeIcon
                        style={{
                            WebkitAnimation: animation,
                            MozAnimation: animation
                        }}
                        className="documentdecorations-icon"
                        icon={icon}
                        size="sm"
                    />
                </div>
            </div>
        );
    }

    public static hasPushedHack = false;
    public static hasPulledHack = false;

    considerTooltip = () => {
        let thisDoc = this.props.views[0].props.Document;
        let isTextDoc = thisDoc.data && thisDoc.data instanceof RichTextField;
        if (!isTextDoc) return null;
        this._textDoc = thisDoc;
        return (
            <div className="tooltipwrapper">
                <div title="Hide Tooltip" className="linkButton-linker" ref={this._tooltipoff} onPointerDown={this.onTooltipOff}>
                    {/* <FontAwesomeIcon className="fa-image" icon="image" size="sm" /> */}
                </div>
            </div>

        );
    }

    onTooltipOff = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (this._textDoc) {
            if (this._tooltipoff.current) {
                if (this._tooltipoff.current.title === "Hide Tooltip") {
                    this._tooltipoff.current.title = "Show Tooltip";
                    this._textDoc.tooltip = "hi";
                }
                else {
                    this._tooltipoff.current.title = "Hide Tooltip";
                }
            }
        }
    }

    get metadataMenu() {
        return (
            <div className="linkButtonWrapper">
                <Flyout anchorPoint={anchorPoints.TOP_LEFT}
                    content={<MetadataEntryMenu docs={() => this.props.views.map(dv => dv.props.Document)} suggestWithFunction />}>{/* tfs: @bcz This might need to be the data document? */}
                    <div className="docDecs-tagButton" title="Add fields"><FontAwesomeIcon className="documentdecorations-icon" icon="tag" size="sm" /></div>
                </Flyout>
            </div>
        );
    }

    render() {
        let linkButton = null;
        if (this.props.views.length > 0) {
            let selFirst = this.props.views[0];

            let linkCount = LinkManager.Instance.getAllRelatedLinks(selFirst.props.Document).length;
            linkButton = (<Flyout
                anchorPoint={anchorPoints.RIGHT_TOP}
                content={<LinkMenu docView={selFirst}
                    addDocTab={selFirst.props.addDocTab}
                    changeFlyout={emptyFunction} />}>
                <div className={"linkButton-" + (linkCount ? "nonempty" : "empty")} onPointerDown={this.onLinkButtonDown} >{linkCount}</div>
            </Flyout >);
        }

        let templates: Map<Template, boolean> = new Map();
        Array.from(Object.values(Templates.TemplateList)).map(template =>
            templates.set(template, this.props.views.reduce((checked, doc) => checked || doc.getLayoutPropStr("show" + template.Name) ? true : false, false as boolean)));

        return (<div className="documentButtonBar">
            <div className="linkButtonWrapper">
                <div title="View Links" className="linkFlyout" ref={this._linkButton}> {linkButton}  </div>
            </div>
            <div className="linkButtonWrapper">
                <div title="Drag Link" className="linkButton-linker" ref={this._linkerButton} onPointerDown={this.onLinkerButtonDown}>
                    <FontAwesomeIcon className="documentdecorations-icon" icon="link" size="sm" />
                </div>
            </div>
            <div className="linkButtonWrapper">
                <TemplateMenu docs={this.props.views} templates={templates} />
            </div>
            {this.metadataMenu}
            {this.aliasDragger()}
            {this.considerGoogleDocsPush()}
            {this.considerGoogleDocsPull()}
            <ParentDocSelector Document={this.props.views[0].props.Document} addDocTab={(doc, data, where) => {
                where === "onRight" ? CollectionDockingView.AddRightSplit(doc, data) : this.props.stack ? CollectionDockingView.Instance.AddTab(this.props.stack, doc, data) : this.props.views[0].props.addDocTab(doc, data, "onRight");
                return true;
            }} />
            {/* {this.considerTooltip()} */}
        </div>
        );
    }
}