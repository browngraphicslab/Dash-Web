import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faArrowAltCircleDown, faArrowAltCircleUp, faCheckCircle, faCloudUploadAlt, faLink, faShare, faStopCircle, faSyncAlt, faTag, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCastAsync } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import { ObjectField } from '../../new_fields/ObjectField';
import { BoolCast, Cast, NumCast, StrCast } from "../../new_fields/Types";
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { emptyFunction, Utils } from "../../Utils";
import { Docs, DocUtils } from "../documents/Documents";
import { DocumentManager } from "../util/DocumentManager";
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { MINIMIZED_ICON_SIZE } from "../views/globalCssVariables.scss";
import { CollectionView } from "./collections/CollectionView";
import { DocumentButtonBar } from './DocumentButtonBar';
import './DocumentDecorations.scss';
import { PositionDocument } from './nodes/CollectionFreeFormDocumentView';
import { DocumentView, swapViews } from "./nodes/DocumentView";
import { FieldView } from "./nodes/FieldView";
import { FormattedTextBox } from "./nodes/FormattedTextBox";
import { IconBox } from "./nodes/IconBox";
import React = require("react");
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

@observer
export class DocumentDecorations extends React.Component<{}, { value: string }> {
    static Instance: DocumentDecorations;
    private _isPointerDown = false;
    private _resizing = "";
    private _keyinput: React.RefObject<HTMLInputElement>;
    private _resizeBorderWidth = 16;
    private _linkBoxHeight = 20 + 3; // link button height + margin
    private _titleHeight = 20;
    private _embedButton = React.createRef<HTMLDivElement>();
    private _downX = 0;
    private _downY = 0;
    private _iconDoc?: Doc = undefined;
    private _resizeUndo?: UndoManager.Batch;
    private _radiusDown = [0, 0];
    @observable private _minimizedX = 0;
    @observable private _minimizedY = 0;
    @observable private _title: string = "";
    @observable private _edtingTitle = false;
    @observable private _fieldKey = "title";
    @observable private _hidden = false;
    @observable private _opacity = 1;
    @observable private _removeIcon = false;
    @observable public Interacting = false;

    @observable public pushIcon: IconProp = "arrow-alt-circle-up";
    @observable public pullIcon: IconProp = "arrow-alt-circle-down";
    @observable public pullColor: string = "white";
    @observable public isAnimatingFetch = false;
    @observable public openHover = false;

