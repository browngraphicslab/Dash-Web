import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CursorProperty } from "csstype";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { DataSym, Doc, HeightSym, WidthSym } from "../../../fields/Doc";
import { collectionSchema, documentSchema } from "../../../fields/documentSchemas";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { BoolCast, Cast, NumCast, ScriptCast, StrCast } from "../../../fields/Types";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, returnFalse, returnOne, returnVal, returnZero, setupMoveUpEvents, smoothScroll, Utils } from "../../../Utils";
import { DocUtils } from "../../documents/Documents";
import { DragManager, dropActionType } from "../../util/DragManager";
import { SnappingManager } from "../../util/SnappingManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { EditableView } from "../EditableView";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { ContentFittingDocumentView } from "../nodes/ContentFittingDocumentView";
import { DocAfterFocusFunc } from "../nodes/DocumentView";
import { CollectionMasonryViewFieldRow } from "./CollectionMasonryViewFieldRow";
import "./CollectionStackingView.scss";
import { CollectionStackingViewFieldColumn } from "./CollectionStackingViewFieldColumn";
import { CollectionSubView } from "./CollectionSubView";
import { CollectionViewType } from "./CollectionView";
const _global = (window /* browser */ || global /* node */) as any;

type StackingDocument = makeInterface<[typeof collectionSchema, typeof documentSchema]>;
const StackingDocument = makeInterface(collectionSchema, documentSchema);

export type collectionStackingViewProps = {
    chromeStatus?: string;
};

@observer
export class CollectionStackingView extends CollectionSubView<StackingDocument, Partial<collectionStackingViewProps>>(StackingDocument) {
    _masonryGridRef: HTMLDivElement | null = null;
    _draggerRef = React.createRef<HTMLDivElement>();
    _pivotFieldDisposer?: IReactionDisposer;
    _autoHeightDisposer?: IReactionDisposer;
    _docXfs: any[] = [];
    _columnStart: number = 0;
    @observable _heightMap = new Map<string, number>();
    @observable _cursor: CursorProperty = "grab";
    @observable _scroll = 0; // used to force the document decoration to update when scrolling
    @computed get chromeStatus() { return this.props.chromeStatus || StrCast(this.layoutDoc._chromeStatus); }
    @computed get columnHeaders() { return Cast(this.layoutDoc._columnHeaders, listSpec(SchemaHeaderField)); }
    @computed get pivotField() { return StrCast(this.layoutDoc._pivotField); }
    @computed get filteredChildren() { return this.childLayoutPairs.filter(pair => pair.layout instanceof Doc && !pair.layout.hidden).map(pair => pair.layout); }
    @computed get xMargin() { return NumCast(this.layoutDoc._xMargin, 2 * Math.min(this.gridGap, .05 * this.props.PanelWidth())); }
    @computed get yMargin() { return Math.max(this.layoutDoc._showTitle && !this.layoutDoc._showTitleHover ? 30 : 0, this.props.yMargin || NumCast(this.layoutDoc._yMargin, 5)); } // 2 * this.gridGap)); }
    @computed get gridGap() { return NumCast(this.layoutDoc._gridGap, 10); }
    @computed get isStackingView() { return this.layoutDoc._viewType === CollectionViewType.Stacking; }
    @computed get numGroupColumns() { return this.isStackingView ? Math.max(1, this.Sections.size + (this.showAddAGroup ? 1 : 0)) : 1; }
    @computed get showAddAGroup() { return (this.pivotField && (this.chromeStatus !== 'view-mode' && this.chromeStatus !== 'disabled')); }
    @computed get columnWidth() {
        return Math.min(this.props.PanelWidth() / this.props.ContentScaling() /* / NumCast(this.layoutDoc._viewScale, 1)*/ - 2 * this.xMargin,
            this.isStackingView ? Number.MAX_VALUE : this.layoutDoc._columnWidth === -1 ? this.props.PanelWidth() - 2 * this.xMargin : NumCast(this.layoutDoc._columnWidth, 250));
    }
    @computed get NodeWidth() { return this.props.PanelWidth() - this.gridGap; }

