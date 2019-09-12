import { library, IconProp } from '@fortawesome/fontawesome-svg-core';
import { faLink, faTag, faTimes, faArrowAltCircleDown, faArrowAltCircleUp, faCheckCircle, faStopCircle, faCloudUploadAlt, faSyncAlt, faShare } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, reaction, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import { BoolCast, Cast, NumCast, StrCast } from "../../new_fields/Types";
import { URLField } from '../../new_fields/URLField';
import { emptyFunction, Utils } from "../../Utils";
import { Docs } from "../documents/Documents";
import { DocumentManager } from "../util/DocumentManager";
import { DragLinksAsDocuments, DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { MINIMIZED_ICON_SIZE } from "../views/globalCssVariables.scss";
import { CollectionView } from "./collections/CollectionView";
import './DocumentDecorations.scss';
import { DocumentView, PositionDocument } from "./nodes/DocumentView";
import { FieldView } from "./nodes/FieldView";
import { FormattedTextBox, GoogleRef } from "./nodes/FormattedTextBox";
import { IconBox } from "./nodes/IconBox";
import { LinkMenu } from "./linking/LinkMenu";
import { TemplateMenu } from "./TemplateMenu";
import { Template, Templates } from "./Templates";
import React = require("react");
import { RichTextField } from '../../new_fields/RichTextField';
import { LinkManager } from '../util/LinkManager';
import { MetadataEntryMenu } from './MetadataEntryMenu';
import { ImageBox } from './nodes/ImageBox';
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { Pulls, Pushes } from '../apis/google_docs/GoogleApiClientUtils';
import { ObjectField } from '../../new_fields/ObjectField';
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
export class DocumentDecorations extends React.Component<{}, { value: string }> {
    static Instance: DocumentDecorations;
    private _isPointerDown = false;
    private _resizing = "";
    private keyinput: React.RefObject<HTMLInputElement>;
    private _resizeBorderWidth = 16;
    private _linkBoxHeight = 20 + 3; // link button height + margin
    private _titleHeight = 20;
    private _linkButton = React.createRef<HTMLDivElement>();
    private _linkerButton = React.createRef<HTMLDivElement>();
    private _embedButton = React.createRef<HTMLDivElement>();
    private _tooltipoff = React.createRef<HTMLDivElement>();
    private _textDoc?: Doc;
    private _downX = 0;
    private _downY = 0;
    private _iconDoc?: Doc = undefined;
    private _resizeUndo?: UndoManager.Batch;
    private _linkDrag?: UndoManager.Batch;
    @observable private _minimizedX = 0;
    @observable private _minimizedY = 0;
    @observable private _title: string = "";
    @observable private _edtingTitle = false;
    @observable private _fieldKey = "title";
    @observable private _hidden = false;
    @observable private _opacity = 1;
    @observable private _removeIcon = false;
    @observable public Interacting = false;
    @observable private _isMoving = false;

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

    constructor(props: Readonly<{}>) {
        super(props);
        DocumentDecorations.Instance = this;
        this.keyinput = React.createRef();
        reaction(() => SelectionManager.SelectedDocuments().slice(), docs => this._edtingTitle = false);
    }

    @action titleChanged = (event: any) => { this._title = event.target.value; };
    @action titleBlur = () => { this._edtingTitle = false; };
    @action titleEntered = (e: any) => {
        var key = e.keyCode || e.which;
        // enter pressed
        if (key === 13) {
            var text = e.target.value;
            if (text[0] === '#') {
                this._fieldKey = text.slice(1, text.length);
                this._title = this.selectionTitle;
            } else if (text.startsWith(">")) {
                let fieldTemplateView = SelectionManager.SelectedDocuments()[0];
                SelectionManager.DeselectAll();
                let fieldTemplate = fieldTemplateView.props.Document;
                let containerView = fieldTemplateView.props.ContainingCollectionView;
                if (containerView) {
                    let docTemplate = containerView.props.Document;
                    let metaKey = text.startsWith(">>") ? text.slice(2, text.length) : text.slice(1, text.length);
                    let proto = Doc.GetProto(docTemplate);
                    if (metaKey !== containerView.props.fieldKey && containerView.props.DataDoc) {
                        const fd = fieldTemplate.data;
                        fd instanceof ObjectField && (Doc.GetProto(containerView.props.DataDoc)[metaKey] = ObjectField.MakeCopy(fd));
                    }
                    Doc.MakeTemplate(fieldTemplate, metaKey, proto);
                    if (text.startsWith(">>")) {
                        proto.detailedLayout = proto.layout;
                        proto.miniLayout = ImageBox.LayoutString(metaKey);
                    }
                }
            }
            else {
                if (SelectionManager.SelectedDocuments().length > 0) {
                    SelectionManager.SelectedDocuments()[0].props.Document.customTitle = true;
                    let field = SelectionManager.SelectedDocuments()[0].props.Document[this._fieldKey];
                    if (typeof field === "number") {
                        SelectionManager.SelectedDocuments().forEach(d => {
                            let doc = d.props.Document.proto ? d.props.Document.proto : d.props.Document;
                            doc[this._fieldKey] = +this._title;
                        });
                    } else {
                        SelectionManager.SelectedDocuments().forEach(d => {
                            let doc = d.props.Document.proto ? d.props.Document.proto : d.props.Document;
                            doc[this._fieldKey] = this._title;
                        });
                    }
                }
            }
            e.target.blur();
        }
    }
    @action onTitleDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onTitleMove);
        document.removeEventListener("pointerup", this.onTitleUp);
        document.addEventListener("pointermove", this.onTitleMove);
        document.addEventListener("pointerup", this.onTitleUp);
    }
    @action onTitleMove = (e: PointerEvent): void => {
        if (Math.abs(e.clientX - this._downX) > 4 || Math.abs(e.clientY - this._downY) > 4) {
            this.Interacting = true;
        }
        if (this.Interacting) this.onBackgroundMove(e);
        e.stopPropagation();
    }
    @action onTitleUp = (e: PointerEvent): void => {
        if (Math.abs(e.clientX - this._downX) < 4 || Math.abs(e.clientY - this._downY) < 4) {
            this._title = this.selectionTitle;
            this._edtingTitle = true;
        }
        document.removeEventListener("pointermove", this.onTitleMove);
        document.removeEventListener("pointerup", this.onTitleUp);
        this.onBackgroundUp(e);
    }

    @observable _forceUpdate = 0;
    _lastBox = { x: 0, y: 0, r: 0, b: 0 };
    @computed
    get Bounds(): { x: number, y: number, b: number, r: number } {
        let x = this._forceUpdate;
        this._lastBox = SelectionManager.SelectedDocuments().reduce((bounds, documentView) => {
            if (documentView.props.renderDepth === 0 ||
                Doc.AreProtosEqual(documentView.props.Document, CurrentUserUtils.UserDocument)) {
                return bounds;
            }
            let transform = (documentView.props.ScreenToLocalTransform().scale(documentView.props.ContentScaling())).inverse();
            if (transform.TranslateX === 0 && transform.TranslateY === 0) {
                setTimeout(action(() => this._forceUpdate++), 0); // bcz: fix CollectionStackingView's getTransform() somehow...
                return this._lastBox;
            }

            var [sptX, sptY] = transform.transformPoint(0, 0);
            let [bptX, bptY] = transform.transformPoint(documentView.props.PanelWidth(), documentView.props.PanelHeight());
            return {
                x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
            };
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
        return this._lastBox;
    }

    onBackgroundDown = (e: React.PointerEvent): void => {
        document.removeEventListener("pointermove", this.onBackgroundMove);
        document.removeEventListener("pointerup", this.onBackgroundUp);
        document.addEventListener("pointermove", this.onBackgroundMove);
        document.addEventListener("pointerup", this.onBackgroundUp);
        e.stopPropagation();
    }

    @action
    onBackgroundMove = (e: PointerEvent): void => {
        let dragDocView = SelectionManager.SelectedDocuments()[0];
        const [left, top] = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).inverse().transformPoint(0, 0);
        const [xoff, yoff] = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).transformDirection(e.x - left, e.y - top);
        let dragData = new DragManager.DocumentDragData(SelectionManager.SelectedDocuments().map(dv => dv.props.Document), SelectionManager.SelectedDocuments().map(dv => dv.props.DataDoc ? dv.props.DataDoc : dv.props.Document));
        dragData.xOffset = xoff;
        dragData.yOffset = yoff;
        dragData.moveDocument = SelectionManager.SelectedDocuments()[0].props.moveDocument;
        this.Interacting = true;
        this._hidden = true;
        document.removeEventListener("pointermove", this.onBackgroundMove);
        document.removeEventListener("pointerup", this.onBackgroundUp);
        document.removeEventListener("pointermove", this.onTitleMove);
        document.removeEventListener("pointerup", this.onTitleUp);
        DragManager.StartDocumentDrag(SelectionManager.SelectedDocuments().map(docView => docView.ContentDiv!), dragData, e.x, e.y, {
            handlers: { dragComplete: action(() => this._hidden = this.Interacting = false) },
            hideSource: true
        });
        e.stopPropagation();
    }

    @action
    onBackgroundUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onBackgroundMove);
        document.removeEventListener("pointerup", this.onBackgroundUp);
        e.stopPropagation();
        e.preventDefault();
    }

    onCloseDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            document.removeEventListener("pointermove", this.onCloseMove);
            document.addEventListener("pointermove", this.onCloseMove);
            document.removeEventListener("pointerup", this.onCloseUp);
            document.addEventListener("pointerup", this.onCloseUp);
        }
    }
    onCloseMove = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
        }
    }
    @undoBatch
    @action
    onCloseUp = async (e: PointerEvent) => {
        e.stopPropagation();
        if (e.button === 0) {
            const recent = Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc) as Doc;
            SelectionManager.SelectedDocuments().map(dv => {
                recent && Doc.AddDocToList(recent, "data", dv.props.Document, undefined, true, true);
                dv.props.removeDocument && dv.props.removeDocument(dv.props.Document);
            });
            SelectionManager.DeselectAll();
            document.removeEventListener("pointermove", this.onCloseMove);
            document.removeEventListener("pointerup", this.onCloseUp);
        }
    }
    @action
    onMinimizeDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        this._iconDoc = undefined;
        if (e.button === 0) {
            this._downX = e.pageX;
            this._downY = e.pageY;
            this._removeIcon = false;
            let selDoc = SelectionManager.SelectedDocuments()[0];
            let selDocPos = selDoc.props.ScreenToLocalTransform().scale(selDoc.props.ContentScaling()).inverse().transformPoint(0, 0);
            this._minimizedX = selDocPos[0] + 12;
            this._minimizedY = selDocPos[1] + 12;
            document.removeEventListener("pointermove", this.onMinimizeMove);
            document.addEventListener("pointermove", this.onMinimizeMove);
            document.removeEventListener("pointerup", this.onMinimizeUp);
            document.addEventListener("pointerup", this.onMinimizeUp);
        }
    }

    @action
    onMinimizeMove = (e: PointerEvent): void => {
        e.stopPropagation();
        if (Math.abs(e.pageX - this._downX) > Utils.DRAG_THRESHOLD ||
            Math.abs(e.pageY - this._downY) > Utils.DRAG_THRESHOLD) {
            let selDoc = SelectionManager.SelectedDocuments()[0];
            let selDocPos = selDoc.props.ScreenToLocalTransform().scale(selDoc.props.ContentScaling()).inverse().transformPoint(0, 0);
            let snapped = Math.abs(e.pageX - selDocPos[0]) < 20 && Math.abs(e.pageY - selDocPos[1]) < 20;
            this._minimizedX = snapped ? selDocPos[0] + 4 : e.clientX;
            this._minimizedY = snapped ? selDocPos[1] - 18 : e.clientY;
            let selectedDocs = SelectionManager.SelectedDocuments().map(sd => sd);

            if (selectedDocs.length > 1) {
                this._iconDoc = this._iconDoc ? this._iconDoc : this.createIcon(SelectionManager.SelectedDocuments(), CollectionView.LayoutString());
                this.moveIconDoc(this._iconDoc);
            } else {
                this.getIconDoc(selectedDocs[0]).then(icon => icon && this.moveIconDoc(this._iconDoc = icon));
            }
            this._removeIcon = snapped;
        }
    }
    @undoBatch
    @action
    onMinimizeUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            document.removeEventListener("pointermove", this.onMinimizeMove);
            document.removeEventListener("pointerup", this.onMinimizeUp);
            let selectedDocs = SelectionManager.SelectedDocuments().map(sd => sd);
            if (this._iconDoc && selectedDocs.length === 1 && this._removeIcon) {
                selectedDocs[0].props.removeDocument && selectedDocs[0].props.removeDocument(this._iconDoc);
            }
            if (!this._removeIcon) {
                if (selectedDocs.length === 1) {
                    this.getIconDoc(selectedDocs[0]).then(icon => selectedDocs[0].toggleMinimized());
                } else if (Math.abs(e.pageX - this._downX) < Utils.DRAG_THRESHOLD &&
                    Math.abs(e.pageY - this._downY) < Utils.DRAG_THRESHOLD) {
                    let docViews = SelectionManager.ViewsSortedVertically();
                    let topDocView = docViews[0];
                    let ind = topDocView.templates.indexOf(Templates.Bullet.Layout);
                    if (ind !== -1) {
                        topDocView.templates.splice(ind, 1);
                        topDocView.props.Document.subBulletDocs = undefined;
                    } else {
                        topDocView.addTemplate(Templates.Bullet);
                        topDocView.props.Document.subBulletDocs = new List<Doc>(docViews.filter(v => v !== topDocView).map(v => v.props.Document.proto!));
                    }
                }
            }
            this._removeIcon = false;
        }
        runInAction(() => this._minimizedX = this._minimizedY = 0);
    }

    @undoBatch
    @action createIcon = (selected: DocumentView[], layoutString: string): Doc => {
        let doc = selected[0].props.Document;
        let iconDoc = Docs.Create.IconDocument(layoutString);
        iconDoc.isButton = true;
        iconDoc.proto!.title = selected.length > 1 ? "-multiple-.icon" : StrCast(doc.title) + ".icon";
        iconDoc.labelField = selected.length > 1 ? undefined : this._fieldKey;
        //iconDoc.proto![this._fieldKey] = selected.length > 1 ? "collection" : undefined;
        iconDoc.proto!.isMinimized = false;
        iconDoc.width = Number(MINIMIZED_ICON_SIZE);
        iconDoc.height = Number(MINIMIZED_ICON_SIZE);
        iconDoc.x = NumCast(doc.x);
        iconDoc.y = NumCast(doc.y) - 24;
        iconDoc.maximizedDocs = new List<Doc>(selected.map(s => s.props.Document));
        selected.length === 1 && (doc.minimizedDoc = iconDoc);
        selected[0].props.addDocument && selected[0].props.addDocument(iconDoc, false);
        return iconDoc;
    }
    @action
    public getIconDoc = async (docView: DocumentView): Promise<Doc | undefined> => {
        let doc = docView.props.Document;
        let iconDoc: Doc | undefined = await Cast(doc.minimizedDoc, Doc);

        if (!iconDoc || !DocumentManager.Instance.getDocumentView(iconDoc)) {
            const layout = StrCast(doc.backgroundLayout, StrCast(doc.layout, FieldView.LayoutString(DocumentView)));
            iconDoc = this.createIcon([docView], layout);
        }
        return iconDoc;
    }
    moveIconDoc(iconDoc: Doc) {
        let selView = SelectionManager.SelectedDocuments()[0];
        let where = (selView.props.ScreenToLocalTransform()).scale(selView.props.ContentScaling()).
            transformPoint(this._minimizedX - 12, this._minimizedY - 12);
        iconDoc.x = where[0] + NumCast(selView.props.Document.x);
        iconDoc.y = where[1] + NumCast(selView.props.Document.y);
    }

    _radiusDown = [0, 0];
    @action
    onRadiusDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._radiusDown = [e.clientX, e.clientY];
            this._isPointerDown = true;
            this._resizeUndo = UndoManager.StartBatch("DocDecs set radius");
            document.removeEventListener("pointermove", this.onRadiusMove);
            document.removeEventListener("pointerup", this.onRadiusUp);
            document.addEventListener("pointermove", this.onRadiusMove);
            document.addEventListener("pointerup", this.onRadiusUp);
        }
        if (!this._isMoving) {
            SelectionManager.SelectedDocuments().map(dv => dv.props.Document.layout instanceof Doc ? dv.props.Document.layout : dv.props.Document.isTemplate ? dv.props.Document : Doc.GetProto(dv.props.Document)).
                map(d => d.borderRounding = "0%");
        }
    }

    onRadiusMove = (e: PointerEvent): void => {
        this._isMoving = true;
        let dist = Math.sqrt((e.clientX - this._radiusDown[0]) * (e.clientX - this._radiusDown[0]) + (e.clientY - this._radiusDown[1]) * (e.clientY - this._radiusDown[1]));
        SelectionManager.SelectedDocuments().map(dv => dv.props.Document.layout instanceof Doc ? dv.props.Document.layout : dv.props.Document.isTemplate ? dv.props.Document : Doc.GetProto(dv.props.Document)).
            map(d => d.borderRounding = `${Math.min(100, dist)}%`);
        SelectionManager.SelectedDocuments().map(dv => {
            let cv = dv.props.ContainingCollectionView;
            let ruleProvider = cv && (Cast(cv.props.Document.ruleProvider, Doc) as Doc);
            let heading = NumCast(dv.props.Document.heading);
            cv && ((ruleProvider ? ruleProvider : cv.props.Document)["ruleRounding_" + heading] = StrCast(dv.props.Document.borderRounding));
        })
        e.stopPropagation();
        e.preventDefault();
    }

    onRadiusUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = false;
        this._resizeUndo && this._resizeUndo.end();
        this._isMoving = false;
        document.removeEventListener("pointermove", this.onRadiusMove);
        document.removeEventListener("pointerup", this.onRadiusUp);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._isPointerDown = true;
            this._resizing = e.currentTarget.id;
            this.Interacting = true;
            this._resizeUndo = UndoManager.StartBatch("DocDecs resize");
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    onLinkerButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onLinkerButtonMoved);
        document.addEventListener("pointermove", this.onLinkerButtonMoved);
        document.removeEventListener("pointerup", this.onLinkerButtonUp);
        document.addEventListener("pointerup", this.onLinkerButtonUp);
    }

    onEmbedButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onEmbedButtonMoved);
        document.addEventListener("pointermove", this.onEmbedButtonMoved);
        document.removeEventListener("pointerup", this.onEmbedButtonUp);
        document.addEventListener("pointerup", this.onEmbedButtonUp);
    }

    onLinkerButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkerButtonMoved);
        document.removeEventListener("pointerup", this.onLinkerButtonUp);
        e.stopPropagation();
    }

    onEmbedButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onEmbedButtonMoved);
        document.removeEventListener("pointerup", this.onEmbedButtonUp);
        e.stopPropagation();
    }

    @action
    onLinkerButtonMoved = (e: PointerEvent): void => {
        if (this._linkerButton.current !== null) {
            document.removeEventListener("pointermove", this.onLinkerButtonMoved);
            document.removeEventListener("pointerup", this.onLinkerButtonUp);
            let selDoc = SelectionManager.SelectedDocuments()[0];
            let container = selDoc.props.ContainingCollectionView ? selDoc.props.ContainingCollectionView.props.Document.proto : undefined;
            let dragData = new DragManager.LinkDragData(selDoc.props.Document, container ? [container] : []);
            FormattedTextBox.InputBoxOverlay = undefined;
            this._linkDrag = UndoManager.StartBatch("Drag Link");
            DragManager.StartLinkDrag(this._linkerButton.current, dragData, e.pageX, e.pageY, {
                handlers: {
                    dragComplete: () => {
                        if (this._linkDrag) {
                            this._linkDrag.end();
                            this._linkDrag = undefined;
                        }
                    },
                },
                hideSource: false
            });
        }
        e.stopPropagation();
    }

    @action
    onEmbedButtonMoved = (e: PointerEvent): void => {
        if (this._embedButton.current !== null) {
            document.removeEventListener("pointermove", this.onEmbedButtonMoved);
            document.removeEventListener("pointerup", this.onEmbedButtonUp);

            let dragDocView = SelectionManager.SelectedDocuments()[0];
            let dragData = new DragManager.EmbedDragData(dragDocView.props.Document);

            DragManager.StartEmbedDrag(dragDocView.ContentDiv!, dragData, e.x, e.y, {
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
            DragLinksAsDocuments(this._linkButton.current, e.x, e.y, SelectionManager.SelectedDocuments()[0].props.Document);
        }
        e.stopPropagation();
    }

    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!this._isPointerDown) {
            return;
        }

        let dX = 0, dY = 0, dW = 0, dH = 0;

        switch (this._resizing) {
            case "":
                break;
            case "documentDecorations-topLeftResizer":
                dX = -1;
                dY = -1;
                dW = -(e.movementX);
                dH = -(e.movementY);
                break;
            case "documentDecorations-topRightResizer":
                dW = e.movementX;
                dY = -1;
                dH = -(e.movementY);
                break;
            case "documentDecorations-topResizer":
                dY = -1;
                dH = -(e.movementY);
                break;
            case "documentDecorations-bottomLeftResizer":
                dX = -1;
                dW = -(e.movementX);
                dH = e.movementY;
                break;
            case "documentDecorations-bottomRightResizer":
                dW = e.movementX;
                dH = e.movementY;
                break;
            case "documentDecorations-bottomResizer":
                dH = e.movementY;
                break;
            case "documentDecorations-leftResizer":
                dX = -1;
                dW = -(e.movementX);
                break;
            case "documentDecorations-rightResizer":
                dW = e.movementX;
                break;
        }

        if (!this._resizing) runInAction(() => FormattedTextBox.InputBoxOverlay = undefined);
        SelectionManager.SelectedDocuments().forEach(element => {
            if (dX !== 0 || dY !== 0 || dW !== 0 || dH !== 0) {
                let doc = PositionDocument(element.props.Document);
                let nwidth = doc.nativeWidth || 0;
                let nheight = doc.nativeHeight || 0;
                let width = (doc.width || 0);
                let height = (doc.height || (nheight / nwidth * width));
                let scale = element.props.ScreenToLocalTransform().Scale * element.props.ContentScaling();
                let actualdW = Math.max(width + (dW * scale), 20);
                let actualdH = Math.max(height + (dH * scale), 20);
                doc.x = (doc.x || 0) + dX * (actualdW - width);
                doc.y = (doc.y || 0) + dY * (actualdH - height);
                let proto = doc.isTemplate ? doc : Doc.GetProto(element.props.Document); // bcz: 'doc' didn't work here...
                let fixedAspect = e.ctrlKey || (!BoolCast(doc.ignoreAspect) && nwidth && nheight);
                if (fixedAspect && e.ctrlKey && BoolCast(doc.ignoreAspect)) {
                    doc.ignoreAspect = false;
                    proto.nativeWidth = nwidth = doc.width || 0;
                    proto.nativeHeight = nheight = doc.height || 0;
                }
                if (fixedAspect && (!nwidth || !nheight)) {
                    proto.nativeWidth = nwidth = doc.width || 0;
                    proto.nativeHeight = nheight = doc.height || 0;
                }
                if (nwidth > 0 && nheight > 0 && !BoolCast(doc.ignoreAspect)) {
                    if (Math.abs(dW) > Math.abs(dH)) {
                        if (!fixedAspect) {
                            Doc.SetInPlace(element.props.Document, "nativeWidth", actualdW / (doc.width || 1) * (doc.nativeWidth || 0), true);
                        }
                        doc.width = actualdW;
                        if (fixedAspect) doc.height = nheight / nwidth * doc.width;
                        else doc.height = actualdH;
                    }
                    else {
                        if (!fixedAspect) {
                            Doc.SetInPlace(element.props.Document, "nativeHeight", actualdH / (doc.height || 1) * (doc.nativeHeight || 0), true);
                        }
                        doc.height = actualdH;
                        if (fixedAspect) doc.width = nwidth / nheight * doc.height;
                        else doc.width = actualdW;
                    }
                } else {
                    dW && (doc.width = actualdW);
                    dH && (doc.height = actualdH);
                    dH && element.props.Document.autoHeight && Doc.SetInPlace(element.props.Document, "autoHeight", false, true);
                }
            }
        });
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        this._resizing = "";
        this.Interacting = false;
        if (e.button === 0) {
            e.preventDefault();
            this._isPointerDown = false;
            this._resizeUndo && this._resizeUndo.end();
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
        }
    }

    @computed
    get selectionTitle(): string {
        if (SelectionManager.SelectedDocuments().length === 1) {
            let field = SelectionManager.SelectedDocuments()[0].props.Document[this._fieldKey];
            if (typeof field === "string") {
                return field;
            }
            else if (typeof field === "number") {
                return field.toString();
            }
        } else if (SelectionManager.SelectedDocuments().length > 1) {
            return "-multiple-";
        }
        return "-unset-";
    }

    changeFlyoutContent = (): void => {

    }
    // buttonOnPointerUp = (e: React.PointerEvent): void => {
    //     e.stopPropagation();
    // }

    considerEmbed = () => {
        let thisDoc = SelectionManager.SelectedDocuments()[0].props.Document;
        let canEmbed = thisDoc.data && thisDoc.data instanceof URLField;
        if (!canEmbed) return (null);
        return (
            <div className="linkButtonWrapper">
                <div title="Drag Embed" className="linkButton-linker" ref={this._embedButton} onPointerDown={this.onEmbedButtonDown}>
                    <FontAwesomeIcon className="documentdecorations-icon" icon="image" size="sm" />
                </div>
            </div>
        );
    }

    private get targetDoc() {
        return SelectionManager.SelectedDocuments()[0].props.Document;
    }

    considerGoogleDocsPush = () => {
        let canPush = this.targetDoc.data && this.targetDoc.data instanceof RichTextField;
        if (!canPush) return (null);
        let published = Doc.GetProto(this.targetDoc)[GoogleRef] !== undefined;
        let icon: IconProp = published ? (this.pushIcon as any) : cloud;
        return (
            <div className={"linkButtonWrapper"}>
                <div title={`${published ? "Push" : "Publish"} to Google Docs`} className="linkButton-linker" onClick={() => {
                    DocumentDecorations.hasPushedHack = false;
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
                            DocumentDecorations.hasPulledHack = false;
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
        let thisDoc = SelectionManager.SelectedDocuments()[0].props.Document;
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
                    content={<MetadataEntryMenu docs={() => SelectionManager.SelectedDocuments().map(dv => dv.props.Document)} suggestWithFunction />}>{/* tfs: @bcz This might need to be the data document? */}
                    <div className="docDecs-tagButton" title="Add fields"><FontAwesomeIcon className="documentdecorations-icon" icon="tag" size="sm" /></div>
                </Flyout>
            </div>
        );
    }

    render() {
        var bounds = this.Bounds;
        let seldoc = SelectionManager.SelectedDocuments().length ? SelectionManager.SelectedDocuments()[0] : undefined;
        if (bounds.x === Number.MAX_VALUE || !seldoc || this._hidden || isNaN(bounds.r) || isNaN(bounds.b) || isNaN(bounds.x) || isNaN(bounds.y)) {
            return (null);
        }
        let minimizeIcon = (
            <div className="documentDecorations-minimizeButton" onPointerDown={this.onMinimizeDown}>
                {SelectionManager.SelectedDocuments().length === 1 ? IconBox.DocumentIcon(StrCast(SelectionManager.SelectedDocuments()[0].props.Document.layout, "...")) : "..."}
            </div>);

        let linkButton = null;
        if (SelectionManager.SelectedDocuments().length > 0) {
            let selFirst = SelectionManager.SelectedDocuments()[0];

            let linkCount = LinkManager.Instance.getAllRelatedLinks(selFirst.props.Document).length;
            linkButton = (<Flyout
                anchorPoint={anchorPoints.RIGHT_TOP}
                content={<LinkMenu docView={selFirst}
                    addDocTab={selFirst.props.addDocTab}
                    changeFlyout={this.changeFlyoutContent} />}>
                <div className={"linkButton-" + (linkCount ? "nonempty" : "empty")} onPointerDown={this.onLinkButtonDown} >{linkCount}</div>
            </Flyout >);
        }

        let templates: Map<Template, boolean> = new Map();
        Array.from(Object.values(Templates.TemplateList)).map(template => {
            let checked = false;
            SelectionManager.SelectedDocuments().map(doc => checked = checked || (doc.props.Document["show" + template.Name] !== undefined));
            templates.set(template, checked);
        });

        bounds.x = Math.max(0, bounds.x - this._resizeBorderWidth / 2) + this._resizeBorderWidth / 2;
        bounds.y = Math.max(0, bounds.y - this._resizeBorderWidth / 2 - this._titleHeight) + this._resizeBorderWidth / 2 + this._titleHeight;
        const borderRadiusDraggerWidth = 15;
        bounds.r = Math.min(window.innerWidth, bounds.r + borderRadiusDraggerWidth + this._resizeBorderWidth / 2) - this._resizeBorderWidth / 2 - borderRadiusDraggerWidth;
        bounds.b = Math.min(window.innerHeight, bounds.b + this._resizeBorderWidth / 2 + this._linkBoxHeight) - this._resizeBorderWidth / 2 - this._linkBoxHeight;
        if (bounds.x > bounds.r) {
            bounds.x = bounds.r - this._resizeBorderWidth;
        }
        if (bounds.y > bounds.b) {
            bounds.y = bounds.b - (this._resizeBorderWidth + this._linkBoxHeight + this._titleHeight);
        }
        return (<div className="documentDecorations">
            <div className="documentDecorations-background" style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2,
                pointerEvents: this.Interacting ? "none" : "all",
                zIndex: SelectionManager.SelectedDocuments().length > 1 ? 900 : 0,
            }} onPointerDown={this.onBackgroundDown} onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); }} >
            </div>
            <div className="documentDecorations-container" style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth + this._linkBoxHeight + this._titleHeight) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2 - this._titleHeight,
                opacity: this._opacity
            }}>
                {minimizeIcon}

                {this._edtingTitle ?
                    <input ref={this.keyinput} className="title" type="text" name="dynbox" value={this._title} onBlur={this.titleBlur} onChange={this.titleChanged} onKeyPress={this.titleEntered} /> :
                    <div className="title" onPointerDown={this.onTitleDown} ><span>{`${this.selectionTitle}`}</span></div>}
                <div className="documentDecorations-closeButton" title="Close Document" onPointerDown={this.onCloseDown}>
                    <FontAwesomeIcon className="documentdecorations-times" icon={faTimes} size="lg" />
                </div>
                <div id="documentDecorations-topLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-leftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-centerCont"></div>
                <div id="documentDecorations-rightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-borderRadius" className="documentDecorations-radius" onPointerDown={this.onRadiusDown} onContextMenu={(e) => e.preventDefault()}><span className="borderRadiusTooltip" title="Drag Corner Radius"></span></div>
                <div className="link-button-container">
                    <div className="linkButtonWrapper">
                        <div title="View Links" className="linkFlyout" ref={this._linkButton}> {linkButton}  </div>
                    </div>
                    <div className="linkButtonWrapper">
                        <div title="Drag Link" className="linkButton-linker" ref={this._linkerButton} onPointerDown={this.onLinkerButtonDown}>
                            <FontAwesomeIcon className="documentdecorations-icon" icon="link" size="sm" />
                        </div>
                    </div>
                    <div className="linkButtonWrapper">
                        <TemplateMenu docs={SelectionManager.ViewsSortedVertically()} templates={templates} />
                    </div>
                    {this.metadataMenu}
                    {this.considerEmbed()}
                    {this.considerGoogleDocsPush()}
                    {this.considerGoogleDocsPull()}
                    {/* {this.considerTooltip()} */}
                </div>
            </div >
        </div>
        );
    }
}