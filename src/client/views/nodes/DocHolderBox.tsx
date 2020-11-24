import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc, Field } from "../../../fields/Doc";
import { collectionSchema, documentSchema } from "../../../fields/documentSchemas";
import { makeInterface, listSpec } from "../../../fields/Schema";
import { ComputedField } from "../../../fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { TraceMobx } from "../../../fields/util";
import { emptyPath, returnFalse, returnOne, returnZero } from "../../../Utils";
import { DocumentType } from "../../documents/DocumentTypes";
import { DragManager } from "../../util/DragManager";
import { undoBatch } from "../../util/UndoManager";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";
import "./DocHolderBox.scss";
import { DocumentView } from "./DocumentView";
import { FieldView, FieldViewProps } from "./FieldView";
import React = require("react");

type DocHolderBoxSchema = makeInterface<[typeof documentSchema, typeof collectionSchema]>;
const DocHolderBoxDocument = makeInterface(documentSchema, collectionSchema);

@observer
export class DocHolderBox extends ViewBoxAnnotatableComponent<FieldViewProps, DocHolderBoxSchema>(DocHolderBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DocHolderBox, fieldKey); }
    _prevSelectionDisposer: IReactionDisposer | undefined;
    _dropDisposer?: DragManager.DragDropDisposer;
    _selections: Doc[] = [];
    _contRef = React.createRef<HTMLDivElement>();
    _curSelection = -1;
    componentDidMount() {
        this._prevSelectionDisposer = reaction(() => this.dataDoc[this.fieldKey], (data) => {
            if (data instanceof Doc && !this.isSelectionLocked()) {
                this._selections.indexOf(data) !== -1 && this._selections.splice(this._selections.indexOf(data), 1);
                this._selections.push(data);
                this._curSelection = this._selections.length - 1;
            }
        });
    }
    componentWillUnmount() {
        this._prevSelectionDisposer?.();
    }
    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.isSelectionLocked() ? "Show" : "Lock") + " Selection", event: () => this.toggleLockSelection, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.excludeCollections ? "Include" : "Exclude") + " Collections", event: () => this.layoutDoc.excludeCollections = !this.layoutDoc.excludeCollections, icon: "expand-arrows-alt" });
        funcs.push({ description: `${this.layoutDoc.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.layoutDoc.forceActive = !this.layoutDoc.forceActive, icon: "project-diagram" });
        funcs.push({ description: `Show ${this.layoutDoc.childLayoutTemplateName !== "keyValue" ? "key values" : "contents"}`, event: () => this.layoutDoc.childLayoutString = this.layoutDoc.childLayoutString ? undefined : "<KeyValueBox {...props} />", icon: "project-diagram" });

        ContextMenu.Instance.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }
    lockSelection = () => {
        this.dataDoc[this.fieldKey] = this.dataDoc[this.fieldKey];
    }
    showSelection = () => {
        this.dataDoc[this.fieldKey] = ComputedField.MakeFunction(`selectedDocs(self,this.excludeCollections,[_last_])?.[0]`);
    }
    isSelectionLocked = () => {
        const kvpstring = Field.toKeyValueString(this.dataDoc, this.fieldKey);
        return !kvpstring || kvpstring.includes("DOC");
    }
    toggleLockSelection = () => {
        !this.isSelectionLocked() ? this.lockSelection() : this.showSelection();
        return true;
    }
    prevSelection = () => {
        this.lockSelection();
        if (this._curSelection > 0) {
            this.dataDoc[this.fieldKey] = this._selections[--this._curSelection];
            return true;
        }
    }
    nextSelection = () => {
        if (this._curSelection < this._selections.length - 1 && this._selections.length) {
            this.dataDoc[this.fieldKey] = this._selections[++this._curSelection];
            return true;
        }
    }
    onPointerDown = (e: React.PointerEvent) => {
        if (this.active() && e.button === 0 && !e.ctrlKey) {
            e.stopPropagation();
        }
    }
    onLockClick = (e: React.MouseEvent) => {
        this.toggleLockSelection();
        (e.nativeEvent as any).formattedHandled = true;
        e.stopPropagation();
    }
    get xPad() { return NumCast(this.rootDoc._xPadding); }
    get yPad() { return NumCast(this.rootDoc._yPadding); }
    onClick = (e: React.MouseEvent) => {
        let hitWidget: boolean | undefined = false;
        if (this._contRef.current!.getBoundingClientRect().top + this.yPad > e.clientY) hitWidget = (() => { this.props.select(false); return true; })();
        else if (this._contRef.current!.getBoundingClientRect().bottom - this.yPad < e.clientY) hitWidget = (() => { this.props.select(false); return true; })();
        else {
            if (this._contRef.current!.getBoundingClientRect().left + this.xPad > e.clientX) hitWidget = this.prevSelection();
            if (this._contRef.current!.getBoundingClientRect().right - this.xPad < e.clientX) hitWidget = this.nextSelection();
        }
        if (hitWidget) {
            (e.nativeEvent as any).formattedHandled = true;
            e.stopPropagation();
        }
    }
    pwidth = () => this.props.PanelWidth() - 2 * this.xPad;
    pheight = () => this.props.PanelHeight() - 2 * this.yPad;
    getTransform = () => this.props.ScreenToLocalTransform().translate(-this.xPad, -this.yPad);
    isActive = (outsideReaction: boolean) => this.active(outsideReaction) || this.props.renderDepth <= 1;
    layoutTemplateDoc = () => Cast(this.layoutDoc.childLayoutTemplate, Doc, null);
    get renderContents() {
        const containedDoc = Cast(this.dataDoc[this.fieldKey], Doc, null);
        const layoutTemplate = StrCast(this.layoutDoc.childLayoutString);
        const contents = !(containedDoc instanceof Doc) ||
            Cast(containedDoc[Doc.LayoutFieldKey(containedDoc)], listSpec(Doc), null)?.includes(this.rootDoc)
            ? (null) : this.layoutDoc.childLayoutString || this.layoutTemplateDoc() ?
                <DocumentView
                    Document={containedDoc}
                    DataDoc={undefined}
                    LibraryPath={emptyPath}
                    docFilters={this.props.docFilters}
                    docRangeFilters={this.props.docRangeFilters}
                    searchFilterDocs={this.props.searchFilterDocs}
                    ContainingCollectionView={this as any} // bcz: hack!  need to pass a prop that can be used to select the container (ie, 'this') when the up selector in document decorations is clicked.  currently, the up selector allows only a containing collection to be selected
                    ContainingCollectionDoc={undefined}
                    fitToBox={true}
                    styleProvider={this.props.styleProvider}
                    LayoutTemplateString={layoutTemplate}
                    LayoutTemplate={this.layoutTemplateDoc}
                    rootSelected={this.props.isSelected}
                    addDocument={this.props.addDocument}
                    moveDocument={this.props.moveDocument}
                    removeDocument={this.props.removeDocument}
                    addDocTab={this.props.addDocTab}
                    pinToPres={this.props.pinToPres}
                    ScreenToLocalTransform={this.getTransform}
                    renderDepth={containedDoc.type !== DocumentType.DOCHOLDER && !this.props.renderDepth ? 0 : this.props.renderDepth + 1}
                    PanelWidth={this.pwidth}
                    PanelHeight={this.pheight}
                    focus={this.props.focus}
                    parentActive={this.isActive}
                    dontRegisterView={true}
                    whenActiveChanged={this.props.whenActiveChanged}
                    bringToFront={returnFalse}
                    ContentScaling={returnOne} /> :
                <ContentFittingDocumentView
                    Document={containedDoc}
                    DataDoc={undefined}
                    LibraryPath={emptyPath}
                    docFilters={this.props.docFilters}
                    docRangeFilters={this.props.docRangeFilters}
                    searchFilterDocs={this.props.searchFilterDocs}
                    ContainingCollectionView={this as any} // bcz: hack!  need to pass a prop that can be used to select the container (ie, 'this') when the up selector in document decorations is clicked.  currently, the up selector allows only a containing collection to be selected
                    ContainingCollectionDoc={undefined}
                    fitToBox={true}
                    styleProvider={this.props.styleProvider}
                    ignoreAutoHeight={true}
                    LayoutTemplateString={layoutTemplate}
                    LayoutTemplate={this.layoutTemplateDoc}
                    rootSelected={this.props.isSelected}
                    addDocument={this.props.addDocument}
                    moveDocument={this.props.moveDocument}
                    removeDocument={this.props.removeDocument}
                    addDocTab={this.props.addDocTab}
                    pinToPres={this.props.pinToPres}
                    ScreenToLocalTransform={this.getTransform}
                    renderDepth={containedDoc.type !== DocumentType.DOCHOLDER && !this.props.renderDepth ? 0 : this.props.renderDepth + 1}
                    PanelWidth={this.pwidth}
                    PanelHeight={this.pheight}
                    focus={this.props.focus}
                    parentActive={this.isActive}
                    dontRegisterView={true}
                    whenActiveChanged={this.props.whenActiveChanged}
                    bringToFront={returnFalse}
                    ContentScaling={returnOne}
                />;
        return contents;
    }
    render() {
        const containedDoc = Cast(this.dataDoc[this.fieldKey], Doc, null);
        TraceMobx();
        return !containedDoc ? (null) : <div className="documentBox-container" ref={this._contRef}
            onContextMenu={this.specificContextMenu}
            onPointerDown={this.onPointerDown} onClick={this.onClick}
            style={{
                background: this.props.styleProvider?.(containedDoc, this.props.renderDepth, "color", this.props.layerProvider),
                border: `#00000021 solid ${this.xPad}px`,
                borderTop: `#0000005e solid ${this.yPad}px`,
                borderBottom: `#0000005e solid ${this.yPad}px`,
            }}>
            {this.renderContents}
            <div className="documentBox-lock" onClick={this.onLockClick} ref={this.createDropTarget}
                style={{ marginTop: - this.yPad, background: "black" }}>
                <FontAwesomeIcon icon={this.isSelectionLocked() ? "lock" : "unlock"} size="sm" />
            </div>
        </div >;
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        const docDragData = de.complete.docDragData;
        if (docDragData?.draggedDocuments[0].type === DocumentType.FONTICON) {
            const doc = Cast(docDragData.draggedDocuments[0].dragFactory, Doc, null);
            this.layoutDoc.childLayoutTemplate = doc;
        }
    }
    protected createDropTarget = (ele: HTMLDivElement) => {
        this._dropDisposer?.();
        ele && (this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this), this.rootDoc));
    }

}