    constructor(props: any) {
        super(props);

        if (this.columnHeaders === undefined) {
            this.layoutDoc._columnHeaders = new List<SchemaHeaderField>();
        }
    }

    children(docs: Doc[], columns?: number) {
        TraceMobx();
        this._docXfs.length = 0;
        return docs.map((d, i) => {
            const height = () => this.getDocHeight(d);
            const width = () => this.getDocWidth(d);
            const dref = React.createRef<HTMLDivElement>();
            const dxf = () => this.getDocTransform(d, dref.current!);
            this._docXfs.push({ dxf, width, height });
            const rowSpan = Math.ceil((height() + this.gridGap) / this.gridGap);
            const style = this.isStackingView ? { width: width(), marginTop: i ? this.gridGap : 0, height: height() } : { gridRowEnd: `span ${rowSpan}` };
            return <div className={`collectionStackingView-${this.isStackingView ? "columnDoc" : "masonryDoc"}`} key={d[Id]} ref={dref} style={style} >
                {this.getDisplayDoc(d, dxf, width)}
            </div>;
        });
    }
    @action
    setDocHeight = (key: string, sectionHeight: number) => {
        this._heightMap.set(key, sectionHeight);
    }

    get Sections() {
        if (!this.pivotField || this.columnHeaders instanceof Promise) return new Map<SchemaHeaderField, Doc[]>();

        if (this.columnHeaders === undefined) {
            setTimeout(() => this.layoutDoc._columnHeaders = new List<SchemaHeaderField>(), 0);
            return new Map<SchemaHeaderField, Doc[]>();
        }
        const columnHeaders = Array.from(this.columnHeaders);
        const fields = new Map<SchemaHeaderField, Doc[]>(columnHeaders.map(sh => [sh, []] as [SchemaHeaderField, []]));
        let changed = false;
        this.filteredChildren.map(d => {
            const sectionValue = (d[this.pivotField] ? d[this.pivotField] : `NO ${this.pivotField.toUpperCase()} VALUE`) as object;
            // the next five lines ensures that floating point rounding errors don't create more than one section -syip
            const parsed = parseInt(sectionValue.toString());
            const castedSectionValue = !isNaN(parsed) ? parsed : sectionValue;

            // look for if header exists already
            const existingHeader = columnHeaders.find(sh => sh.heading === (castedSectionValue ? castedSectionValue.toString() : `NO ${this.pivotField.toUpperCase()} VALUE`));
            if (existingHeader) {
                fields.get(existingHeader)!.push(d);
            }
            else {
                const newSchemaHeader = new SchemaHeaderField(castedSectionValue ? castedSectionValue.toString() : `NO ${this.pivotField.toUpperCase()} VALUE`);
                fields.set(newSchemaHeader, [d]);
                columnHeaders.push(newSchemaHeader);
                changed = true;
            }
        });
        // remove all empty columns if hideHeadings is set
        if (this.layoutDoc._columnsHideIfEmpty) {
            Array.from(fields.keys()).filter(key => !fields.get(key)!.length).map(header => {
                fields.delete(header);
                columnHeaders.splice(columnHeaders.indexOf(header), 1);
                changed = true;
            });
        }
        changed && setTimeout(action(() => this.columnHeaders?.splice(0, this.columnHeaders.length, ...columnHeaders)), 0);
        return fields;
    }

    componentDidMount() {
        super.componentDidMount?.();

        // reset section headers when a new filter is inputted
        this._pivotFieldDisposer = reaction(
            () => this.pivotField,
            () => this.layoutDoc._columnHeaders = new List()
        );
        this._autoHeightDisposer = reaction(() => this.layoutDoc._autoHeight, this.forceAutoHeight);
    }
    componentWillUnmount() {
        super.componentWillUnmount();
        this._pivotFieldDisposer?.();
        this._autoHeightDisposer?.();
    }

