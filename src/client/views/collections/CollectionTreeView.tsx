import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { DataSym, Doc, DocListCast, HeightSym, Opt, WidthSym } from '../../../fields/Doc';
import { Id } from '../../../fields/FieldSymbols';
import { List } from '../../../fields/List';
import { Document } from '../../../fields/Schema';
import { ScriptField } from '../../../fields/ScriptField';
import { BoolCast, Cast, NumCast, ScriptCast, StrCast } from '../../../fields/Types';
import { TraceMobx } from '../../../fields/util';
import { returnEmptyDoclist, returnEmptyFilter, returnFalse, returnTrue, Utils } from '../../../Utils';
import { DocUtils } from '../../documents/Documents';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager, dropActionType } from "../../util/DragManager";
import { SelectionManager } from '../../util/SelectionManager';
import { SnappingManager } from '../../util/SnappingManager';
import { undoBatch, UndoManager } from '../../util/UndoManager';
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { EditableView } from "../EditableView";
import { DocumentView } from '../nodes/DocumentView';
import { FormattedTextBox } from '../nodes/formattedText/FormattedTextBox';
import { StyleProp } from '../StyleProvider';
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionTreeView.scss";
import { TreeView } from "./TreeView";
import React = require("react");

export type collectionTreeViewProps = {
    treeViewExpandedView?: "fields" | "layout" | "links" | "data";
    treeViewOpen?: boolean;
    treeViewHideTitle?: boolean;
    treeViewHideHeaderFields?: boolean;
    treeViewSkipFields?: string[]; // prevents specific fields from being displayed (see LinkBox)
    onCheckedClick?: () => ScriptField;
    onChildClick?: () => ScriptField;
};

@observer
export class CollectionTreeView extends CollectionSubView<Document, Partial<collectionTreeViewProps>>(Document) {
    private treedropDisposer?: DragManager.DragDropDisposer;
    private _mainEle?: HTMLDivElement;
    MainEle = () => this._mainEle;
    @computed get doc() { return this.props.Document; }
    @computed get dataDoc() { return this.props.DataDoc || this.doc; }
    @computed get treeViewtruncateTitleWidth() { return NumCast(this.doc.treeViewTruncateTitleWidth, this.panelWidth()); }
    @computed get treeChildren() { return this.props.childDocuments || this.childDocs; }
    @computed get outlineMode() { return this.doc.treeViewType === "outline"; }
    @computed get fileSysMode() { return this.doc.treeViewType === "fileSystem"; }