    constructor(props: Readonly<{}>) {
        super(props);
        DocumentDecorations.Instance = this;
        this._keyinput = React.createRef();
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
            } else if (text.startsWith("::")) {
                let targetID = text.slice(2, text.length);
                let promoteDoc = SelectionManager.SelectedDocuments()[0];
                DocUtils.Publish(promoteDoc.props.Document, targetID, promoteDoc.props.addDocument, promoteDoc.props.removeDocument);
            } else if (text.startsWith(">")) {
                let fieldTemplateView = SelectionManager.SelectedDocuments()[0];
                SelectionManager.DeselectAll();
                let fieldTemplate = fieldTemplateView.props.Document;
                let containerView = fieldTemplateView.props.ContainingCollectionView;
                let docTemplate = fieldTemplateView.props.ContainingCollectionDoc;
                if (containerView && docTemplate) {
                    let metaKey = text.startsWith(">>") ? text.slice(2, text.length) : text.slice(1, text.length);
                    if (metaKey !== containerView.props.fieldKey && containerView.props.DataDoc) {
                        const fd = fieldTemplate.data;
                        fd instanceof ObjectField && (Doc.GetProto(containerView.props.DataDoc)[metaKey] = ObjectField.MakeCopy(fd));
                    }
                    fieldTemplate.title = metaKey;
                    Doc.MakeMetadataFieldTemplate(fieldTemplate, Doc.GetProto(docTemplate));
                    if (text.startsWith(">>")) {
                        let layoutNative = Doc.MakeTitled("layoutNative");
                        Doc.GetProto(docTemplate).layoutNative = layoutNative;
                        swapViews(fieldTemplate, "", "layoutNative", layoutNative);
                        layoutNative.layout = StrCast(fieldTemplateView.props.Document.layout).replace(/fieldKey={"[^"]*"}/, `fieldKey={"${metaKey}"}`);
                        layoutNative.backgroundLayout = StrCast(fieldTemplateView.props.Document.backgroundLayout).replace(/fieldKey={"[^"]*"}/, `fieldKey={"${metaKey}"}`);
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
                setTimeout(action(() => this._forceUpdate++), 0); // bcz: fix CollectionStackingView's getTransform() somehow...without this, resizing things in the library view, for instance, show the wrong bounds
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
        let dragData = new DragManager.DocumentDragData(SelectionManager.SelectedDocuments().map(dv => dv.props.Document));
        const [left, top] = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).inverse().transformPoint(0, 0);
        dragData.offset = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).transformDirection(e.x - left, e.y - top);
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
            if (!this._removeIcon && selectedDocs.length === 1) { // if you click on the top-left button when just 1 doc is selected, then collapse it.  not sure why we don't do it for multiple selections
                this.getIconDoc(selectedDocs[0]).then(async icon => {
                    let minimizedDoc = await Cast(selectedDocs[0].props.Document.minimizedDoc, Doc);
                    if (minimizedDoc) {
                        let scrpt = selectedDocs[0].props.ScreenToLocalTransform().scale(selectedDocs[0].props.ContentScaling()).inverse().transformPoint(
                            NumCast(minimizedDoc.x) - NumCast(selectedDocs[0].Document.x), NumCast(minimizedDoc.y) - NumCast(selectedDocs[0].Document.y));
                        SelectionManager.DeselectAll();
                        DocumentManager.Instance.animateBetweenPoint(scrpt, await DocListCastAsync(minimizedDoc.maximizedDocs));
                    }
                });
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

        IconBox.AutomaticTitle(iconDoc);
        //iconDoc.proto![this._fieldKey] = selected.length > 1 ? "collection" : undefined;
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
    }

    onRadiusMove = (e: PointerEvent): void => {
        let dist = Math.sqrt((e.clientX - this._radiusDown[0]) * (e.clientX - this._radiusDown[0]) + (e.clientY - this._radiusDown[1]) * (e.clientY - this._radiusDown[1]));
        dist = dist < 3 ? 0 : dist;
        let usingRule = false;
        SelectionManager.SelectedDocuments().map(dv => {
            let ruleProvider = dv.props.ruleProvider;
            let heading = NumCast(dv.props.Document.heading);
            ruleProvider && heading && (Doc.GetProto(ruleProvider)["ruleRounding_" + heading] = `${Math.min(100, dist)}%`);
            usingRule = usingRule || (ruleProvider && heading ? true : false);
        });
        !usingRule && SelectionManager.SelectedDocuments().map(dv => dv.props.Document.layout instanceof Doc ? dv.props.Document.layout : dv.props.Document.isTemplate ? dv.props.Document : Doc.GetProto(dv.props.Document)).
            map(d => d.borderRounding = `${Math.min(100, dist)}%`);
        e.stopPropagation();
        e.preventDefault();
    }

    onRadiusUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = false;
        this._resizeUndo && this._resizeUndo.end();
        document.removeEventListener("pointermove", this.onRadiusMove);
        document.removeEventListener("pointerup", this.onRadiusUp);
    }

    _lastX = 0;
    _lastY = 0;
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._lastX = e.clientX;
            this._lastY = e.clientY;
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


    onEmbedButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onEmbedButtonMoved);
        document.addEventListener("pointermove", this.onEmbedButtonMoved);
        document.removeEventListener("pointerup", this.onEmbedButtonUp);
        document.addEventListener("pointerup", this.onEmbedButtonUp);
    }



    onEmbedButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onEmbedButtonMoved);
        document.removeEventListener("pointerup", this.onEmbedButtonUp);
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

    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!this._isPointerDown) {
            return;
        }

        let dX = 0, dY = 0, dW = 0, dH = 0;

        let moveX = e.clientX - this._lastX; // e.movementX;
        let moveY = e.clientY - this._lastY; // e.movementY;
        this._lastX = e.clientX;
        this._lastY = e.clientY;

        switch (this._resizing) {
            case "":
                break;
            case "documentDecorations-topLeftResizer":
                dX = -1;
                dY = -1;
                dW = -moveX;
                dH = -moveY;
                break;
            case "documentDecorations-topRightResizer":
                dW = moveX;
                dY = -1;
                dH = -moveY;
                break;
            case "documentDecorations-topResizer":
                dY = -1;
                dH = -moveY;
                break;
            case "documentDecorations-bottomLeftResizer":
                dX = -1;
                dW = -moveX;
                dH = moveY;
                break;
            case "documentDecorations-bottomRightResizer":
                dW = moveX;
                dH = moveY;
                break;
            case "documentDecorations-bottomResizer":
                dH = moveY;
                break;
            case "documentDecorations-leftResizer":
                dX = -1;
                dW = -moveX;
                break;
            case "documentDecorations-rightResizer":
                dW = moveX;
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
                    <input ref={this._keyinput} className="title" type="text" name="dynbox" value={this._title} onBlur={this.titleBlur} onChange={this.titleChanged} onKeyPress={this.titleEntered} /> :
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
                    <DocumentButtonBar views={SelectionManager.SelectedDocuments()} />
                </div>
            </div >
        </div>
        );
    }
}