    @action
    moveDocument = (doc: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean): boolean => {
        return this.props.removeDocument?.(doc) && addDocument?.(doc) ? true : false;
    }
    createRef = (ele: HTMLDivElement | null) => {
        this._masonryGridRef = ele;
        this.createDashEventsTarget(ele!); //so the whole grid is the drop target?
    }

    @computed get onChildClickHandler() { return () => this.props.childClickScript || ScriptCast(this.Document.onChildClick); }
    @computed get onChildDoubleClickHandler() { return () => this.props.childDoubleClickScript || ScriptCast(this.Document.onChildDoubleClick); }

    addDocTab = (doc: Doc, where: string) => {
        if (where === "inPlace" && this.layoutDoc.isInPlaceContainer) {
            this.dataDoc[this.props.fieldKey] = new List<Doc>([doc]);
            return true;
        }
        return this.props.addDocTab(doc, where);
    }


    focusDocument = (doc: Doc, willZoom?: boolean, scale?: number, afterFocus?: DocAfterFocusFunc, dontCenter?: boolean, didFocus?: boolean) => {
        Doc.BrushDoc(doc);
        this.props.focus(this.props.Document, true);  // bcz: want our containing collection to zoom
        Doc.linkFollowHighlight(doc);

        const found = this._mainCont && Array.from(this._mainCont.getElementsByClassName("documentView-node")).find((node: any) => node.id === doc[Id]);
        if (found) {
            const top = found.getBoundingClientRect().top;
            const localTop = this.props.ScreenToLocalTransform().transformPoint(0, top);
            smoothScroll(doc.presTransition || doc.presTransition === 0 ? NumCast(doc.presTransition) : 500, this._mainCont!, localTop[1] + this._mainCont!.scrollTop);
        }
        afterFocus && setTimeout(afterFocus, 500);
    }

    getDisplayDoc(doc: Doc, dxf: () => Transform, width: () => number) {
        const dataDoc = (!doc.isTemplateDoc && !doc.isTemplateForField && !doc.PARAMS) ? undefined : this.props.DataDoc;
        const height = () => this.getDocHeight(doc);
        const opacity = () => this.Document._currentFrame === undefined ? this.props.childOpacity?.() : CollectionFreeFormDocumentView.getValues(doc, NumCast(this.Document._currentFrame))?.opacity;
        return <ContentFittingDocumentView
            Document={doc}
            DataDoc={dataDoc || (!Doc.AreProtosEqual(doc[DataSym], doc) && doc[DataSym])}
            renderDepth={this.props.renderDepth + 1}
            PanelWidth={width}
            PanelHeight={height}
            styleProvider={this.props.styleProvider}
            LayoutTemplate={this.props.childLayoutTemplate}
            LayoutTemplateString={this.props.childLayoutString}
            freezeDimensions={this.props.childFreezeDimensions}
            NativeWidth={this.props.childIgnoreNativeSize ? returnZero : undefined}  // explicitly ignore nativeWidth/height if childIgnoreNativeSize is set- used by PresBox
            NativeHeight={this.props.childIgnoreNativeSize ? returnZero : undefined}
            dontCenter={this.props.childIgnoreNativeSize ? "xy" : ""}
            fitToBox={false}
            dontRegisterView={dataDoc ? true : BoolCast(this.layoutDoc.dontRegisterChildViews, this.props.dontRegisterView)}
            rootSelected={this.rootSelected}
            dropAction={StrCast(this.layoutDoc.childDropAction) as dropActionType}
            onClick={this.onChildClickHandler}
            onDoubleClick={this.onChildDoubleClickHandler}
            ScreenToLocalTransform={dxf}
            opacity={opacity}
            focus={this.focusDocument}
            docFilters={this.docFilters}
            docRangeFilters={this.docRangeFilters}
            searchFilterDocs={this.searchFilterDocs}
            ContainingCollectionDoc={this.props.CollectionView?.props.Document}
            ContainingCollectionView={this.props.CollectionView}
            addDocument={this.props.addDocument}
            moveDocument={this.props.moveDocument}
            removeDocument={this.props.removeDocument}
            contentsPointerEvents={StrCast(this.layoutDoc.contentPointerEvents)}
            parentActive={this.props.active}
            whenActiveChanged={this.props.whenActiveChanged}
            addDocTab={this.addDocTab}
            bringToFront={returnFalse}
            ContentScaling={returnOne}
            scriptContext={this.props.scriptContext}
            pinToPres={this.props.pinToPres}
        />;
    }