    componentWillUnmount() {
        super.componentWillUnmount();
        this.treedropDisposer?.();
    }

    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this.treedropDisposer?.();
        if (this._mainEle = ele) this.treedropDisposer = DragManager.MakeDropTarget(ele, this.onInternalDrop.bind(this), this.doc, this.onInternalPreDrop.bind(this));
    }

    protected onInternalPreDrop = (e: Event, de: DragManager.DropEvent, targetAction: dropActionType) => {
        const dragData = de.complete.docDragData;
        if (dragData) {
            const isInTree = () => dragData.draggedDocuments.some(d => d.context === this.doc && this.childDocs.includes(d));
            dragData.dropAction = targetAction && !isInTree() ? targetAction : this.doc === dragData?.treeViewDoc ? "same" : dragData.dropAction;
        }
    }

    @action
    remove = (doc: Doc | Doc[]): boolean => {
        const docs = doc instanceof Doc ? [doc] : doc;
        const targetDataDoc = this.doc[DataSym];
        const value = DocListCast(targetDataDoc[this.props.fieldKey]);
        const result = value.filter(v => !docs.includes(v));
        SelectionManager.DeselectAll();
        if (result.length !== value.length) {
            const ind = targetDataDoc[this.props.fieldKey].indexOf(doc);
            const prev = ind && targetDataDoc[this.props.fieldKey][ind - 1];
            targetDataDoc[this.props.fieldKey] = new List<Doc>(result);
            if (ind > 0) {
                FormattedTextBox.SelectOnLoad = prev[Id];
                const prevView = DocumentManager.Instance.getDocumentView(prev, this.props.CollectionView);
                prevView?.select(false);
            }
            return true;
        }
        return false;
    }

    @action
    addDoc = (docs: Doc | Doc[], relativeTo: Opt<Doc>, before?: boolean): boolean => {
        const doAddDoc = (doc: Doc | Doc[]) =>
            (doc instanceof Doc ? [doc] : doc).reduce((flg, doc) => {
                const res = flg && Doc.AddDocToList(this.doc[DataSym], this.props.fieldKey, doc, relativeTo, before);
                res && (doc.context = this.props.Document);
                return res;
            }, true);
        if (this.doc.resolvedDataDoc instanceof Promise) return false;
        return relativeTo === undefined ? this.props.addDocument?.(docs) || false : doAddDoc(docs);
    }
    onContextMenu = (e: React.MouseEvent): void => {
        // need to test if propagation has stopped because GoldenLayout forces a parallel react hierarchy to be created for its top-level layout
        if (!Doc.UserDoc().noviceMode) {
            const layoutItems: ContextMenuProps[] = [];
            layoutItems.push({ description: "Make tree state " + (this.doc.treeViewOpenIsTransient ? "persistent" : "transient"), event: () => this.doc.treeViewOpenIsTransient = !this.doc.treeViewOpenIsTransient, icon: "paint-brush" });
            layoutItems.push({ description: (this.doc.treeViewHideHeaderFields ? "Show" : "Hide") + " Header Fields", event: () => this.doc.treeViewHideHeaderFields = !this.doc.treeViewHideHeaderFields, icon: "paint-brush" });
            layoutItems.push({ description: (this.doc.treeViewHideTitle ? "Show" : "Hide") + " Title", event: () => this.doc.treeViewHideTitle = !this.doc.treeViewHideTitle, icon: "paint-brush" });
            ContextMenu.Instance.addItem({ description: "Options...", subitems: layoutItems, icon: "eye" });
            const existingOnClick = ContextMenu.Instance.findByDescription("OnClick...");
            const onClicks: ContextMenuProps[] = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
            onClicks.push({ description: "Edit onChecked Script", event: () => UndoManager.RunInBatch(() => DocUtils.makeCustomViewClicked(this.doc, undefined, "onCheckedClick"), "edit onCheckedClick"), icon: "edit" });
            !existingOnClick && ContextMenu.Instance.addItem({ description: "OnClick...", noexpand: true, subitems: onClicks, icon: "mouse-pointer" });
        }
    }
    onTreeDrop = (e: React.DragEvent) => this.onExternalDrop(e, {});

    @undoBatch
    makeTextCollection = (childDocs: Doc[]) => {
        this.addDoc(TreeView.makeTextBullet(), childDocs.length ? childDocs[0] : undefined, true);
    }

    editableTitle = (childDocs: Doc[]) => {
        return !this.dataDoc ? (null) :
            <EditableView
                contents={this.dataDoc.title}
                display={"block"}
                maxHeight={72}
                height={"auto"}
                GetValue={() => StrCast(this.dataDoc.title)}
                SetValue={undoBatch((value: string, shift: boolean, enter: boolean) => {
                    if (enter && this.props.Document.treeViewType === "outline") this.makeTextCollection(childDocs);
                    this.dataDoc.title = value;
                    return true;
                })} />;
    }

    documentTitle = (childDocs: Doc[]) => {
        return <div style={{ display: "inline-block", width: "100%", height: this.documentTitleHeight() }} key={this.doc[Id]}
            onKeyDown={e => {
                e.stopPropagation();
                e.key === "Enter" && this.makeTextCollection(childDocs);
            }}>
            <DocumentView
                Document={this.doc}
                DataDoc={undefined}
                LayoutTemplateString={FormattedTextBox.LayoutString("text")}
                renderDepth={this.props.renderDepth + 1}
                isContentActive={this.isContentActive}
                rootSelected={returnTrue}
                docViewPath={this.props.docViewPath}
                styleProvider={this.props.styleProvider}
                layerProvider={this.props.layerProvider}
                PanelWidth={this.documentTitleWidth}
                PanelHeight={this.documentTitleHeight}
                NativeWidth={this.documentTitleWidth}
                NativeHeight={this.documentTitleHeight}
                focus={this.props.focus}
                ScreenToLocalTransform={this.titleTransform}
                docFilters={returnEmptyFilter}
                docRangeFilters={returnEmptyFilter}
                searchFilterDocs={returnEmptyDoclist}
                ContainingCollectionDoc={this.doc}
                ContainingCollectionView={this.props.CollectionView}
                addDocument={this.props.addDocument}
                moveDocument={returnFalse}
                removeDocument={returnFalse}
                whenChildContentsActiveChanged={this.props.whenChildContentsActiveChanged}
                addDocTab={this.props.addDocTab}
                pinToPres={this.props.pinToPres}
                bringToFront={returnFalse}
            />
        </div>;
    }
    @computed get treeViewElements() {
        TraceMobx();
        const dropAction = StrCast(this.doc.childDropAction) as dropActionType;
        const addDoc = (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => this.addDoc(doc, relativeTo, before);
        const moveDoc = (d: Doc | Doc[], target: Doc | undefined, addDoc: (doc: Doc | Doc[]) => boolean) => this.props.moveDocument?.(d, target, addDoc) || false;
        return TreeView.GetChildElements(
            this.treeChildren,
            this,
            this,
            this.doc,
            this.props.DataDoc,
            this.props.ContainingCollectionDoc,
            undefined,
            addDoc,
            this.remove,
            moveDoc,
            dropAction,
            this.props.addDocTab,
            this.props.styleProvider,
            this.props.ScreenToLocalTransform,
            this.props.isContentActive,
            this.panelWidth,
            this.props.renderDepth,
            () => this.props.treeViewHideHeaderFields || BoolCast(this.doc.treeViewHideHeaderFields),
            [],
            this.props.onCheckedClick,
            this.onChildClick,
            this.props.treeViewSkipFields,
            true,
            this.props.whenChildContentsActiveChanged,
            this.props.dontRegisterView || Cast(this.props.Document.childDontRegisterViews, "boolean", null));
    }
    @computed get titleBar() {
        const hideTitle = this.props.treeViewHideTitle || this.doc.treeViewHideTitle;
        return hideTitle ? (null) : (this.doc.treeViewType === "outline" ? this.documentTitle : this.editableTitle)(this.treeChildren);
    }

    @computed get renderClearButton() {
        return !this.doc.treeViewShowClearButton ? (null) : <div key="toolbar">
            <button className="toolbar-button round-button" title="Empty" onClick={undoBatch(action(() => Doc.GetProto(this.doc)[this.props.fieldKey] = undefined))}>
                <FontAwesomeIcon icon={"trash"} size="sm" />
            </button>
        </div >;
    }

    paddingX = () => NumCast(this.doc._xPadding, 15);
    documentTitleWidth = () => Math.min(this.layoutDoc?.[WidthSym](), this.panelWidth());
    documentTitleHeight = () => Math.min(this.layoutDoc?.[HeightSym](), (StrCast(this.layoutDoc?._fontSize) ? Number(StrCast(this.layoutDoc?._fontSize, "32px").replace("px", "")) : NumCast(this.layoutDoc?._fontSize)) * 2);
    titleTransform = () => this.props.ScreenToLocalTransform().translate(-NumCast(this.doc._xPadding, 10), -NumCast(this.doc._yPadding, 20));
    truncateTitleWidth = () => this.treeViewtruncateTitleWidth;
    onChildClick = () => this.props.onChildClick?.() || ScriptCast(this.doc.onChildClick);
    panelWidth = () => this.props.PanelWidth() - 2 * this.paddingX();
    isContentActive = () => this.props.isContentActive() || this.props.isSelected();
    render() {
        TraceMobx();
        const background = () => this.props.styleProvider?.(this.doc, this.props, StyleProp.BackgroundColor);
        const paddingTop = () => `${NumCast(this.doc._yPadding, 20)}px`;
        const pointerEvents = () => !this.props.isContentActive() && !SnappingManager.GetIsDragging() ? "none" : undefined;

        return !(this.doc instanceof Doc) || !this.treeChildren ? (null) :
            <div className="collectionTreeView-container" onContextMenu={this.onContextMenu}>
                <div className="collectionTreeView-dropTarget"
                    style={{ background: background(), paddingLeft: `${this.paddingX()}px`, paddingRight: `${this.paddingX()}px`, paddingTop: paddingTop(), pointerEvents: pointerEvents() }}
                    onWheel={e => e.stopPropagation()}
                    onDrop={this.onTreeDrop}
                    ref={this.createTreeDropTarget}>
                    {this.titleBar}
                    {this.renderClearButton}
                    <ul className="no-indent">
                        {this.treeViewElements}
                    </ul>
                </div >
            </div>;
    }
}