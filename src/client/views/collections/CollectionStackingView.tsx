import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CursorProperty } from "csstype";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { DataSym, Doc, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { collectionSchema, documentSchema } from "../../../fields/documentSchemas";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { BoolCast, Cast, NumCast, ScriptCast, StrCast } from "../../../fields/Types";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, returnFalse, returnZero, setupMoveUpEvents, smoothScroll, Utils } from "../../../Utils";
import { DocUtils, Docs } from "../../documents/Documents";
import { DragManager, dropActionType } from "../../util/DragManager";
import { SnappingManager } from "../../util/SnappingManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { EditableView } from "../EditableView";
import { LightboxView } from "../LightboxView";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { DocFocusOptions, DocumentView, DocumentViewProps, ViewAdjustment } from "../nodes/DocumentView";
import { StyleProp } from "../StyleProvider";
import { CollectionMasonryViewFieldRow } from "./CollectionMasonryViewFieldRow";
import "./CollectionStackingView.scss";
import { CollectionStackingViewFieldColumn } from "./CollectionStackingViewFieldColumn";
import { CollectionSubView } from "./CollectionSubView";
import { CollectionViewType } from "./CollectionView";
const _global = (window /* browser */ || global /* node */) as any;

type StackingDocument = makeInterface<[typeof collectionSchema, typeof documentSchema]>;
const StackingDocument = makeInterface(collectionSchema, documentSchema);

export type collectionStackingViewProps = {
    chromeHidden?: boolean;
    viewType?: CollectionViewType;
    NativeWidth?: () => number;
    NativeHeight?: () => number;
};