    getDocWidth(d?: Doc) {
        if (!d) return 0;
        const layoutDoc = Doc.Layout(d, this.props.childLayoutTemplate?.());
        const nw = Doc.NativeWidth(layoutDoc);
        return Math.min(nw && !this.layoutDoc._columnsFill ? d[WidthSym]() : Number.MAX_VALUE, this.columnWidth / this.numGroupColumns);
    }
    getDocHeight(d?: Doc) {
        if (!d) return 0;
        const childDataDoc = (!d.isTemplateDoc && !d.isTemplateForField && !d.PARAMS) ? undefined : this.props.DataDoc;
        const childLayoutDoc = Doc.Layout(d, this.props.childLayoutTemplate?.());
        const nw = Doc.NativeWidth(childLayoutDoc, childDataDoc);
        const nh = Doc.NativeHeight(childLayoutDoc, childDataDoc);
        let wid = this.columnWidth / (this.isStackingView ? this.numGroupColumns : 1);
        if (!this.layoutDoc._columnsFill) wid = Math.min(wid, childLayoutDoc[WidthSym]());
        const hllimit = NumCast(this.layoutDoc.childLimitHeight, -1);
        if (!childLayoutDoc._fitWidth && nw && nh) {
            const aspect = nw && nh ? nh / nw : 1;
            if (!(this.layoutDoc._columnsFill)) wid = Math.min(this.getDocWidth(d), wid);
            return Math.min(hllimit === 0 ? this.props.PanelWidth() : hllimit === -1 ? 10000 : hllimit, wid * aspect);
        }
        return childLayoutDoc._fitWidth ?
            (!nh ? this.props.PanelHeight() - 2 * this.yMargin :
                Math.min(wid * nh / (nw || 1), this.layoutDoc._autoHeight ? 100000 : this.props.PanelHeight() - 2 * this.yMargin)) :
            Math.min(hllimit === 0 ? this.props.PanelWidth() : hllimit === -1 ? 10000 : hllimit, Math.max(20, childLayoutDoc[HeightSym]()));
    }

    columnDividerDown = (e: React.PointerEvent) => {
        runInAction(() => this._cursor = "grabbing");
        setupMoveUpEvents(this, e, this.onDividerMove, action(() => this._cursor = "grab"), emptyFunction);
    }
    @action
    onDividerMove = (e: PointerEvent, down: number[], delta: number[]) => {
        this.layoutDoc._columnWidth = Math.max(10, this.columnWidth + delta[0]);
        return false;
    }

    @computed get columnDragger() {
        return <div className="collectionStackingView-columnDragger" onPointerDown={this.columnDividerDown} ref={this._draggerRef}
            style={{ cursor: this._cursor, left: `${this.columnWidth + this.xMargin}px`, top: `${Math.max(0, this.yMargin - 9)}px` }} >
            <FontAwesomeIcon icon={"arrows-alt-h"} />
        </div>;
    }

