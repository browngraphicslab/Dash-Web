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
import { returnEmptyDoclist, returnEmptyFilter, returnFalse, returnOne, returnTrue, Utils } from '../../../Utils';
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
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionTreeView.scss";
import { TreeView } from "./TreeView";
import React = require("react");

export type collectionTreeViewProps = {
    treeViewHideTitle?: boolean;
    treeViewHideHeaderFields?: boolean;
    treeViewSkipFields?: string[]; // prevents specific fields from being displayed (see LinkBox)
    onCheckedClick?: () => ScriptField;
    onChildClick?: () => ScriptField;
};

@observer
export class CollectionTreeView extends CollectionSubView<Document, Partial<collectionTreeViewProps>>(Document) {
    private treedropDisposer?: DragManager.DragDropDisposer;
    private _isChildActive = false;
    private _mainEle?: HTMLDivElement;
    public _uniqueId = Utils.GenerateGuid();

    @computed get doc() { TraceMobx(); return this.props.Document; }
    @computed get dataDoc() { return this.props.DataDoc || this.doc; }

    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this.treedropDisposer?.();
        if (this._mainEle = ele) this.treedropDisposer = DragManager.MakeDropTarget(ele, this.onInternalDrop.bind(this), this.doc, this.onInternalPreDrop.bind(this));
    }

    protected onInternalPreDrop = (e: Event, de: DragManager.DropEvent, targetAction: dropActionType) => {
        const dragData = de.complete.docDragData;
        if (dragData) {
            if (targetAction && !dragData.draggedDocuments.some(d => d.context === this.doc && this.childDocs.includes(d))) {
                dragData.dropAction = targetAction;
            } else dragData.dropAction = this.doc === dragData?.treeViewDoc ? "same" : dragData.dropAction;
        }
    }

    componentWillUnmount() {
        super.componentWillUnmount();
        this.treedropDisposer?.();
    }

    @undoBatch
    remove = action((doc: Doc | Doc[]): boolean => {
        const docs = doc instanceof Doc ? [doc] : doc;
        const targetDataDoc = this.doc[DataSym];
        const value = DocListCast(targetDataDoc[this.props.fieldKey]);
        const result = value.filter(v => !docs.includes(v));
        SelectionManager.DeselectAll();
        if (result.length !== value.length) {
            const ind = targetDataDoc[this.props.fieldKey].indexOf(doc);
            targetDataDoc[this.props.fieldKey] = new List<Doc>(result);
            if (ind > 0) {
                const prev = targetDataDoc[this.props.fieldKey][ind - 1];
                FormattedTextBox.SelectOnLoad = prev[Id];
                const prevView = DocumentManager.Instance.getDocumentView(prev, this.props.CollectionView);
                prevView?.select(false);
            }
            return true;
        }
        return false;
    });
    @action
    addDoc = (doc: Doc | Doc[], relativeTo: Opt<Doc>, before?: boolean): boolean => {
        const doAddDoc = (doc: Doc | Doc[]) =>
            (doc instanceof Doc ? [doc] : doc).reduce((flg, doc) =>
                flg && Doc.AddDocToList(this.doc[DataSym], this.props.fieldKey, doc, relativeTo, before, false, false, false), true);
        if (this.doc.resolvedDataDoc instanceof Promise) {
            this.doc.resolvedDataDoc.then((resolved: any) => doAddDoc(doc));
        } else if (relativeTo === undefined) {
            this.props.addDocument?.(doc);
        } else {
            doAddDoc(doc);
            (doc instanceof Doc ? [doc] : doc).forEach(d => d.context = this.props.Document);
        }
        return true;
    }
    onContextMenu = (e: React.MouseEvent): void => {
        // need to test if propagation has stopped because GoldenLayout forces a parallel react hierarchy to be created for its top-level layout
        if (!Doc.UserDoc().noviceMode) {
            const layoutItems: ContextMenuProps[] = [];
            layoutItems.push({ description: (this.doc.treeViewPreventOpen ? "Persist" : "Abandon") + "Treeview State", event: () => this.doc.treeViewPreventOpen = !this.doc.treeViewPreventOpen, icon: "paint-brush" });
            layoutItems.push({ description: (this.doc.treeViewHideHeaderFields ? "Show" : "Hide") + " Header Fields", event: () => this.doc.treeViewHideHeaderFields = !this.doc.treeViewHideHeaderFields, icon: "paint-brush" });
            layoutItems.push({ description: (this.doc.treeViewHideTitle ? "Show" : "Hide") + " Title", event: () => this.doc.treeViewHideTitle = !this.doc.treeViewHideTitle, icon: "paint-brush" });
            layoutItems.push({ description: (this.doc.treeViewHideLinkLines ? "Show" : "Hide") + " Link Lines", event: () => this.doc.treeViewHideLinkLines = !this.doc.treeViewHideLinkLines, icon: "paint-brush" });
            ContextMenu.Instance.addItem({ description: "Options...", subitems: layoutItems, icon: "eye" });
            const existingOnClick = ContextMenu.Instance.findByDescription("OnClick...");
            const onClicks: ContextMenuProps[] = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
            onClicks.push({ description: "Edit onChecked Script", event: () => UndoManager.RunInBatch(() => DocUtils.makeCustomViewClicked(this.doc, undefined, "onCheckedClick"), "edit onCheckedClick"), icon: "edit" });
            !existingOnClick && ContextMenu.Instance.addItem({ description: "OnClick...", noexpand: true, subitems: onClicks, icon: "mouse-pointer" });
        }
    }
    outerXf = () => Utils.GetScreenTransform(this._mainEle!);
    onTreeDrop = (e: React.DragEvent) => this.onExternalDrop(e, {});

    @computed get renderClearButton() {
        return !this.doc.allowClear ? (null) : <div key="toolbar">
            <button className="toolbar-button round-button" title="Empty" onClick={undoBatch(action(() => Doc.GetProto(this.doc)[this.props.fieldKey] = undefined))}>
                <FontAwesomeIcon icon={"trash"} size="sm" />
            </button>
        </div >;
    }

    @undoBatch
    makeTextCollection = action((childDocs: Doc[]) => {
        Doc.SetInPlace(this.doc, "editTitle", undefined, false);
        const bullet = TreeView.makeTextBullet();
        bullet.context = this.doc;
        this.addDoc(bullet, childDocs.length ? childDocs[0] : undefined, true);
    });

    editableTitle = (childDocs: Doc[]) => {
        return !this.dataDoc ? (null) : <EditableView
            contents={this.dataDoc.title}
            editing={false}
            display={"block"}
            maxHeight={72}
            height={"auto"}
            GetValue={() => StrCast(this.dataDoc.title)}
            SetValue={undoBatch((value: string, shift: boolean, enter: boolean) => {
                if (this.props.Document.treeViewOutlineMode && enter) {
                    this.makeTextCollection(childDocs);
                }
                return Doc.SetInPlace(this.dataDoc, "title", value, false);
            })} />;
    }


    rtfWidth = () => Math.min(this.layoutDoc?.[WidthSym](), this.props.PanelWidth() - 20);
    rtfOutlineHeight = () => Math.min(this.layoutDoc?.[HeightSym](), (StrCast(this.layoutDoc?._fontSize) ? Number(StrCast(this.layoutDoc?._fontSize, "32px").replace("px", "")) : NumCast(this.layoutDoc?._fontSize)) * 2);
    titleTransform = () => this.props.ScreenToLocalTransform().translate(-NumCast(this.doc._xPadding, 10), -NumCast(this.doc._yPadding, 20));
    documentTitle = (childDocs: Doc[]) => {
        return <div style={{ display: "inline-block", width: "100%", height: this.rtfOutlineHeight() }} key={this.doc[Id]}
            onKeyDown={e => {
                e.stopPropagation();
                e.key === "Enter" && this.makeTextCollection(childDocs);
            }}>
            <DocumentView
                Document={this.doc}
                DataDoc={undefined}
                LayoutTemplateString={FormattedTextBox.LayoutString("text")}
                renderDepth={this.props.renderDepth + 1}
                rootSelected={returnTrue}
                treeViewDoc={undefined}
                //dontRegisterView={true}
                styleProvider={this.props.styleProvider}
                PanelWidth={this.rtfWidth}
                PanelHeight={this.rtfOutlineHeight}
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
                parentActive={this.props.active}
                whenActiveChanged={this.props.whenActiveChanged}
                addDocTab={this.props.addDocTab}
                pinToPres={this.props.pinToPres}
                bringToFront={returnFalse}
                ContentScaling={returnOne}
            />
        </div>;
    }

    onChildClick = () => this.props.onChildClick?.() || ScriptCast(this.doc.onChildClick);
    whenActiveChanged = (isActive: boolean) => { this.props.whenActiveChanged(this._isChildActive = isActive); };
    active = (outsideReaction: boolean | undefined) => this.props.active(outsideReaction) || this._isChildActive;
    @computed get treeChildren() {
        TraceMobx();
        return this.props.childDocuments || this.childDocs;
    }
    @computed get treeViewElements() {
        TraceMobx();
        const dropAction = StrCast(this.doc.childDropAction) as dropActionType;
        const addDoc = (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => this.addDoc(doc, relativeTo, before);
        const moveDoc = (d: Doc | Doc[], target: Doc | undefined, addDoc: (doc: Doc | Doc[]) => boolean) => this.props.moveDocument?.(d, target, addDoc) || false;
        return TreeView.GetChildElements(this.treeChildren, this, this.doc, this.props.DataDoc, this.props.fieldKey, this.props.ContainingCollectionDoc, undefined, addDoc, this.remove,
            moveDoc, dropAction, this.props.addDocTab, this.props.pinToPres, this.props.styleProvider, this.props.ScreenToLocalTransform,
            this.outerXf, this.active, this.props.PanelWidth, this.props.ChromeHeight, this.props.renderDepth, () => this.props.treeViewHideHeaderFields || BoolCast(this.doc.treeViewHideHeaderFields),
            BoolCast(this.doc.treeViewPreventOpen), [], this.props.onCheckedClick,
            this.onChildClick, this.props.treeViewSkipFields, true, this.whenActiveChanged, this.props.dontRegisterView || Cast(this.props.Document.dontRegisterChildViews, "boolean", null));
    }
    @computed get titleBar() {
        const hideTitle = this.props.treeViewHideTitle || this.doc.treeViewHideTitle;
        return hideTitle ? (null) : (this.doc.treeViewOutlineMode ? this.documentTitle : this.editableTitle)(this.treeChildren);
    }
    render() {
        TraceMobx();
        if (!(this.doc instanceof Doc)) return (null);
        const background = this.props.styleProvider?.(this.doc, this.props, "backgroundColor");
        const paddingX = `${NumCast(this.doc._xPadding, 10)}px`;
        const paddingTop = `${NumCast(this.doc._yPadding, 20)}px`;
        const pointerEvents = !this.props.active() && !SnappingManager.GetIsDragging() && !this._isChildActive ? "none" : undefined;

        return !this.treeChildren ? (null) : (
            <div className="collectionTreeView-container" onContextMenu={this.onContextMenu}>
                <div className="collectionTreeView-dropTarget"
                    style={{ background, paddingLeft: paddingX, paddingRight: paddingX, paddingTop, pointerEvents }}
                    onWheel={(e) => this._mainEle && this._mainEle.scrollHeight > this._mainEle.clientHeight && e.stopPropagation()}
                    onDrop={this.onTreeDrop}
                    ref={this.createTreeDropTarget}>
                    {this.titleBar}
                    {this.renderClearButton}
                    <ul className="no-indent">
                        {this.treeViewElements}
                    </ul>
                </div >
            </div>
        );
    }
}