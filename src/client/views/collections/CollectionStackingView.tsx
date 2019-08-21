import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CursorProperty } from "csstype";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import Switch from 'rc-switch';
import { Doc, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import { BoolCast, Cast, NumCast, StrCast, ScriptCast } from "../../../new_fields/Types";
import { emptyFunction, Utils, numberRange } from "../../../Utils";
import { DocumentType } from "../../documents/DocumentTypes";
import { DragManager } from "../../util/DragManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { EditableView } from "../EditableView";
import { CollectionSchemaPreview } from "./CollectionSchemaView";
import "./CollectionStackingView.scss";
import { CollectionStackingViewFieldColumn } from "./CollectionStackingViewFieldColumn";
import { CollectionSubView } from "./CollectionSubView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ScriptBox } from "../ScriptBox";

@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {
    _masonryGridRef: HTMLDivElement | null = null;
    _draggerRef = React.createRef<HTMLDivElement>();
    _heightDisposer?: IReactionDisposer;
    _childLayoutDisposer?: IReactionDisposer;
    _sectionFilterDisposer?: IReactionDisposer;
    _docXfs: any[] = [];
    _columnStart: number = 0;
    @observable private cursor: CursorProperty = "grab";
    @computed get sectionHeaders() { return Cast(this.props.Document.sectionHeaders, listSpec(SchemaHeaderField)); }
    @computed get sectionFilter() { return StrCast(this.props.Document.sectionFilter); }
    @computed get filteredChildren() { return this.childDocs.filter(d => !d.isMinimized); }
    @computed get xMargin() { return NumCast(this.props.Document.xMargin, 2 * this.gridGap); }
    @computed get yMargin() { return NumCast(this.props.Document.yMargin, 2 * this.gridGap); }
    @computed get gridGap() { return NumCast(this.props.Document.gridGap, 10); }
    @computed get isStackingView() { return BoolCast(this.props.Document.singleColumn, true); }
    @computed get numGroupColumns() { return this.isStackingView ? Math.max(1, this.Sections.size + (this.showAddAGroup ? 1 : 0)) : 1; }
    @computed get showAddAGroup() { return (this.sectionFilter && (this.props.CollectionView.props.Document.chromeStatus !== 'view-mode' && this.props.CollectionView.props.Document.chromeStatus !== 'disabled')); }
    @computed get columnWidth() {
        return Math.min(this.props.PanelWidth() / (this.props as any).ContentScaling() - 2 * this.xMargin,
            this.isStackingView ? Number.MAX_VALUE : NumCast(this.props.Document.columnWidth, 250));
    }

    childDocHeight(child: Doc) { return this.getDocHeight(Doc.GetLayoutDataDocPair(this.props.Document, this.props.DataDoc, this.props.fieldKey, child).layout); }

    get layoutDoc() {
        // if this document's layout field contains a document (ie, a rendering template), then we will use that
        // to determine the render JSX string, otherwise the layout field should directly contain a JSX layout string.
        return this.props.Document.layout instanceof Doc ? this.props.Document.layout : this.props.Document;
    }

    get Sections() {
        if (!this.sectionFilter || this.sectionHeaders instanceof Promise) return new Map<SchemaHeaderField, Doc[]>();

        if (this.sectionHeaders === undefined) {
            setTimeout(() => this.props.Document.sectionHeaders = new List<SchemaHeaderField>(), 0);
            return new Map<SchemaHeaderField, Doc[]>();
        }
        const sectionHeaders = this.sectionHeaders;
        let fields = new Map<SchemaHeaderField, Doc[]>(sectionHeaders.map(sh => [sh, []] as [SchemaHeaderField, []]));
        this.filteredChildren.map(d => {
            let sectionValue = (d[this.sectionFilter] ? d[this.sectionFilter] : `NO ${this.sectionFilter.toUpperCase()} VALUE`) as object;
            // the next five lines ensures that floating point rounding errors don't create more than one section -syip
            let parsed = parseInt(sectionValue.toString());
            let castedSectionValue = !isNaN(parsed) ? parsed : sectionValue;

            // look for if header exists already
            let existingHeader = sectionHeaders.find(sh => sh.heading === (castedSectionValue ? castedSectionValue.toString() : `NO ${this.sectionFilter.toUpperCase()} VALUE`));
            if (existingHeader) {
                fields.get(existingHeader)!.push(d);
            }
            else {
                let newSchemaHeader = new SchemaHeaderField(castedSectionValue ? castedSectionValue.toString() : `NO ${this.sectionFilter.toUpperCase()} VALUE`);
                fields.set(newSchemaHeader, [d]);
                sectionHeaders.push(newSchemaHeader);
            }
        });
        return fields;
    }

    componentDidMount() {
        this._childLayoutDisposer = reaction(() => [this.childDocs, Cast(this.props.Document.childLayout, Doc)],
            async (args) => args[1] instanceof Doc &&
                this.childDocs.map(async doc => !Doc.AreProtosEqual(args[1] as Doc, (await doc).layout as Doc) && Doc.ApplyTemplateTo(args[1] as Doc, (await doc), undefined)));

        // is there any reason this needs to exist? -syip.  yes, it handles autoHeight for stacking views (masonry isn't yet supported).
        this._heightDisposer = reaction(() => {
            if (this.isStackingView && BoolCast(this.props.Document.autoHeight)) {
                let sectionsList = Array.from(this.Sections.size ? this.Sections.values() : [this.filteredChildren]);
                return this.props.ContentScaling() * sectionsList.reduce((maxHght, s) => Math.max(maxHght,
                    (this.Sections.size ? 50 : 0) + s.reduce((height, d, i) => height + this.childDocHeight(d) + (i === s.length - 1 ? this.yMargin : this.gridGap), this.yMargin)
                ), 0);
            }
            return -1;
        },
            (hgt: number) => {
                let doc = hgt === -1 ? undefined : this.props.DataDoc && this.props.DataDoc.layout === this.layoutDoc ? this.props.DataDoc : this.layoutDoc;
                doc && (doc.height = hgt);
            },
            { fireImmediately: true }
        );

        // reset section headers when a new filter is inputted
        this._sectionFilterDisposer = reaction(
            () => this.sectionFilter,
            () => this.props.Document.sectionHeaders = new List()
        );
    }
    componentWillUnmount() {
        this._childLayoutDisposer && this._childLayoutDisposer();
        this._heightDisposer && this._heightDisposer();
        this._sectionFilterDisposer && this._sectionFilterDisposer();
    }

    @action
    moveDocument = (doc: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean): boolean => {
        return this.props.removeDocument(doc) && addDocument(doc);
    }
    createRef = (ele: HTMLDivElement | null) => {
        this._masonryGridRef = ele;
        this.createDropTarget(ele!);
    }

    overlays = (doc: Doc) => {
        return doc.type === DocumentType.IMG || doc.type === DocumentType.VID ? { title: StrCast(this.props.Document.showTitles), caption: StrCast(this.props.Document.showCaptions) } : {};
    }

    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }
    @computed get onClickHandler() { return this.props.onClick ? this.props.onClick : ScriptCast(this.Document.onChildClick); }

    getDisplayDoc(layoutDoc: Doc, dataDoc: Doc | undefined, dxf: () => Transform, width: () => number) {
        let height = () => this.getDocHeight(layoutDoc);
        let finalDxf = () => dxf().scale(this.columnWidth / layoutDoc[WidthSym]());
        return <CollectionSchemaPreview
            Document={layoutDoc}
            DataDocument={dataDoc}
            showOverlays={this.overlays}
            renderDepth={this.props.renderDepth}
            fitToBox={this.props.fitToBox}
            onClick={layoutDoc.isTemplate ? this.onClickHandler : this.onChildClickHandler}
            width={width}
            height={height}
            getTransform={finalDxf}
            CollectionView={this.props.CollectionView}
            addDocument={this.props.addDocument}
            moveDocument={this.props.moveDocument}
            removeDocument={this.props.removeDocument}
            active={this.props.active}
            whenActiveChanged={this.props.whenActiveChanged}
            addDocTab={this.props.addDocTab}
            pinToPres={this.props.pinToPres}
            setPreviewScript={emptyFunction}
            previewScript={undefined}>
        </CollectionSchemaPreview>;
    }
    getDocHeight(d?: Doc) {
        if (!d) return 0;
        let nw = NumCast(d.nativeWidth);
        let nh = NumCast(d.nativeHeight);
        if (!d.ignoreAspect && nw && nh) {
            let aspect = nw && nh ? nh / nw : 1;
            let wid = this.columnWidth / (this.isStackingView ? this.numGroupColumns : 1);
            if (!(d.nativeWidth && !d.ignoreAspect && this.props.Document.fillColumn)) wid = Math.min(d[WidthSym](), wid);
            return wid * aspect;
        }
        return d[HeightSym]();
    }

    columnDividerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        runInAction(() => this.cursor = "grabbing");
        document.addEventListener("pointermove", this.onDividerMove);
        document.addEventListener('pointerup', this.onDividerUp);
        this._columnStart = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY)[0];
    }
    @action
    onDividerMove = (e: PointerEvent): void => {
        let dragPos = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY)[0];
        let delta = dragPos - this._columnStart;
        this._columnStart = dragPos;
        this.layoutDoc.columnWidth = this.columnWidth + delta;
    }

    @action
    onDividerUp = (e: PointerEvent): void => {
        runInAction(() => this.cursor = "grab");
        document.removeEventListener("pointermove", this.onDividerMove);
        document.removeEventListener('pointerup', this.onDividerUp);
    }

    @computed get columnDragger() {
        return <div className="collectionStackingView-columnDragger" onPointerDown={this.columnDividerDown} ref={this._draggerRef} style={{ cursor: this.cursor, left: `${this.columnWidth + this.xMargin}px` }} >
            <FontAwesomeIcon icon={"arrows-alt-h"} />
        </div>;
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        let where = [de.x, de.y];
        let targInd = -1;
        if (de.data instanceof DragManager.DocumentDragData) {
            this._docXfs.map((cd, i) => {
                let pos = cd.dxf().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
                let pos1 = cd.dxf().inverse().transformPoint(cd.width(), cd.height());
                if (where[0] > pos[0] && where[0] < pos1[0] && where[1] > pos[1] && where[1] < pos1[1]) {
                    targInd = i;
                }
            });
        }
        if (super.drop(e, de)) {
            let newDoc = de.data.droppedDocuments[0];
            let docs = this.childDocList;
            if (docs) {
                if (targInd === -1) targInd = docs.length;
                else targInd = docs.indexOf(this.filteredChildren[targInd]);
                let srcInd = docs.indexOf(newDoc);
                docs.splice(srcInd, 1);
                docs.splice(targInd > srcInd ? targInd - 1 : targInd, 0, newDoc);
            }
        }
        return false;
    }
    @undoBatch
    @action
    onDrop = (e: React.DragEvent): void => {
        let where = [e.clientX, e.clientY];
        let targInd = -1;
        this._docXfs.map((cd, i) => {
            let pos = cd.dxf().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
            let pos1 = cd.dxf().inverse().transformPoint(cd.width(), cd.height());
            if (where[0] > pos[0] && where[0] < pos1[0] && where[1] > pos[1] && where[1] < pos1[1]) {
                targInd = i;
            }
        });
        super.onDrop(e, {}, () => {
            if (targInd !== -1) {
                let newDoc = this.childDocs[this.childDocs.length - 1];
                let docs = this.childDocList;
                if (docs) {
                    docs.splice(docs.length - 1, 1);
                    docs.splice(targInd, 0, newDoc);
                }
            }
        });
    }
    headings = () => Array.from(this.Sections.keys());
    sectionStacking = (heading: SchemaHeaderField | undefined, docList: Doc[]) => {
        let key = this.sectionFilter;
        let type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined = undefined;
        let types = docList.length ? docList.map(d => typeof d[key]) : this.childDocs.map(d => typeof d[key]);
        if (types.map((i, idx) => types.indexOf(i) === idx).length === 1) {
            type = types[0];
        }
        let cols = () => this.isStackingView ? 1 : Math.max(1, Math.min(this.filteredChildren.length,
            Math.floor((this.props.PanelWidth() - 2 * this.xMargin) / (this.columnWidth + this.gridGap))));
        return <CollectionStackingViewFieldColumn
            key={heading ? heading.heading : ""}
            cols={cols}
            headings={this.headings}
            heading={heading ? heading.heading : ""}
            headingObject={heading}
            docList={docList}
            parent={this}
            type={type}
            createDropTarget={this.createDropTarget}
            screenToLocalTransform={this.props.ScreenToLocalTransform}
        />;
    }

    getDocTransform(doc: Doc, dref: HTMLDivElement) {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(dref);
        let outerXf = Utils.GetScreenTransform(this._masonryGridRef!);
        let offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        return this.props.ScreenToLocalTransform().
            translate(offset[0], offset[1]).
            scale(NumCast(doc.width, 1) / this.columnWidth);
    }
    masonryChildren(docs: Doc[]) {
        this._docXfs.length = 0;
        return docs.map((d, i) => {
            let dref = React.createRef<HTMLDivElement>();
            let layoutDoc = Doc.expandTemplateLayout(d, this.props.DataDoc);
            let width = () => (d.nativeWidth && !d.ignoreAspect && !this.props.Document.fillColumn ? Math.min(d[WidthSym](), this.columnWidth) : this.columnWidth);/// (uniqueHeadings.length + 1);
            let height = () => this.getDocHeight(layoutDoc);
            let dxf = () => this.getDocTransform(layoutDoc, dref.current!);
            let rowSpan = Math.ceil((height() + this.gridGap) / this.gridGap);
            this._docXfs.push({ dxf: dxf, width: width, height: height });
            return <div className="collectionStackingView-masonryDoc" key={d[Id]} ref={dref} style={{ gridRowEnd: `span ${rowSpan}` }} >
                {this.getDisplayDoc(layoutDoc, d, dxf, width)}
            </div>;
        });
    }

    @observable _headingsHack: number = 1;
    sectionMasonry(heading: SchemaHeaderField | undefined, docList: Doc[]) {
        let cols = Math.max(1, Math.min(docList.length,
            Math.floor((this.props.PanelWidth() - 2 * this.xMargin) / (this.columnWidth + this.gridGap))));
        return <div key={heading ? heading.heading : "empty"} className="collectionStackingView-masonrySection">
            {!heading ? (null) :
                <div key={`${heading.heading}`} className="collectionStackingView-sectionHeader" style={{ background: heading.color }}
                    onClick={action(() => this._headingsHack++ && heading.setCollapsed(!heading.collapsed))} >
                    {heading.heading}
                </div>}
            {this._headingsHack && heading && heading.collapsed ? (null) :
                <div key={`${heading}-stack`} className={`collectionStackingView-masonryGrid`}
                    style={{
                        padding: `${this.yMargin}px ${this.xMargin}px`,
                        width: `${cols * (this.columnWidth + this.gridGap) + 2 * this.xMargin - this.gridGap}px`,
                        gridGap: this.gridGap,
                        gridTemplateColumns: numberRange(cols).reduce((list, i) => list + ` ${this.columnWidth}px`, ""),
                    }}>
                    {this.masonryChildren(docList)}
                    {this.columnDragger}
                </div>
            }
        </div>;
    }

    @action
    addGroup = (value: string) => {
        if (value && this.sectionHeaders) {
            this.sectionHeaders.push(new SchemaHeaderField(value));
            return true;
        }
        return false;
    }

    sortFunc = (a: [SchemaHeaderField, Doc[]], b: [SchemaHeaderField, Doc[]]): 1 | -1 => {
        let descending = BoolCast(this.props.Document.stackingHeadersSortDescending);
        let firstEntry = descending ? b : a;
        let secondEntry = descending ? a : b;
        return firstEntry[0].heading > secondEntry[0].heading ? 1 : -1;
    }

    onToggle = (checked: Boolean) => {
        this.props.CollectionView.props.Document.chromeStatus = checked ? "collapsed" : "view-mode";
    }

    onContextMenu = (e: React.MouseEvent): void => {
        // need to test if propagation has stopped because GoldenLayout forces a parallel react hierarchy to be created for its top-level layout
        if (!e.isPropagationStopped()) {
            let subItems: ContextMenuProps[] = [];
            subItems.push({ description: `${this.props.Document.fillColumn ? "Variable Size" : "Autosize"} Column`, event: () => this.props.Document.fillColumn = !this.props.Document.fillColumn, icon: "plus" });
            subItems.push({ description: `${this.props.Document.showTitles ? "Hide Titles" : "Show Titles"}`, event: () => this.props.Document.showTitles = !this.props.Document.showTitles ? "title" : "", icon: "plus" });
            subItems.push({ description: `${this.props.Document.showCaptions ? "Hide Captions" : "Show Captions"}`, event: () => this.props.Document.showCaptions = !this.props.Document.showCaptions ? "caption" : "", icon: "plus" });
            subItems.push({ description: "Edit onChildClick script", icon: "edit", event: () => ScriptBox.EditClickScript(this.props.Document, "onChildClick") });
            ContextMenu.Instance.addItem({ description: "Stacking Options ...", subitems: subItems, icon: "eye" });
        }
    }

    render() {
        let editableViewProps = {
            GetValue: () => "",
            SetValue: this.addGroup,
            contents: "+ ADD A GROUP"
        };
        Doc.UpdateDocumentExtensionForField(this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey);

        let sections = (this.sectionFilter ? Array.from(this.Sections.entries()).sort(this.sortFunc) : [[undefined, this.filteredChildren] as [SchemaHeaderField | undefined, Doc[]]]);
        return (
            <div className={this.isStackingView ? "collectionStackingView" : "collectionMasonryView"}
                ref={this.createRef} onDrop={this.onDrop.bind(this)} onContextMenu={this.onContextMenu} onWheel={(e: React.WheelEvent) => e.stopPropagation()} >
                {sections.map(section => this.isStackingView ? this.sectionStacking(section[0], section[1]) : this.sectionMasonry(section[0], section[1]))}
                {!this.showAddAGroup ? (null) :
                    <div key={`${this.props.Document[Id]}-addGroup`} className="collectionStackingView-addGroupButton"
                        style={{ width: this.columnWidth / this.numGroupColumns - 10, marginTop: 10 }}>
                        <EditableView {...editableViewProps} />
                    </div>}
                {this.props.CollectionView.props.Document.chromeStatus !== 'disabled' ? <Switch
                    onChange={this.onToggle}
                    onClick={this.onToggle}
                    defaultChecked={this.props.CollectionView.props.Document.chromeStatus !== 'view-mode'}
                    checkedChildren="edit"
                    unCheckedChildren="view"
                /> : null}
            </div>
        );
    }
}