    @undoBatch
    @action
    onInternalDrop = (e: Event, de: DragManager.DropEvent) => {
        const where = [de.x, de.y];
        let dropInd = -1;
        let dropAfter = 0;
        if (de.complete.docDragData) {
            this._docXfs.map((cd, i) => {
                const pos = cd.dxf().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
                const pos1 = cd.dxf().inverse().transformPoint(cd.width(), cd.height());
                if (where[0] > pos[0] && where[0] < pos1[0] && where[1] > pos[1] && (i === this._docXfs.length - 1 || where[1] < pos1[1])) {
                    dropInd = i;
                    const axis = this.Document._viewType === CollectionViewType.Masonry ? 0 : 1;
                    dropAfter = where[axis] > (pos[axis] + pos1[axis]) / 2 ? 1 : 0;
                }
            });
            const oldDocs = this.childDocs.length;
            if (super.onInternalDrop(e, de)) {
                const droppedDocs = this.childDocs.slice().filter((d: Doc, ind: number) => ind >= oldDocs); // if the drop operation adds something to the end of the list, then use that as the new document (may be different than what was dropped e.g., in the case of a button which is dropped but which creates say, a note).
                const newDocs = droppedDocs.length ? droppedDocs : de.complete.docDragData.droppedDocuments; // if nothing was added to the end of the list, then presumably the dropped documents were already in the list, but possibly got reordered so we use them.

                const docs = this.childDocList;
                DragManager.docsBeingDragged = [];
                if (docs && newDocs.length) {
                    const insertInd = dropInd === -1 ? docs.length : dropInd + dropAfter;
                    const offset = newDocs.reduce((off, ndoc) => this.filteredChildren.find((fdoc, i) => ndoc === fdoc && i < insertInd) ? off + 1 : off, 0);
                    newDocs.filter(ndoc => docs.indexOf(ndoc) !== -1).forEach(ndoc => docs.splice(docs.indexOf(ndoc), 1));
                    docs.splice(insertInd - offset, 0, ...newDocs);
                }
            }
        }
        return false;
    }

    @undoBatch
    @action
    onExternalDrop = async (e: React.DragEvent): Promise<void> => {
        const where = [e.clientX, e.clientY];
        let targInd = -1;
        this._docXfs.map((cd, i) => {
            const pos = cd.dxf().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
            const pos1 = cd.dxf().inverse().transformPoint(cd.width(), cd.height());
            if (where[0] > pos[0] && where[0] < pos1[0] && where[1] > pos[1] && where[1] < pos1[1]) {
                targInd = i;
            }
        });
        super.onExternalDrop(e, {}, () => {
            if (targInd !== -1) {
                const newDoc = this.childDocs[this.childDocs.length - 1];
                const docs = this.childDocList;
                if (docs) {
                    docs.splice(docs.length - 1, 1);
                    docs.splice(targInd, 0, newDoc);
                }
            }
        });
    }
    headings = () => Array.from(this.Sections);
    refList: any[] = [];
    sectionStacking = (heading: SchemaHeaderField | undefined, docList: Doc[]) => {
        const key = this.pivotField;
        let type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined = undefined;
        if (this.pivotField) {
            const types = docList.length ? docList.map(d => typeof d[key]) : this.filteredChildren.map(d => typeof d[key]);
            if (types.map((i, idx) => types.indexOf(i) === idx).length === 1) {
                type = types[0];
            }
        }
        const cols = () => this.isStackingView ? 1 : Math.max(1, Math.min(this.filteredChildren.length,
            Math.floor((this.props.PanelWidth() - 2 * this.xMargin) / (this.columnWidth + this.gridGap))));
        return <CollectionStackingViewFieldColumn
            unobserveHeight={(ref) => this.refList.splice(this.refList.indexOf(ref), 1)}
            observeHeight={(ref) => {
                if (ref) {
                    this.refList.push(ref);
                    const doc = this.props.DataDoc && this.props.DataDoc.layout === this.layoutDoc ? this.props.DataDoc : this.layoutDoc;
                    this.observer = new _global.ResizeObserver(action((entries: any) => {
                        if (this.layoutDoc._autoHeight && ref && this.refList.length && !SnappingManager.GetIsDragging()) {
                            const height = Math.min(NumCast(this.layoutDoc._maxHeight, Number.MAX_SAFE_INTEGER), Math.max(...this.refList.map(r => NumCast(Doc.Layout(doc)._viewScale, 1) * Number(getComputedStyle(r).height.replace("px", "")))));
                            if (this.props.isAnnotationOverlay) {
                                doc[this.props.fieldKey + "-height"] = height;
                            } else {
                                Doc.Layout(doc)._height = height * NumCast(Doc.Layout(doc)._viewScale, 1);
                            }
                        }
                    }));
                    this.observer.observe(ref);
                }
            }}
            key={heading?.heading ?? ""}
            cols={cols}
            headings={this.headings}
            heading={heading?.heading ?? ""}
            headingObject={heading}
            docList={docList}
            parent={this}
            type={type}
            createDropTarget={this.createDashEventsTarget}
            screenToLocalTransform={this.props.ScreenToLocalTransform}
        />;
    }

