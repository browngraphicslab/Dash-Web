import { library } from '@fortawesome/fontawesome-svg-core';
import { faLink } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import { listSpec } from "../../new_fields/Schema";
import { Cast, NumCast, StrCast } from "../../new_fields/Types";
import { emptyFunction, Utils } from "../../Utils";
import { Docs } from "../documents/Documents";
import { DocumentManager } from "../util/DocumentManager";
import { DragLinksAsDocuments, DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import { MINIMIZED_ICON_SIZE } from "../views/globalCssVariables.scss";
import { CollectionView } from "./collections/CollectionView";
import './DocumentDecorations.scss';
import { DocumentView, PositionDocument } from "./nodes/DocumentView";
import { FieldView } from "./nodes/FieldView";
import { FormattedTextBox } from "./nodes/FormattedTextBox";
import { IconBox } from "./nodes/IconBox";
import { LinkMenu } from "./nodes/LinkMenu";
import { TemplateMenu } from "./TemplateMenu";
import { Template, Templates } from "./Templates";
import React = require("react");
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

library.add(faLink);

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
    private _downX = 0;
    private _downY = 0;
    private _iconDoc?: Doc = undefined;
    @observable private _minimizedX = 0;
    @observable private _minimizedY = 0;
    @observable private _title: string = "";
    @observable private _edtingTitle = false;
    @observable private _fieldKey = "title";
    @observable private _hidden = false;
    @observable private _opacity = 1;
    @observable private _removeIcon = false;
    @observable public Interacting = false;

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
            }
            else {
                if (SelectionManager.SelectedDocuments().length > 0) {
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

    @computed
    get Bounds(): { x: number, y: number, b: number, r: number } {
        return SelectionManager.SelectedDocuments().reduce((bounds, documentView) => {
            if (documentView.props.isTopMost) {
                return bounds;
            }
            let transform = (documentView.props.ScreenToLocalTransform().scale(documentView.props.ContentScaling())).inverse();
            var [sptX, sptY] = transform.transformPoint(0, 0);
            let [bptX, bptY] = transform.transformPoint(documentView.props.PanelWidth(), documentView.props.PanelHeight());
            return {
                x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
            };
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
    }

    onBackgroundDown = (e: React.PointerEvent): void => {
        document.removeEventListener("pointermove", this.onBackgroundMove);
        document.removeEventListener("pointerup", this.onBackgroundUp);
        document.addEventListener("pointermove", this.onBackgroundMove);
        document.addEventListener("pointerup", this.onBackgroundUp);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onBackgroundMove = (e: PointerEvent): void => {
        let dragDocView = SelectionManager.SelectedDocuments()[0];
        const [left, top] = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).inverse().transformPoint(0, 0);
        const [xoff, yoff] = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).transformDirection(e.x - left, e.y - top);
        let dragData = new DragManager.DocumentDragData(SelectionManager.SelectedDocuments().map(dv => dv.props.Document));
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
    onCloseUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            SelectionManager.SelectedDocuments().map(dv => dv.props.removeDocument && dv.props.removeDocument(dv.props.Document));
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
        let iconDoc = Docs.IconDocument(layoutString);
        iconDoc.isButton = true;
        iconDoc.proto!.title = selected.length > 1 ? "-multiple-.icon" : StrCast(doc.title) + ".icon";
        iconDoc.labelField = selected.length > 1 ? undefined : this._fieldKey;
        //iconDoc.proto![this._fieldKey] = selected.length > 1 ? "collection" : undefined;
        iconDoc.proto!.isMinimized = false;
        iconDoc.width = Number(MINIMIZED_ICON_SIZE);
        iconDoc.height = Number(MINIMIZED_ICON_SIZE);
        iconDoc.x = NumCast(doc.x);
        iconDoc.y = NumCast(doc.y) - 24;
        iconDoc.maximizedDocs = new List<Doc>(selected.map(s => s.props.Document.proto!));
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
        let zoom = NumCast(selView.props.Document.zoomBasis, 1);
        let where = (selView.props.ScreenToLocalTransform()).scale(selView.props.ContentScaling()).scale(1 / zoom).
            transformPoint(this._minimizedX - 12, this._minimizedY - 12);
        iconDoc.x = where[0] + NumCast(selView.props.Document.x);
        iconDoc.y = where[1] + NumCast(selView.props.Document.y);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._isPointerDown = true;
            this._resizing = e.currentTarget.id;
            this.Interacting = true;
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
    onLinkerButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkerButtonMoved);
        document.removeEventListener("pointerup", this.onLinkerButtonUp);
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
            DragManager.StartLinkDrag(this._linkerButton.current, dragData, e.pageX, e.pageY, {
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

        runInAction(() => FormattedTextBox.InputBoxOverlay = undefined);
        SelectionManager.SelectedDocuments().forEach(element => {
            const rect = element.ContentDiv ? element.ContentDiv.getBoundingClientRect() : new DOMRect();

            if (rect.width !== 0 && (dX != 0 || dY != 0 || dW != 0 || dH != 0)) {
                let doc = PositionDocument(element.props.Document);
                let docHeightBefore = doc.height;
                let nwidth = doc.nativeWidth || 0;
                let nheight = doc.nativeHeight || 0;
                let zoomBasis = NumCast(doc.zoomBasis, 1);
                let width = (doc.width || 0) / zoomBasis;
                let height = (doc.height || (nheight / nwidth * width)) / zoomBasis;
                let scale = width / rect.width;
                let actualdW = Math.max(width + (dW * scale), 20);
                let actualdH = Math.max(height + (dH * scale), 20);
                doc.x = (doc.x || 0) + dX * (actualdW - width);
                doc.y = (doc.y || 0) + dY * (actualdH - height);
                if (nwidth > 0 && nheight > 0) {
                    if (Math.abs(dW) > Math.abs(dH)) {
                        doc.zoomBasis = zoomBasis * width / actualdW;
                    }
                    else {
                        doc.zoomBasis = zoomBasis * height / actualdH;
                    }
                } else {
                    doc.width = zoomBasis * actualdW;
                    if (docHeightBefore === doc.height) doc.height = zoomBasis * actualdH;
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
            let linkToSize = Cast(selFirst.props.Document.linkedToDocs, listSpec(Doc), []).length;
            let linkFromSize = Cast(selFirst.props.Document.linkedFromDocs, listSpec(Doc), []).length;
            let linkCount = linkToSize + linkFromSize;
            linkButton = (<Flyout
                anchorPoint={anchorPoints.RIGHT_TOP}
                content={<LinkMenu docView={selFirst}
                    changeFlyout={this.changeFlyoutContent} />}>
                <div className={"linkButton-" + (linkCount ? "nonempty" : "empty")} onPointerDown={this.onLinkButtonDown} >{linkCount}</div>
            </Flyout >);
        }

        let templates: Map<Template, boolean> = new Map();
        Array.from(Object.values(Templates.TemplateList)).map(template => {
            let sorted = SelectionManager.ViewsSortedVertically().slice().sort((doc1, doc2) => {
                if (NumCast(doc1.props.Document.x) > NumCast(doc2.props.Document.x)) return 1;
                if (NumCast(doc1.props.Document.x) < NumCast(doc2.props.Document.x)) return -1;
                return 0;
            });
            let docTemps = sorted.reduce((res: string[], doc: DocumentView, i) => {
                let temps = doc.props.Document.templates;
                if (temps instanceof List) {
                    temps.map(temp => {
                        if (temp !== Templates.Bullet.Layout || i === 0) {
                            res.push(temp);
                        }
                    });
                }
                return res;
            }, [] as string[]);
            let checked = false;
            docTemps.forEach(temp => {
                if (template.Layout === temp) {
                    checked = true;
                }
            });
            templates.set(template, checked);
        });

        return (<div className="documentDecorations">
            <div className="documentDecorations-background" style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2,
                pointerEvents: this.Interacting ? "none" : "all",
                zIndex: SelectionManager.SelectedDocuments().length > 1 ? 1000 : 0,
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
                <div className="documentDecorations-closeButton" onPointerDown={this.onCloseDown}>X</div>
                <div id="documentDecorations-topLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-leftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-centerCont"></div>
                <div id="documentDecorations-rightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div className="link-button-container">
                    <div className="linkButtonWrapper">
                        <div title="View Links" className="linkFlyout" ref={this._linkButton}> {linkButton}  </div>
                    </div>
                    <div className="linkButtonWrapper">
                        <div title="Drag Link" className="linkButton-linker" ref={this._linkerButton} onPointerDown={this.onLinkerButtonDown}>
                            <FontAwesomeIcon className="fa-icon-link" icon="link" size="sm" />
                        </div>
                    </div>
                    <TemplateMenu docs={SelectionManager.ViewsSortedVertically()} templates={templates} />
                </div>
            </div >
        </div>
        );
    }
}