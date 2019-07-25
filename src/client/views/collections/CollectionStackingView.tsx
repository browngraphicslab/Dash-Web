import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, reaction, untracked, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym, DocListCast } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast, Cast, StrCast, FieldValue } from "../../../new_fields/Types";
import { emptyFunction, Utils } from "../../../Utils";
import { CollectionSchemaPreview } from "./CollectionSchemaView";
import "./CollectionStackingView.scss";
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import { undoBatch } from "../../util/UndoManager";
import { DragManager } from "../../util/DragManager";
import { DocumentType } from "../../documents/Documents";
import { Transform } from "../../util/Transform";
import { CursorProperty } from "csstype";
import { CollectionStackingViewFieldColumn } from "./CollectionStackingViewFieldColumn";
import { listSpec } from "../../../new_fields/Schema";
import { SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import { List } from "../../../new_fields/List";
import { EditableView } from "../EditableView";
import { CollectionViewProps } from "./CollectionBaseView";

let valuesCreated = 1;

@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {
    _masonryGridRef: HTMLDivElement | null = null;
    _draggerRef = React.createRef<HTMLDivElement>();
    _heightDisposer?: IReactionDisposer;
    _sectionFilterDisposer?: IReactionDisposer;
    _docXfs: any[] = [];
    _columnStart: number = 0;
    @observable private cursor: CursorProperty = "grab";
    get sectionHeaders() { return Cast(this.props.Document.sectionHeaders, listSpec(SchemaHeaderField)); }
    get chromeCollapsed() { return this.props.chromeCollapsed; }
    @computed get xMargin() { return NumCast(this.props.Document.xMargin, 2 * this.gridGap); }
    @computed get yMargin() { return NumCast(this.props.Document.yMargin, 2 * this.gridGap); }
    @computed get gridGap() { return NumCast(this.props.Document.gridGap, 10); }
    @computed get singleColumn() { return BoolCast(this.props.Document.singleColumn, true); }
    @computed get columnWidth() { return this.singleColumn ? (this.props.PanelWidth() / (this.props as any).ContentScaling() - 2 * this.xMargin) : Math.min(this.props.PanelWidth() - 2 * this.xMargin, NumCast(this.props.Document.columnWidth, 250)); }
    @computed get filteredChildren() { return this.childDocs.filter(d => !d.isMinimized); }
    get Sections() {
        let sectionFilter = StrCast(this.props.Document.sectionFilter);
        let sectionHeaders = this.sectionHeaders;
        if (!sectionHeaders) {
            this.props.Document.sectionHeaders = sectionHeaders = new List();
        }
        let fields = new Map<SchemaHeaderField, Doc[]>(sectionHeaders.map(sh => [sh, []]));
        if (sectionFilter) {
            this.filteredChildren.map(d => {
                let sectionValue = (d[sectionFilter] ? d[sectionFilter] : `No ${sectionFilter} value`) as object;
                // the next five lines ensures that floating point rounding errors don't create more than one section -syip
                let parsed = parseInt(sectionValue.toString());
                let castedSectionValue: any = sectionValue;
                if (!isNaN(parsed)) {
                    castedSectionValue = parsed;
                }

                // look for if header exists already
                let existingHeader = sectionHeaders!.find(sh => sh.heading === (castedSectionValue ? castedSectionValue.toString() : `No ${sectionFilter} value`));
                if (existingHeader) {
                    fields.get(existingHeader)!.push(d);
                }
                else {
                    let newSchemaHeader = new SchemaHeaderField(castedSectionValue ? castedSectionValue.toString() : `No ${sectionFilter} value`);
                    fields.set(newSchemaHeader, [d]);
                    sectionHeaders!.push(newSchemaHeader);
                }
            });
        }
        return fields;
    }
    componentDidMount() {
        // is there any reason this needs to exist? -syip
        // this._heightDisposer = reaction(() => [this.yMargin, this.gridGap, this.columnWidth, this.childDocs.map(d => [d.height, d.width, d.zoomBasis, d.nativeHeight, d.nativeWidth, d.isMinimized])],
        //     () => this.singleColumn &&
        //         (this.props.Document.height = this.Sections.size * 50 + this.filteredChildren.reduce((height, d, i) =>
        //             height + this.getDocHeight(d) + (i === this.filteredChildren.length - 1 ? this.yMargin : this.gridGap), this.yMargin))
        //     , { fireImmediately: true });

        // reset section headers when a new filter is inputted
        this._sectionFilterDisposer = reaction(
            () => StrCast(this.props.Document.sectionFilter),
            () => {
                this.props.Document.sectionHeaders = new List();
                valuesCreated = 1;
            }
        )
    }
    componentWillUnmount() {
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
        return doc.type === DocumentType.IMG || doc.type === DocumentType.VID ? { title: "title", caption: "caption" } : {};
    }

    getDisplayDoc(layoutDoc: Doc, d: Doc, dxf: () => Transform) {
        let resolvedDataDoc = !this.props.Document.isTemplate && this.props.DataDoc !== this.props.Document ? this.props.DataDoc : undefined;
        let headings = Array.from(this.Sections.keys());
        // let uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
        let width = () => (d.nativeWidth ? Math.min(layoutDoc[WidthSym](), this.columnWidth) : this.columnWidth) / (headings.length + 1);
        let height = () => this.getDocHeight(layoutDoc);
        let finalDxf = () => dxf().scale(this.columnWidth / layoutDoc[WidthSym]());
        return <CollectionSchemaPreview
            Document={layoutDoc}
            DataDocument={resolvedDataDoc}
            showOverlays={this.overlays}
            renderDepth={this.props.renderDepth}
            fitToBox={true}
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
            setPreviewScript={emptyFunction}
            previewScript={undefined}>
        </CollectionSchemaPreview>;
    }
    getDocHeight(d: Doc) {
        let nw = NumCast(d.nativeWidth);
        let nh = NumCast(d.nativeHeight);
        let aspect = nw && nh ? nh / nw : 1;
        let wid = Math.min(d[WidthSym](), this.columnWidth);
        return (nw && nh) ? wid * aspect : d[HeightSym]();
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
        this.props.Document.columnWidth = this.columnWidth + delta;
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
        let targInd = -1;
        let where = [de.x, de.y];
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
    section = (heading: SchemaHeaderField | undefined, docList: Doc[]) => {
        let key = StrCast(this.props.Document.sectionFilter);
        let type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined = undefined;
        let types = docList.length ? docList.map(d => typeof d[key]) : this.childDocs.map(d => typeof d[key]);
        if (types.map((i, idx) => types.indexOf(i) === idx).length === 1) {
            type = types[0];
        }
        let cols = () => this.singleColumn ? 1 : Math.max(1, Math.min(this.filteredChildren.length,
            Math.floor((this.props.PanelWidth() - 2 * this.xMargin) / (this.columnWidth + this.gridGap))));
        return <CollectionStackingViewFieldColumn
            key={heading ? heading.heading : ""}
            cols={cols}
            headings={() => Array.from(this.Sections.keys())}
            heading={heading ? heading.heading : ""}
            headingObject={heading}
            docList={docList}
            parent={this}
            type={type}
            createDropTarget={this.createDropTarget} />;
    }

    @action
    addGroup = (value: string) => {
        if (value) {
            if (this.sectionHeaders) {
                this.sectionHeaders.push(new SchemaHeaderField(value));
                return true;
            }
        }
        return false;
    }

    sortFunc = (a: [SchemaHeaderField, Doc[]], b: [SchemaHeaderField, Doc[]]): 1 | -1 => {
        let descending = BoolCast(this.props.Document.stackingHeadersSortDescending);
        let firstEntry = descending ? b : a;
        let secondEntry = descending ? a : b;
        return firstEntry[0].heading > secondEntry[0].heading ? 1 : -1;
    }

    render() {
        let headings = Array.from(this.Sections.keys());
        let editableViewProps = {
            GetValue: () => "",
            SetValue: this.addGroup,
            contents: "+ Add a Group"
        }
        // let uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
        return (
            <div className="collectionStackingView" style={{ top: this.chromeCollapsed ? 0 : 100 }}
                ref={this.createRef} onDrop={this.onDrop.bind(this)} onWheel={(e: React.WheelEvent) => e.stopPropagation()} >
                {/* {sectionFilter as boolean ? [
                    ["width > height", this.filteredChildren.filter(f => f[WidthSym]() >= 1 + f[HeightSym]())],
                    ["width = height", this.filteredChildren.filter(f => Math.abs(f[WidthSym]() - f[HeightSym]()) < 1)],
                    ["height > width", this.filteredChildren.filter(f => f[WidthSym]() + 1 <= f[HeightSym]())]]. */}
                {this.props.Document.sectionFilter ? Array.from(this.Sections.entries()).sort(this.sortFunc).
                    map(section => this.section(section[0], section[1] as Doc[])) :
                    this.section(undefined, this.filteredChildren)}
                {this.props.Document.sectionFilter ?
                    <div key={`${this.props.Document[Id]}-addGroup`} className="collectionStackingView-addGroupButton"
                        style={{ width: (this.columnWidth / (headings.length + 1)) - 10, marginTop: 10 }}>
                        <EditableView {...editableViewProps} />
                    </div> : null}
            </div>
        );
    }
}