    getDocTransform(doc: Doc, dref: HTMLDivElement) {
        if (!dref) return Transform.Identity();
        const y = this._scroll; // required for document decorations to update when the text box container is scrolled
        const { scale, translateX, translateY } = Utils.GetScreenTransform(dref);
        const outerXf = Utils.GetScreenTransform(this._masonryGridRef!);
        const offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        const offsety = (this.props.ChromeHeight && this.props.ChromeHeight() < 0 ? this.props.ChromeHeight() : 0);
        return this.props.ScreenToLocalTransform().translate(offset[0], offset[1] + offsety);
    }

    forceAutoHeight = () => {
        const doc = this.props.DataDoc && this.props.DataDoc.layout === this.layoutDoc ? this.props.DataDoc : this.layoutDoc;
        Doc.Layout(doc)._height = this.refList.reduce((p, r) => p + Number(getComputedStyle(r).height.replace("px", "")), 0);
    }

    sectionMasonry = (heading: SchemaHeaderField | undefined, docList: Doc[], first: boolean) => {
        const key = this.pivotField;
        let type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined = undefined;
        const types = docList.length ? docList.map(d => typeof d[key]) : this.filteredChildren.map(d => typeof d[key]);
        if (types.map((i, idx) => types.indexOf(i) === idx).length === 1) {
            type = types[0];
        }
        const rows = () => !this.isStackingView ? 1 : Math.max(1, Math.min(docList.length,
            Math.floor((this.props.PanelWidth() - 2 * this.xMargin) / (this.columnWidth + this.gridGap))));
        return <CollectionMasonryViewFieldRow
            showHandle={first}
            unobserveHeight={(ref) => this.refList.splice(this.refList.indexOf(ref), 1)}
            observeHeight={(ref) => {
                if (ref) {
                    this.refList.push(ref);
                    const doc = this.props.DataDoc && this.props.DataDoc.layout === this.layoutDoc ? this.props.DataDoc : this.layoutDoc;
                    this.observer = new _global.ResizeObserver(action((entries: any) => {
                        if (this.layoutDoc._autoHeight && ref && this.refList.length && !SnappingManager.GetIsDragging()) {
                            const height = this.refList.reduce((p, r) => p + Number(getComputedStyle(r).height.replace("px", "")), 0);
                            Doc.Layout(doc)._height = Math.max(height, NumCast(doc[this.props.fieldKey + "-height"]));
                        }
                    }));
                    this.observer.observe(ref);
                }
            }}
            key={heading ? heading.heading : ""}
            rows={rows}
            headings={this.headings}
            heading={heading ? heading.heading : ""}
            headingObject={heading}
            docList={docList}
            parent={this}
            type={type}
            createDropTarget={this.createDashEventsTarget}
            screenToLocalTransform={this.props.ScreenToLocalTransform}
            setDocHeight={this.setDocHeight}
        />;
    }

    @action
    addGroup = (value: string) => {
        if (value && this.columnHeaders) {
            const schemaHdrField = new SchemaHeaderField(value);
            this.columnHeaders.push(schemaHdrField);
            DocUtils.addFieldEnumerations(undefined, this.pivotField, [{ title: value, _backgroundColor: schemaHdrField.color }]);
            return true;
        }
        return false;
    }

