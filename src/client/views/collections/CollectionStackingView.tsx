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
import { emptyFunction, Utils } from "../../../Utils";
import { DocumentType } from "../../documents/DocumentTypes";
import { DragManager } from "../../util/DragManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { EditableView } from "../EditableView";
import { ContentFittingDocumentView } from "../nodes/ContentFittingDocumentView";
import "./CollectionStackingView.scss";
import { CollectionStackingViewFieldColumn } from "./CollectionStackingViewFieldColumn";
import { CollectionSubView } from "./CollectionSubView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { CollectionMasonryViewFieldRow } from "./CollectionMasonryViewFieldRow";
import { TraceMobx } from "../../../new_fields/util";
import { CollectionViewType } from "./CollectionView";

@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {
    _masonryGridRef: HTMLDivElement | null = null;
    _draggerRef = React.createRef<HTMLDivElement>();
    _heightDisposer?: IReactionDisposer;
    _sectionFilterDisposer?: IReactionDisposer;
    _docXfs: any[] = [];
    _columnStart: number = 0;
    @observable _heightMap = new Map<string, number>();
    @observable _cursor: CursorProperty = "grab";
    @observable _scroll = 0; // used to force the document decoration to update when scrolling
    @computed get sectionHeaders() { return Cast(this.props.Document.sectionHeaders, listSpec(SchemaHeaderField)); }
    @computed get sectionFilter() { return StrCast(this.props.Document.sectionFilter); }
    @computed get filteredChildren() { return this.childLayoutPairs.filter(pair => pair.layout instanceof Doc && !pair.layout.isMinimized).map(pair => pair.layout); }
    @computed get xMargin() { return NumCast(this.props.Document._xMargin, 2 * this.gridGap); }
    @computed get yMargin() { return Math.max(this.props.Document.showTitle && !this.props.Document.showTitleHover ? 30 : 0, NumCast(this.props.Document._yMargin, 2 * this.gridGap)); }
    @computed get gridGap() { return NumCast(this.props.Document._gridGap, 10); }
    @computed get isStackingView() { return BoolCast(this.props.Document.singleColumn, true); }
    @computed get numGroupColumns() { return this.isStackingView ? Math.max(1, this.Sections.size + (this.showAddAGroup ? 1 : 0)) : 1; }
    @computed get showAddAGroup() { return (this.sectionFilter && (this.props.Document._chromeStatus !== 'view-mode' && this.props.Document._chromeStatus !== 'disabled')); }
    @computed get columnWidth() {
        return Math.min(this.props.PanelWidth() / (this.props as any).ContentScaling() - 2 * this.xMargin,
            this.isStackingView ? Number.MAX_VALUE : NumCast(this.props.Document.columnWidth, 250));
    }
    @computed get NodeWidth() { return this.props.PanelWidth() - this.gridGap; }

    children(docs: Doc[]) {
        this._docXfs.length = 0;
        return docs.map((d, i) => {
            const width = () => Math.min(d._nativeWidth && !d.ignoreAspect && !this.props.Document.fillColumn ? d[WidthSym]() : Number.MAX_VALUE, this.columnWidth / this.numGroupColumns);
            const height = () => this.getDocHeight(d);
            const dref = React.createRef<HTMLDivElement>();
            const dxf = () => this.getDocTransform(d, dref.current!);
            this._docXfs.push({ dxf: dxf, width: width, height: height });
            const rowSpan = Math.ceil((height() + this.gridGap) / this.gridGap);
            const style = this.isStackingView ? { width: width(), marginTop: i === 0 ? 0 : this.gridGap, height: height() } : { gridRowEnd: `span ${rowSpan}` };
            return <div className={`collectionStackingView-${this.isStackingView ? "columnDoc" : "masonryDoc"}`} key={d[Id]} ref={dref} style={style} >
                {this.getDisplayDoc(d, (d.resolvedDataDoc as Doc) || d, dxf, width)}
            </div>;
        });
    }
    @action
    setDocHeight = (key: string, sectionHeight: number) => {
        this._heightMap.set(key, sectionHeight);
    }

    get Sections() {
        if (!this.sectionFilter || this.sectionHeaders instanceof Promise) return new Map<SchemaHeaderField, Doc[]>();

        if (this.sectionHeaders === undefined) {
            setTimeout(() => this.props.Document.sectionHeaders = new List<SchemaHeaderField>(), 0);
            return new Map<SchemaHeaderField, Doc[]>();
        }
        const sectionHeaders = this.sectionHeaders;
        const fields = new Map<SchemaHeaderField, Doc[]>(sectionHeaders.map(sh => [sh, []] as [SchemaHeaderField, []]));
        this.filteredChildren.map(d => {
            const sectionValue = (d[this.sectionFilter] ? d[this.sectionFilter] : `NO ${this.sectionFilter.toUpperCase()} VALUE`) as object;
            // the next five lines ensures that floating point rounding errors don't create more than one section -syip
            const parsed = parseInt(sectionValue.toString());
            const castedSectionValue = !isNaN(parsed) ? parsed : sectionValue;

            // look for if header exists already
            const existingHeader = sectionHeaders.find(sh => sh.heading === (castedSectionValue ? castedSectionValue.toString() : `NO ${this.sectionFilter.toUpperCase()} VALUE`));
            if (existingHeader) {
                fields.get(existingHeader)!.push(d);
            }
            else {
                const newSchemaHeader = new SchemaHeaderField(castedSectionValue ? castedSectionValue.toString() : `NO ${this.sectionFilter.toUpperCase()} VALUE`);
                fields.set(newSchemaHeader, [d]);
                sectionHeaders.push(newSchemaHeader);
            }
        });
        return fields;
    }

    componentDidMount() {
        super.componentDidMount();
        this._heightDisposer = reaction(() => {
            if (this.props.Document._autoHeight) {
                const sectionsList = Array.from(this.Sections.size ? this.Sections.values() : [this.filteredChildren]);
                if (this.isStackingView) {
                    const res = this.props.ContentScaling() * sectionsList.reduce((maxHght, s) => {
                        const r1 = Math.max(maxHght,
                            (this.Sections.size ? 50 : 0) + s.reduce((height, d, i) => {
                                const val = height + this.getDocHeight(d) + (i === s.length - 1 ? this.yMargin : this.gridGap);
                                return val;
                            }, this.yMargin));
                        return r1;
                    }, 0);
                    return res;
                } else {
                    const sum = Array.from(this._heightMap.values()).reduce((acc: number, curr: number) => acc += curr, 0);
                    return this.props.ContentScaling() * (sum + (this.Sections.size ? (this.props.Document.miniHeaders ? 20 : 85) : -15));
                }
            }
            return -1;
        },
            (hgt: number) => {
                const doc = hgt === -1 ? undefined : this.props.DataDoc && this.props.DataDoc.layout === this.layoutDoc ? this.props.DataDoc : this.layoutDoc;
                doc && hgt > 0 && (Doc.Layout(doc)._height = hgt);
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
        super.componentWillUnmount();
        this._heightDisposer && this._heightDisposer();
        this._sectionFilterDisposer && this._sectionFilterDisposer();
    }

    @action
    moveDocument = (doc: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean): boolean => {
        return this.props.removeDocument(doc) && addDocument(doc);
    }
    createRef = (ele: HTMLDivElement | null) => {
        this._masonryGridRef = ele;
        this.createDashEventsTarget(ele!); //so the whole grid is the drop target?
    }

    overlays = (doc: Doc) => {
        return doc.type === DocumentType.IMG || doc.type === DocumentType.VID ? { title: StrCast(this.props.Document.showTitles), titleHover: StrCast(this.props.Document.showTitleHovers), caption: StrCast(this.props.Document.showCaptions) } : {};
    }

    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }
    @computed get onClickHandler() { return ScriptCast(this.Document.onChildClick); }

    getDisplayDoc(doc: Doc, dataDoc: Doc | undefined, dxf: () => Transform, width: () => number) {
        const layoutDoc = Doc.Layout(doc);
        const height = () => this.getDocHeight(doc);
        return <ContentFittingDocumentView
            Document={doc}
            DataDocument={dataDoc}
            LibraryPath={this.props.LibraryPath}
            showOverlays={this.overlays}
            renderDepth={this.props.renderDepth + 1}
            fitToBox={this.props.fitToBox}
            onClick={layoutDoc.isTemplateDoc ? this.onClickHandler : this.onChildClickHandler}
            PanelWidth={width}
            PanelHeight={height}
            getTransform={dxf}
            focus={this.props.focus}
            CollectionDoc={this.props.CollectionView && this.props.CollectionView.props.Document}
            CollectionView={this.props.CollectionView}
            addDocument={this.props.addDocument}
            moveDocument={this.props.moveDocument}
            removeDocument={this.props.removeDocument}
            active={this.props.active}
            whenActiveChanged={this.props.whenActiveChanged}
            addDocTab={this.props.addDocTab}
            pinToPres={this.props.pinToPres}>
        </ContentFittingDocumentView>;
    }
    getDocHeight(d?: Doc) {
        if (!d) return 0;
        const layoutDoc = Doc.Layout(d);
        const nw = NumCast(layoutDoc._nativeWidth);
        const nh = NumCast(layoutDoc._nativeHeight);
        let wid = this.columnWidth / (this.isStackingView ? this.numGroupColumns : 1);
        if (!layoutDoc.ignoreAspect && !layoutDoc._fitWidth && nw && nh) {
            const aspect = nw && nh ? nh / nw : 1;
            if (!(d._nativeWidth && !layoutDoc.ignoreAspect && this.props.Document.fillColumn)) wid = Math.min(layoutDoc[WidthSym](), wid);
            return wid * aspect;
        }
        return layoutDoc._fitWidth ? !layoutDoc._nativeHeight ? this.props.PanelHeight() - 2 * this.yMargin :
            Math.min(wid * NumCast(layoutDoc.scrollHeight, NumCast(layoutDoc._nativeHeight)) / NumCast(layoutDoc._nativeWidth, 1), this.props.PanelHeight() - 2 * this.yMargin) : layoutDoc[HeightSym]();
    }

    columnDividerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        runInAction(() => this._cursor = "grabbing");
        document.addEventListener("pointermove", this.onDividerMove);
        document.addEventListener('pointerup', this.onDividerUp);
        this._columnStart = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY)[0];
    }
    @action
    onDividerMove = (e: PointerEvent): void => {
        const dragPos = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY)[0];
        const delta = dragPos - this._columnStart;
        this._columnStart = dragPos;
        this.layoutDoc.columnWidth = Math.max(10, this.columnWidth + delta);
    }

    @action
    onDividerUp = (e: PointerEvent): void => {
        runInAction(() => this._cursor = "grab");
        document.removeEventListener("pointermove", this.onDividerMove);
        document.removeEventListener('pointerup', this.onDividerUp);
    }

    @computed get columnDragger() {
        return <div className="collectionStackingView-columnDragger" onPointerDown={this.columnDividerDown} ref={this._draggerRef}
            style={{ cursor: this._cursor, left: `${this.columnWidth + this.xMargin}px`, top: `${Math.max(0, this.yMargin - 9)}px` }} >
            <FontAwesomeIcon icon={"arrows-alt-h"} />
        </div>;
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        const where = [de.x, de.y];
        let targInd = -1;
        let plusOne = 0;
        if (de.complete.docDragData) {
            this._docXfs.map((cd, i) => {
                const pos = cd.dxf().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
                const pos1 = cd.dxf().inverse().transformPoint(cd.width(), cd.height());
                if (where[0] > pos[0] && where[0] < pos1[0] && where[1] > pos[1] && where[1] < pos1[1]) {
                    targInd = i;
                    const axis = this.Document._viewType === CollectionViewType.Masonry ? 0 : 1;
                    plusOne = where[axis] > (pos[axis] + pos1[axis]) / 2 ? 1 : 0;
                }
            });
            if (super.drop(e, de)) {
                const newDoc = de.complete.docDragData.droppedDocuments[0];
                const docs = this.childDocList;
                if (docs) {
                    if (targInd === -1) targInd = docs.length;
                    else targInd = docs.indexOf(this.filteredChildren[targInd]);
                    const srcInd = docs.indexOf(newDoc);
                    docs.splice(srcInd, 1);
                    docs.splice((targInd > srcInd ? targInd - 1 : targInd) + plusOne, 0, newDoc);
                }
            }
        }
        return false;
    }
    @undoBatch
    @action
    onDrop = async (e: React.DragEvent): Promise<void> => {
        const where = [e.clientX, e.clientY];
        let targInd = -1;
        this._docXfs.map((cd, i) => {
            const pos = cd.dxf().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
            const pos1 = cd.dxf().inverse().transformPoint(cd.width(), cd.height());
            if (where[0] > pos[0] && where[0] < pos1[0] && where[1] > pos[1] && where[1] < pos1[1]) {
                targInd = i;
            }
        });
        super.onDrop(e, {}, () => {
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
    headings = () => Array.from(this.Sections.keys());
    sectionStacking = (heading: SchemaHeaderField | undefined, docList: Doc[]) => {
        const key = this.sectionFilter;
        let type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined = undefined;
        const types = docList.length ? docList.map(d => typeof d[key]) : this.filteredChildren.map(d => typeof d[key]);
        if (types.map((i, idx) => types.indexOf(i) === idx).length === 1) {
            type = types[0];
        }
        const cols = () => this.isStackingView ? 1 : Math.max(1, Math.min(this.filteredChildren.length,
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
            createDropTarget={this.createDashEventsTarget}
            screenToLocalTransform={this.props.ScreenToLocalTransform}
        />;
    }

    getDocTransform(doc: Doc, dref: HTMLDivElement) {
        if (!dref) return Transform.Identity();
        const y = this._scroll; // required for document decorations to update when the text box container is scrolled
        const { scale, translateX, translateY } = Utils.GetScreenTransform(dref);
        const outerXf = Utils.GetScreenTransform(this._masonryGridRef!);
        const scaling = 1 / Math.min(1, this.props.PanelHeight() / this.layoutDoc[HeightSym]());
        const offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        const offsetx = (doc[WidthSym]() - doc[WidthSym]() / scaling) / 2;
        const offsety = (this.props.ChromeHeight && this.props.ChromeHeight() < 0 ? this.props.ChromeHeight() : 0);
        return this.props.ScreenToLocalTransform().translate(offset[0] - offsetx, offset[1] + offsety).scale(scaling);
    }

    sectionMasonry = (heading: SchemaHeaderField | undefined, docList: Doc[]) => {
        const key = this.sectionFilter;
        let type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined = undefined;
        const types = docList.length ? docList.map(d => typeof d[key]) : this.filteredChildren.map(d => typeof d[key]);
        if (types.map((i, idx) => types.indexOf(i) === idx).length === 1) {
            type = types[0];
        }
        const rows = () => !this.isStackingView ? 1 : Math.max(1, Math.min(docList.length,
            Math.floor((this.props.PanelWidth() - 2 * this.xMargin) / (this.columnWidth + this.gridGap))));
        return <CollectionMasonryViewFieldRow
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
        if (value && this.sectionHeaders) {
            this.sectionHeaders.push(new SchemaHeaderField(value));
            return true;
        }
        return false;
    }

    sortFunc = (a: [SchemaHeaderField, Doc[]], b: [SchemaHeaderField, Doc[]]): 1 | -1 => {
        const descending = BoolCast(this.props.Document.stackingHeadersSortDescending);
        const firstEntry = descending ? b : a;
        const secondEntry = descending ? a : b;
        return firstEntry[0].heading > secondEntry[0].heading ? 1 : -1;
    }

    onToggle = (checked: Boolean) => {
        this.props.Document._chromeStatus = checked ? "collapsed" : "view-mode";
    }

    onContextMenu = (e: React.MouseEvent): void => {
        // need to test if propagation has stopped because GoldenLayout forces a parallel react hierarchy to be created for its top-level layout
        if (!e.isPropagationStopped()) {
            const subItems: ContextMenuProps[] = [];
            subItems.push({ description: `${this.props.Document.fillColumn ? "Variable Size" : "Autosize"} Column`, event: () => this.props.Document.fillColumn = !this.props.Document.fillColumn, icon: "plus" });
            subItems.push({ description: `${this.props.Document.showTitles ? "Hide Titles" : "Show Titles"}`, event: () => this.props.Document.showTitles = !this.props.Document.showTitles ? "title" : "", icon: "plus" });
            subItems.push({ description: `${this.props.Document.showCaptions ? "Hide Captions" : "Show Captions"}`, event: () => this.props.Document.showCaptions = !this.props.Document.showCaptions ? "caption" : "", icon: "plus" });
            ContextMenu.Instance.addItem({ description: "Stacking Options ...", subitems: subItems, icon: "eye" });
        }
    }

    @computed get renderedSections() {
        TraceMobx();
        let sections = [[undefined, this.filteredChildren] as [SchemaHeaderField | undefined, Doc[]]];
        if (this.sectionFilter) {
            const entries = Array.from(this.Sections.entries());
            sections = entries.sort(this.sortFunc);
        }
        return sections.map(section => this.isStackingView ? this.sectionStacking(section[0], section[1]) : this.sectionMasonry(section[0], section[1]));
    }
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
                        transform: `scale(${Math.min(1, this.props.PanelHeight() / this.layoutDoc[HeightSym]())})`,
                        height: `${Math.max(100, 100 * 1 / Math.min(this.props.PanelWidth() / this.layoutDoc[WidthSym](), this.props.PanelHeight() / this.layoutDoc[HeightSym]()))}%`,
                        transformOrigin: "top"
                    }}
                    onScroll={action((e: React.UIEvent<HTMLDivElement>) => this._scroll = e.currentTarget.scrollTop)}
                    onDrop={this.onDrop.bind(this)}
                    onContextMenu={this.onContextMenu}
                    onWheel={e => e.stopPropagation()} >
                    {this.renderedSections}
                    {!this.showAddAGroup ? (null) :
                        <div key={`${this.props.Document[Id]}-addGroup`} className="collectionStackingView-addGroupButton"
                            style={{ width: !this.isStackingView ? "100%" : this.columnWidth / this.numGroupColumns - 10, marginTop: 10 }}>
                            <EditableView {...editableViewProps} />
                        </div>}
                    {this.props.Document._chromeStatus !== 'disabled' ? <Switch
                        onChange={this.onToggle}
                        onClick={this.onToggle}
                        defaultChecked={this.props.Document._chromeStatus !== 'view-mode'}
                        checkedChildren="edit"
                        unCheckedChildren="view"
                    /> : null}
                </div> </div>
        );
    }
}