@observer
export class CollectionStackingView extends CollectionSubView<StackingDocument, Partial<collectionStackingViewProps>>(StackingDocument) {
    _masonryGridRef: HTMLDivElement | null = null;
    _draggerRef = React.createRef<HTMLDivElement>();
    _pivotFieldDisposer?: IReactionDisposer;
    _autoHeightDisposer?: IReactionDisposer;
    _docXfs: { height: () => number, width: () => number, stackedDocTransform: () => Transform }[] = [];
    _columnStart: number = 0;
    @observable _heightMap = new Map<string, number>();
    @observable _cursor: CursorProperty = "grab";
    @observable _scroll = 0; // used to force the document decoration to update when scrolling
    @computed get chromeHidden() { return this.props.chromeHidden || BoolCast(this.layoutDoc.chromeHidden); }
    @computed get columnHeaders() { return Cast(this.layoutDoc._columnHeaders, listSpec(SchemaHeaderField), null); }
    @computed get pivotField() { return StrCast(this.layoutDoc._pivotField); }
    @computed get filteredChildren() { return this.childLayoutPairs.filter(pair => (pair.layout instanceof Doc) && !pair.layout.hidden).map(pair => pair.layout); }
    @computed get headerMargin() { return this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.HeaderMargin); }
    @computed get xMargin() { return NumCast(this.layoutDoc._xMargin, 2 * Math.min(this.gridGap, .05 * this.props.PanelWidth())); }
    @computed get yMargin() { return this.props.yMargin || NumCast(this.layoutDoc._yMargin, 5); } // 2 * this.gridGap)); }
    @computed get gridGap() { return NumCast(this.layoutDoc._gridGap, 10); }
    @computed get isStackingView() { return (this.props.viewType ?? this.layoutDoc._viewType) === CollectionViewType.Stacking; }
    @computed get numGroupColumns() { return this.isStackingView ? Math.max(1, this.Sections.size + (this.showAddAGroup ? 1 : 0)) : 1; }
    @computed get showAddAGroup() { return this.pivotField && !this.chromeHidden; }
    @computed get columnWidth() {
        return Math.min(this.props.PanelWidth() - 2 * this.xMargin,
            this.isStackingView ? Number.MAX_VALUE : this.layoutDoc._columnWidth === -1 ? this.props.PanelWidth() - 2 * this.xMargin : NumCast(this.layoutDoc._columnWidth, 250));
    }
    @computed get NodeWidth() { return this.props.PanelWidth() - this.gridGap; }

    constructor(props: any) {
        super(props);

        if (this.columnHeaders === undefined) {
            this.layoutDoc._columnHeaders = new List<SchemaHeaderField>();
        }
    }

    children = (docs: Doc[]) => {
        TraceMobx();
        this._docXfs.length = 0;
        return docs.map((d, i) => {
            const height = () => this.getDocHeight(d);
            const width = () => this.getDocWidth(d);
            const rowSpan = Math.ceil((height() + this.gridGap) / this.gridGap);
            const style = this.isStackingView ? { width: width(), marginTop: i ? this.gridGap : 0, height: height() } : { gridRowEnd: `span ${rowSpan}` };
            return <div className={`collectionStackingView-${this.isStackingView ? "columnDoc" : "masonryDoc"}`} key={d[Id]} style={style} >
                {this.getDisplayDoc(d, width)}
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
        this._autoHeightDisposer = reaction(() => this.layoutDoc._autoHeight,
            () => this.props.setHeight(Math.min(NumCast(this.layoutDoc._maxHeight, Number.MAX_SAFE_INTEGER),
                this.headerMargin + (this.isStackingView ?
                    Math.max(...this.refList.map(r => Number(getComputedStyle(r).height.replace("px", "")))) :
                    this.refList.reduce((p, r) => p + Number(getComputedStyle(r).height.replace("px", "")), 0)))));
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

    focusDocument = (doc: Doc, options?: DocFocusOptions) => {
        Doc.BrushDoc(doc);

        let focusSpeed = 0;
        const found = this._mainCont && Array.from(this._mainCont.getElementsByClassName("documentView-node")).find((node: any) => node.id === doc[Id]);
        if (found) {
            const top = found.getBoundingClientRect().top;
            const localTop = this.props.ScreenToLocalTransform().transformPoint(0, top);
            if (Math.floor(localTop[1]) !== 0) {
                smoothScroll(focusSpeed = doc.presTransition || doc.presTransition === 0 ? NumCast(doc.presTransition) : 500, this._mainCont!, localTop[1] + this._mainCont!.scrollTop);
            }
        }
        const endFocus = async (moved: boolean) => options?.afterFocus ? options?.afterFocus(moved) : ViewAdjustment.doNothing;
        this.props.focus(this.rootDoc, {
            willZoom: options?.willZoom, scale: options?.scale, afterFocus: (didFocus: boolean) =>
                new Promise<ViewAdjustment>(res => setTimeout(async () => res(await endFocus(didFocus)), focusSpeed))
        });
    }

    styleProvider = (doc: Doc | undefined, props: Opt<DocumentViewProps>, property: string) => {
        if (property === StyleProp.Opacity && doc) {
            if (this.props.childOpacity) {
                return this.props.childOpacity();
            }
            if (this.Document._currentFrame !== undefined) {
                return CollectionFreeFormDocumentView.getValues(doc, NumCast(this.Document._currentFrame))?.opacity;
            }
        }
        return this.props.styleProvider?.(doc, props, property);
    }
    isContentActive = () => this.props.isSelected() || this.props.isContentActive();
    getDisplayDoc(doc: Doc, width: () => number) {
        const dataDoc = (!doc.isTemplateDoc && !doc.isTemplateForField && !doc.PARAMS) ? undefined : this.props.DataDoc;
        const height = () => this.getDocHeight(doc);

        let dref: Opt<DocumentView>;
        const stackedDocTransform = () => this.getDocTransform(doc, dref);
        this._docXfs.push({ stackedDocTransform, width, height });
        return <DocumentView ref={r => dref = r || undefined}
            Document={doc}
            DataDoc={dataDoc || (!Doc.AreProtosEqual(doc[DataSym], doc) && doc[DataSym])}
            renderDepth={this.props.renderDepth + 1}
            PanelWidth={width}
            PanelHeight={height}
            styleProvider={this.styleProvider}
            layerProvider={this.props.layerProvider}
            docViewPath={this.props.docViewPath}
            fitWidth={this.props.childFitWidth}
            isContentActive={returnFalse}
            isDocumentActive={this.isContentActive}
            LayoutTemplate={this.props.childLayoutTemplate}
            LayoutTemplateString={this.props.childLayoutString}
            freezeDimensions={this.props.childFreezeDimensions}
            NativeWidth={this.props.childIgnoreNativeSize ? returnZero : this.props.childFitWidth?.() || doc._fitWidth && !Doc.NativeWidth(doc) ? width : undefined}  // explicitly ignore nativeWidth/height if childIgnoreNativeSize is set- used by PresBox
            NativeHeight={this.props.childIgnoreNativeSize ? returnZero : this.props.childFitWidth?.() || doc._fitWidth && !Doc.NativeHeight(doc) ? height : undefined}
            dontCenter={this.props.childIgnoreNativeSize ? "xy" : undefined}
            dontRegisterView={dataDoc ? true : BoolCast(this.layoutDoc.childDontRegisterViews, this.props.dontRegisterView)}
            rootSelected={this.rootSelected}
            dropAction={StrCast(this.layoutDoc.childDropAction) as dropActionType}
            onClick={this.onChildClickHandler}
            onDoubleClick={this.onChildDoubleClickHandler}
            ScreenToLocalTransform={stackedDocTransform}
            focus={this.focusDocument}
            docFilters={this.docFilters}
            hideDecorationTitle={this.props.childHideDecorationTitle?.()}
            hideTitle={this.props.childHideTitle?.()}
            docRangeFilters={this.docRangeFilters}
            searchFilterDocs={this.searchFilterDocs}
            ContainingCollectionDoc={this.props.CollectionView?.props.Document}
            ContainingCollectionView={this.props.CollectionView}
            addDocument={this.props.addDocument}
            moveDocument={this.props.moveDocument}
            removeDocument={this.props.removeDocument}
            contentPointerEvents={StrCast(this.layoutDoc.contentPointerEvents)}
            whenChildContentsActiveChanged={this.props.whenChildContentsActiveChanged}
            addDocTab={this.addDocTab}
            bringToFront={returnFalse}
            scriptContext={this.props.scriptContext}
            pinToPres={this.props.pinToPres}
        />;
    }

    getDocTransform(doc: Doc, dref?: DocumentView) {
        const y = this._scroll; // required for document decorations to update when the text box container is scrolled
        const { scale, translateX, translateY } = Utils.GetScreenTransform(dref?.ContentDiv || undefined);
        // the document view may center its contents and if so, will prepend that onto the screenToLocalTansform.  so we have to subtract that off 
        return new Transform(- translateX + (dref?.centeringX || 0), - translateY + (dref?.centeringY || 0), 1).scale(this.props.ScreenToLocalTransform().Scale);
    }
    getDocWidth(d?: Doc) {
        if (!d) return 0;
        const childLayoutDoc = Doc.Layout(d, this.props.childLayoutTemplate?.());
        const maxWidth = this.columnWidth / this.numGroupColumns;
        if (!this.layoutDoc._columnsFill && !(childLayoutDoc._fitWidth || this.props.childFitWidth?.())) {
            return Math.min(d[WidthSym](), maxWidth);
        }
        return maxWidth;
    }
    getDocHeight(d?: Doc) {
        if (!d || d.hidden) return 0;
        const childLayoutDoc = Doc.Layout(d, this.props.childLayoutTemplate?.());
        const childDataDoc = (!d.isTemplateDoc && !d.isTemplateForField && !d.PARAMS) ? undefined : this.props.DataDoc;
        const maxHeight = (lim => lim === 0 ? this.props.PanelWidth() : lim === -1 ? 10000 : lim)(NumCast(this.layoutDoc.childLimitHeight, -1));
        const nw = Doc.NativeWidth(childLayoutDoc, childDataDoc) || (!(childLayoutDoc._fitWidth || this.props.childFitWidth?.()) ? d[WidthSym]() : 0);
        const nh = Doc.NativeHeight(childLayoutDoc, childDataDoc) || (!(childLayoutDoc._fitWidth || this.props.childFitWidth?.()) ? d[HeightSym]() : 0);
        if (nw && nh) {
            const colWid = this.columnWidth / (this.isStackingView ? this.numGroupColumns : 1);
            const docWid = this.layoutDoc._columnsFill ? colWid : Math.min(this.getDocWidth(d), colWid);
            return Math.min(
                maxHeight,
                docWid * nh / nw);
        }
        const childHeight = NumCast(childLayoutDoc._height);
        const panelHeight = (childLayoutDoc._fitWidth || this.props.childFitWidth?.()) ? Number.MAX_SAFE_INTEGER : this.props.PanelHeight() - 2 * this.yMargin;
        return Math.min(childHeight, maxHeight, panelHeight);
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
                const pos = cd.stackedDocTransform().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
                const pos1 = cd.stackedDocTransform().inverse().transformPoint(cd.width(), cd.height());
                if (where[0] > pos[0] && where[0] < pos1[0] && where[1] > pos[1] && (i === this._docXfs.length - 1 || where[1] < pos1[1])) {
                    dropInd = i;
                    const axis = this.isStackingView ? 1 : 0;
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
        else if (de.complete.linkDragData?.dragDocument.context === this.props.Document && de.complete.linkDragData?.linkDragView?.props.CollectionFreeFormDocumentView?.()) {
            const source = Docs.Create.TextDocument("", { _width: 200, _height: 75, _fitWidth: true, title: "dropped annotation" });
            this.props.addDocument?.(source);
            de.complete.linkDocument = DocUtils.MakeLink({ doc: source }, { doc: de.complete.linkDragData.linkSourceGetAnchor() }, "doc annotation", ""); // TODODO this is where in text links get passed
            e.stopPropagation();
        }
        else if (de.complete.annoDragData?.dragDocument && super.onInternalDrop(e, de)) return this.internalAnchorAnnoDrop(e, de.complete.annoDragData);
        return false;
    }

    @undoBatch
    internalAnchorAnnoDrop(e: Event, annoDragData: DragManager.AnchorAnnoDragData) {
        const dropCreator = annoDragData.dropDocCreator;
        annoDragData.dropDocCreator = (annotationOn: Doc | undefined) => {
            const dropDoc = dropCreator(annotationOn);
            return dropDoc || this.rootDoc;
        };
        return true;
    }

    @undoBatch
    @action
    onExternalDrop = async (e: React.DragEvent): Promise<void> => {
        const where = [e.clientX, e.clientY];
        let targInd = -1;
        this._docXfs.map((cd, i) => {
            const pos = cd.stackedDocTransform().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
            const pos1 = cd.stackedDocTransform().inverse().transformPoint(cd.width(), cd.height());
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
        return <CollectionStackingViewFieldColumn
            unobserveHeight={ref => this.refList.splice(this.refList.indexOf(ref), 1)}
            observeHeight={ref => {
                if (ref) {
                    this.refList.push(ref);
                    this.observer = new _global.ResizeObserver(action((entries: any) => {
                        if (this.layoutDoc._autoHeight && ref && this.refList.length && !SnappingManager.GetIsDragging()) {
                            const height = this.headerMargin +
                                Math.min(NumCast(this.layoutDoc._maxHeight, Number.MAX_SAFE_INTEGER),
                                    Math.max(...this.refList.map(r => Number(getComputedStyle(r).height.replace("px", "")))));
                            if (!LightboxView.IsLightboxDocView(this.props.docViewPath())) {
                                this.props.setHeight(height);
                            }
                        }
                    }));
                    this.observer.observe(ref);
                }
            }}
            addDocument={this.addDocument}
            chromeHidden={this.chromeHidden}
            columnHeaders={this.columnHeaders}
            Document={this.props.Document}
            DataDoc={this.props.DataDoc}
            renderChildren={this.children}
            columnWidth={this.columnWidth}
            numGroupColumns={this.numGroupColumns}
            gridGap={this.gridGap}
            pivotField={this.pivotField}
            key={heading?.heading ?? ""}
            headings={this.headings}
            heading={heading?.heading ?? ""}
            headingObject={heading}
            docList={docList}
            yMargin={this.yMargin}
            type={type}
            createDropTarget={this.createDashEventsTarget}
            screenToLocalTransform={this.props.ScreenToLocalTransform}
        />;
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
            Document={this.props.Document}
            chromeHidden={this.chromeHidden}
            pivotField={this.pivotField}
            unobserveHeight={(ref) => this.refList.splice(this.refList.indexOf(ref), 1)}
            observeHeight={(ref) => {
                if (ref) {
                    this.refList.push(ref);
                    this.observer = new _global.ResizeObserver(action((entries: any) => {
                        if (this.layoutDoc._autoHeight && ref && this.refList.length && !SnappingManager.GetIsDragging()) {
                            const height = this.refList.reduce((p, r) => p + Number(getComputedStyle(r).height.replace("px", "")), 0);
                            this.props.setHeight(this.headerMargin + height);
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


    @computed get nativeWidth() { return this.props.NativeWidth?.() ?? Doc.NativeWidth(this.layoutDoc); }
    @computed get nativeHeight() { return this.props.NativeHeight?.() ?? Doc.NativeHeight(this.layoutDoc); }

    @computed get scaling() { return !this.nativeWidth ? 1 : this.props.PanelHeight() / this.nativeHeight; }

    @computed get backgroundEvents() { return SnappingManager.GetIsDragging(); }
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
                        overflowY: this.props.isContentActive() ? "auto" : "hidden",
                        background: this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.BackgroundColor),
                        pointerEvents: this.backgroundEvents ? "all" : undefined
                    }}
                    onScroll={action(e => this._scroll = e.currentTarget.scrollTop)}
                    onDrop={this.onExternalDrop.bind(this)}
                    onContextMenu={this.onContextMenu}
                    onWheel={e => this.props.isContentActive(true) && e.stopPropagation()} >
                    {this.renderedSections}
                    {!this.showAddAGroup ? (null) :
                        <div key={`${this.props.Document[Id]}-addGroup`} className="collectionStackingView-addGroupButton"
                            style={{ width: !this.isStackingView ? "100%" : this.columnWidth / this.numGroupColumns - 10, marginTop: 10 }}>
                            <EditableView {...editableViewProps} />
                        </div>}
                    {/* {this.chromeHidden || !this.props.isSelected() ? (null) :
                        <Switch
                            onChange={this.onToggle}
                            onClick={this.onToggle}
                            defaultChecked={true}
                            checkedChildren="edit"
                            unCheckedChildren="view"
                        />} */}
                </div> </div>
        );
    }
}