    sortFunc = (a: [SchemaHeaderField, Doc[]], b: [SchemaHeaderField, Doc[]]): 1 | -1 => {
        const descending = StrCast(this.layoutDoc._columnsSort) === "descending";
        const firstEntry = descending ? b : a;
        const secondEntry = descending ? a : b;
        return firstEntry[0].heading > secondEntry[0].heading ? 1 : -1;
    }

    onContextMenu = (e: React.MouseEvent): void => {
        // need to test if propagation has stopped because GoldenLayout forces a parallel react hierarchy to be created for its top-level layout
        if (!e.isPropagationStopped()) {
            const subItems: ContextMenuProps[] = [];
            subItems.push({ description: `${this.layoutDoc._columnsFill ? "Variable Size" : "Autosize"} Column`, event: () => this.layoutDoc._columnsFill = !this.layoutDoc._columnsFill, icon: "plus" });
            subItems.push({ description: `${this.layoutDoc._autoHeight ? "Variable Height" : "Auto Height"}`, event: () => this.layoutDoc._autoHeight = !this.layoutDoc._autoHeight, icon: "plus" });
            subItems.push({ description: "Clear All", event: () => this.dataDoc.data = new List([]), icon: "times" });
            ContextMenu.Instance.addItem({ description: "Options...", subitems: subItems, icon: "eye" });
        }
    }

    @computed get renderedSections() {
        TraceMobx();
        let sections = [[undefined, this.filteredChildren] as [SchemaHeaderField | undefined, Doc[]]];
        if (this.pivotField) {
            const entries = Array.from(this.Sections.entries());
            sections = this.layoutDoc._columnsSort ? entries.sort(this.sortFunc) : entries;
        }
        return sections.map((section, i) => this.isStackingView ? this.sectionStacking(section[0], section[1]) : this.sectionMasonry(section[0], section[1], i === 0));
    }


    @computed get nativeWidth() { return returnVal(this.props.NativeWidth?.(), Doc.NativeWidth(this.layoutDoc)); }
    @computed get nativeHeight() { return returnVal(this.props.NativeHeight?.(), Doc.NativeHeight(this.layoutDoc)); }

    @computed get scaling() { return !this.nativeWidth ? 1 : this.props.PanelHeight() / this.nativeHeight; }

    observer: any;
    render() {
        TraceMobx();
        const editableViewProps = {
            GetValue: () => "",
            SetValue: this.addGroup,
            contents: "+ ADD A GROUP"
        };
        return (
            <div className="collectionStackingMasonry-cont" >
                <div className={this.isStackingView ? "collectionStackingView" : "collectionMasonryView"}
                    ref={this.createRef}
                    style={{
                        overflowY: this.props.active() ? "auto" : "hidden",
                        transform: `scale(${this.scaling}`,
                        height: `${1 / this.scaling * 100}%`,
                        width: `${1 / this.scaling * 100}%`,
                        transformOrigin: "top left",
                    }}
                    onScroll={action(e => this._scroll = e.currentTarget.scrollTop)}
                    onDrop={this.onExternalDrop.bind(this)}
                    onContextMenu={this.onContextMenu}
                    onWheel={e => this.props.active(true) && e.stopPropagation()} >
                    {this.renderedSections}
                    {!this.showAddAGroup ? (null) :
                        <div key={`${this.props.Document[Id]}-addGroup`} className="collectionStackingView-addGroupButton"
                            style={{ width: !this.isStackingView ? "100%" : this.columnWidth / this.numGroupColumns - 10, marginTop: 10 }}>
                            <EditableView {...editableViewProps} />
                        </div>}
                    {/* {this.chromeStatus === 'disabled' || !this.props.isSelected() ? (null) :
                        <Switch
                            onChange={this.onToggle}
                            onClick={this.onToggle}
                            defaultChecked={this.chromeStatus !== 'view-mode'}
                            checkedChildren="edit"
                            unCheckedChildren="view"
                        />} */}
                </div> </div>
        );
    }
}
