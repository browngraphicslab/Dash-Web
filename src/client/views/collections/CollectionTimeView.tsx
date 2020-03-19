import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, Field, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { ObjectField } from "../../../new_fields/ObjectField";
import { RichTextField } from "../../../new_fields/RichTextField";
import { listSpec } from "../../../new_fields/Schema";
import { ComputedField, ScriptField } from "../../../new_fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { Docs } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { Scripting } from "../../util/Scripting";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { EditableView } from "../EditableView";
import { ViewDefBounds } from "./collectionFreeForm/CollectionFreeFormLayoutEngines";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionTimeView.scss";
import { CollectionTreeView } from "./CollectionTreeView";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;
import React = require("react");
import { setupMoveUpEvents, returnFalse, emptyFunction } from "../../../Utils";

@observer
export class CollectionTimeView extends CollectionSubView(doc => doc) {
    _changing = false;
    @observable _layoutEngine = "pivot";
    @observable _facetWidth = 0;
    @observable _collapsed: boolean = false;
    componentWillUnmount() {
        this.props.Document.onChildClick = undefined;
    }
    componentDidMount() {
        this.props.Document._freezeOnDrop = true;
        if (!this.props.Document._facetCollection) {
            const scriptText = "setDocFilter(containingTreeView.target, heading, this.title, checked)";
            const facetCollection = Docs.Create.TreeDocument([], { title: "facetFilters", _yMargin: 0, treeViewHideTitle: true, treeViewHideHeaderFields: true });
            facetCollection.target = this.props.Document;
            facetCollection.onCheckedClick = ScriptField.MakeScript(scriptText, { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name });
            this.props.Document.excludeFields = new List<string>(["_facetCollection", "_docFilters"]);

            this.props.Document._facetCollection = facetCollection;
            this.props.Document._fitToBox = true;
        }
        const childDetailed = this.props.Document.childDetailed; // bcz: needs to be here to make sure the childDetailed layout template has been loaded when the first item is clicked;
        const childText = "const alias = getAlias(this); Doc.ApplyTemplateTo(containingCollection.childDetailed, alias, 'layout_detailView'); alias.dropAction='alias'; alias.removeDropProperties=new List<string>(['dropAction']);  useRightSplit(alias, shiftKey); ";
        this.props.Document.onChildClick = ScriptField.MakeScript(childText, { this: Doc.name, heading: "string", containingCollection: Doc.name, shiftKey: "boolean" });

        if (!this.props.Document.onViewDefClick) {
            this.props.Document.onViewDefDivClick = ScriptField.MakeScript("pivotColumnClick(this,payload)", { payload: "any" });
        }
    }

    bodyPanelWidth = () => this.props.PanelWidth() - this._facetWidth;
    getTransform = () => this.props.ScreenToLocalTransform().translate(-this._facetWidth, 0);
    layoutEngine = () => this._layoutEngine;
    facetWidth = () => this._facetWidth;
    toggleVisibility = action(() => this._collapsed = !this._collapsed);

    @computed get _allFacets() {
        const facets = new Set<string>();
        this.childDocs.forEach(child => Object.keys(Doc.GetProto(child)).forEach(key => facets.add(key)));
        Doc.AreProtosEqual(this.dataDoc, this.props.Document) && this.childDocs.forEach(child => Object.keys(child).forEach(key => facets.add(key)));
        return Array.from(facets);
    }

    /**
     * Responds to clicking the check box in the flyout menu
     */
    facetClick = (facetHeader: string) => {
        const facetCollection = this.props.Document._facetCollection;
        if (facetCollection instanceof Doc) {
            const found = DocListCast(facetCollection.data).findIndex(doc => doc.title === facetHeader);
            if (found !== -1) {
                (facetCollection.data as List<Doc>).splice(found, 1);
                const docFilter = Cast(this.props.Document._docFilters, listSpec("string"));
                if (docFilter) {
                    let index: number;
                    while ((index = docFilter.findIndex(item => item === facetHeader)) !== -1) {
                        docFilter.splice(index, 3);
                    }
                }
                const docRangeFilters = Cast(this.props.Document._docRangeFilters, listSpec("string"));
                if (docRangeFilters) {
                    let index: number;
                    while ((index = docRangeFilters.findIndex(item => item === facetHeader)) !== -1) {
                        docRangeFilters.splice(index, 3);
                    }
                }
            } else {
                const allCollectionDocs = DocListCast(this.dataDoc[this.props.fieldKey]);
                const facetValues = Array.from(allCollectionDocs.reduce((set, child) =>
                    set.add(Field.toString(child[facetHeader] as Field)), new Set<string>()));

                let nonNumbers = 0;
                let minVal = Number.MAX_VALUE, maxVal = -Number.MAX_VALUE;
                facetValues.map(val => {
                    const num = Number(val);
                    if (Number.isNaN(num)) {
                        nonNumbers++;
                    } else {
                        minVal = Math.min(num, minVal);
                        maxVal = Math.max(num, maxVal);
                    }
                });
                if (nonNumbers / allCollectionDocs.length < .1) {
                    const ranged = Doc.readDocRangeFilter(this.props.Document, facetHeader);
                    const newFacet = Docs.Create.SliderDocument({ title: facetHeader });
                    Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                    newFacet.treeViewExpandedView = "layout";
                    newFacet.treeViewOpen = true;
                    newFacet._sliderMin = ranged === undefined ? minVal : ranged[0];
                    newFacet._sliderMax = ranged === undefined ? maxVal : ranged[1];
                    newFacet._sliderMinThumb = minVal;
                    newFacet._sliderMaxThumb = maxVal;
                    newFacet.target = this.props.Document;
                    const scriptText = `setDocFilterRange(this.target, "${facetHeader}", range)`;
                    newFacet.onThumbChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, range: "number" });

                    Doc.AddDocToList(facetCollection, "data", newFacet);
                } else {
                    const newFacet = Docs.Create.TreeDocument([], { title: facetHeader, treeViewOpen: true, isFacetFilter: true });
                    const capturedVariables = { layoutDoc: this.props.Document, dataDoc: this.dataDoc };
                    const params = { layoutDoc: Doc.name, dataDoc: Doc.name, };
                    newFacet.data = ComputedField.MakeFunction(`readFacetData(layoutDoc, dataDoc, "${this.props.fieldKey}", "${facetHeader}")`, params, capturedVariables);
                    Doc.AddDocToList(facetCollection, "data", newFacet);
                }
            }
        }
    }

    menuCallback = (x: number, y: number) => {
        ContextMenu.Instance.clearItems();
        const docItems: ContextMenuProps[] = [];
        const keySet: Set<string> = new Set();

        this.childLayoutPairs.map(pair => this._allFacets.filter(fieldKey =>
            pair.layout[fieldKey] instanceof RichTextField ||
            typeof (pair.layout[fieldKey]) === "number" ||
            typeof (pair.layout[fieldKey]) === "string").map(fieldKey => keySet.add(fieldKey)));
        Array.from(keySet).map(fieldKey =>
            docItems.push({ description: ":" + fieldKey, event: () => this.props.Document._pivotField = fieldKey, icon: "compress-arrows-alt" }));
        docItems.push({ description: ":(null)", event: () => this.props.Document._pivotField = undefined, icon: "compress-arrows-alt" });
        ContextMenu.Instance.addItem({ description: "Pivot Fields ...", subitems: docItems, icon: "eye" });
        const pt = this.props.ScreenToLocalTransform().inverse().transformPoint(x, y);
        ContextMenu.Instance.displayMenu(x, y, ":");
    }

    onPointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, action((e: PointerEvent, down: number[], delta: number[]) => {
            this._facetWidth = Math.max(this.props.ScreenToLocalTransform().transformPoint(e.clientX,0)[0], 0);
            return false;
        }), returnFalse, () => this._facetWidth = this._facetWidth < 15 ? 200 : 0);
    }

    onMinDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, action((e: PointerEvent, down: number[], delta: number[]) => {
            const minReq = NumCast(this.props.Document[this.props.fieldKey + "-timelineMinReq"], NumCast(this.props.Document[this.props.fieldKey + "-timelineMin"], 0));
            const maxReq = NumCast(this.props.Document[this.props.fieldKey + "-timelineMaxReq"], NumCast(this.props.Document[this.props.fieldKey + "-timelineMax"], 10));
            this.props.Document[this.props.fieldKey + "-timelineMinReq"] = minReq + (maxReq - minReq) * delta[0] / this.props.PanelWidth();
            this.props.Document[this.props.fieldKey + "-timelineSpan"] = undefined;
            return false;
        }), returnFalse, emptyFunction);
    }

    onMaxDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, action((e: PointerEvent, down: number[], delta: number[]) => {
            const minReq = NumCast(this.props.Document[this.props.fieldKey + "-timelineMinReq"], NumCast(this.props.Document[this.props.fieldKey + "-timelineMin"], 0));
            const maxReq = NumCast(this.props.Document[this.props.fieldKey + "-timelineMaxReq"], NumCast(this.props.Document[this.props.fieldKey + "-timelineMax"], 10));
            this.props.Document[this.props.fieldKey + "-timelineMaxReq"] = maxReq + (maxReq - minReq) * delta[0] / this.props.PanelWidth();
            return false;
        }), returnFalse, emptyFunction);
    }

    onMidDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, action((e: PointerEvent, down: number[], delta: number[]) => {
            const minReq = NumCast(this.props.Document[this.props.fieldKey + "-timelineMinReq"], NumCast(this.props.Document[this.props.fieldKey + "-timelineMin"], 0));
            const maxReq = NumCast(this.props.Document[this.props.fieldKey + "-timelineMaxReq"], NumCast(this.props.Document[this.props.fieldKey + "-timelineMax"], 10));
            this.props.Document[this.props.fieldKey + "-timelineMinReq"] = minReq - (maxReq - minReq) * delta[0] / this.props.PanelWidth();
            this.props.Document[this.props.fieldKey + "-timelineMaxReq"] = maxReq - (maxReq - minReq) * delta[0] / this.props.PanelWidth();
            return false;
        }), returnFalse, emptyFunction);
    }

    @computed get contents() {
        return <div className="collectionTimeView-innards" key="timeline" style={{ width: this.bodyPanelWidth() }}>
            <CollectionFreeFormView  {...this.props} layoutEngine={this.layoutEngine} ScreenToLocalTransform={this.getTransform} PanelWidth={this.bodyPanelWidth} />
        </div>;
    }
    @computed get filterView() {
        trace();
        const facetCollection = Cast(this.props.Document?._facetCollection, Doc, null);
        const flyout = (
            <div className="collectionTimeView-flyout" style={{ width: `${this._facetWidth}`, height: this.props.PanelHeight() - 30 }} onWheel={e => e.stopPropagation()}>
                {this._allFacets.map(facet => <label className="collectionTimeView-flyout-item" key={`${facet}`} onClick={e => this.facetClick(facet)}>
                    <input type="checkbox" onChange={e => { }} checked={DocListCast((this.props.Document._facetCollection as Doc)?.data).some(d => d.title === facet)} />
                    <span className="checkmark" />
                    {facet}
                </label>)}
            </div>
        );
        return <div className="collectionTimeView-treeView" style={{ width: `${this._facetWidth}px`, overflow: this._facetWidth < 15 ? "hidden" : undefined }}>
            <div className="collectionTimeView-addFacet" style={{ width: `${this._facetWidth}px` }} onPointerDown={e => e.stopPropagation()}>
                <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout}>
                    <div className="collectionTimeView-button">
                        <span className="collectionTimeView-span">Facet Filters</span>
                        <FontAwesomeIcon icon={faEdit} size={"lg"} />
                    </div>
                </Flyout>
            </div>
            <div className="collectionTimeView-tree" key="tree">
                <CollectionTreeView {...this.props} PanelWidth={this.facetWidth} DataDoc={undefined} Document={facetCollection} />
            </div>
        </div>;
    }

    public static SyncTimelineToPresentation(doc: Doc) {
        const fieldKey = Doc.LayoutFieldKey(doc);
        doc[fieldKey + "-timelineCur"] = ComputedField.MakeFunction("(curPresentationItem()[this._pivotField || 'year'] || 0)");
    }
    specificMenu = (e: React.MouseEvent) => {
        const layoutItems: ContextMenuProps[] = [];
        const doc = this.props.Document;

        layoutItems.push({ description: "Force Timeline", event: () => { doc._forceRenderEngine = "timeline"; }, icon: "compress-arrows-alt" });
        layoutItems.push({ description: "Force Pivot", event: () => { doc._forceRenderEngine = "pivot"; }, icon: "compress-arrows-alt" });
        layoutItems.push({ description: "Auto Time/Pivot layout", event: () => { doc._forceRenderEngine = undefined; }, icon: "compress-arrows-alt" });
        layoutItems.push({ description: "Sync with presentation", event: () => CollectionTimeView.SyncTimelineToPresentation(doc), icon: "compress-arrows-alt" });

        ContextMenu.Instance.addItem({ description: "Pivot/Time Options ...", subitems: layoutItems, icon: "eye" });
    }

    render() {
        const newEditableViewProps = {
            GetValue: () => "",
            SetValue: (value: any) => {
                if (value?.length) {
                    this.props.Document._pivotField = value;
                    return true;
                }
                return false;
            },
            showMenuOnLoad: true,
            contents: ":" + StrCast(this.props.Document._pivotField),
            toggle: this.toggleVisibility,
            color: "#f1efeb" // this.props.headingObject ? this.props.headingObject.color : "#f1efeb";
        };

        let nonNumbers = 0;
        this.childDocs.map(doc => {
            const num = NumCast(doc[StrCast(this.props.Document._pivotField)], Number(StrCast(doc[StrCast(this.props.Document._pivotField)])));
            if (Number.isNaN(num)) {
                nonNumbers++;
            }
        });
        const forceLayout = StrCast(this.props.Document._forceRenderEngine);
        const doTimeline = forceLayout ? (forceLayout === "timeline") : nonNumbers / this.childDocs.length < 0.1 && this.props.PanelWidth() / this.props.PanelHeight() > 6;
        if (doTimeline !== (this._layoutEngine === "timeline")) {
            if (!this._changing) {
                this._changing = true;
                setTimeout(action(() => {
                    this._layoutEngine = doTimeline ? "timeline" : "pivot";
                    this._changing = false;
                }), 0);
            }
        }


        const facetCollection = Cast(this.props.Document?._facetCollection, Doc, null);
        return !facetCollection ? (null) :
            <div className={"collectionTimeView" + (doTimeline ? "" : "-pivot")} onContextMenu={this.specificMenu}
                style={{ height: `calc(100%  - ${this.props.Document._chromeStatus === "enabled" ? 51 : 0}px)` }}>
                <div className={"pivotKeyEntry"}>
                    <button className="collectionTimeView-backBtn"
                        onClick={action(() => {
                            let prevFilterIndex = NumCast(this.props.Document._prevFilterIndex);
                            if (prevFilterIndex > 0) {
                                prevFilterIndex--;
                                this.props.Document._docFilters = ObjectField.MakeCopy(this.props.Document["_prevDocFilter" + prevFilterIndex] as ObjectField);
                                this.props.Document._docRangeFilters = ObjectField.MakeCopy(this.props.Document["_prevDocRangeFilters" + prevFilterIndex] as ObjectField);
                                this.props.Document._prevFilterIndex = prevFilterIndex;
                            } else {
                                this.props.Document._docFilters = new List([]);
                            }
                        })}>
                        back
                    </button>
                    <EditableView {...newEditableViewProps} display={"inline"} menuCallback={this.menuCallback} />
                </div>
                {!this.props.isSelected() || this.props.PanelHeight() < 100 ? (null) :
                    <div className="collectionTimeView-dragger" key="dragger" onPointerDown={this.onPointerDown} style={{ transform: `translate(${this._facetWidth}px, 0px)` }} >
                        <span title="library View Dragger" style={{ width: "5px", position: "absolute", top: "0" }} />
                    </div>
                }
                {this.filterView}
                {this.contents}
                {!this.props.isSelected() || !doTimeline ? (null) : <>
                    <div className="collectionTimeView-thumb-min collectionTimeView-thumb" key="min" onPointerDown={this.onMinDown} />
                    <div className="collectionTimeView-thumb-max collectionTimeView-thumb" key="mid" onPointerDown={this.onMaxDown} />
                    <div className="collectionTimeView-thumb-mid collectionTimeView-thumb" key="max" onPointerDown={this.onMidDown} />
                </>}
            </div>;
    }
}

Scripting.addGlobal(function pivotColumnClick(pivotDoc: Doc, bounds: ViewDefBounds) {
    let prevFilterIndex = NumCast(pivotDoc._prevFilterIndex);
    pivotDoc["_prevDocFilter" + prevFilterIndex] = ObjectField.MakeCopy(pivotDoc._docFilters as ObjectField);
    pivotDoc["_prevDocRangeFilters" + prevFilterIndex] = ObjectField.MakeCopy(pivotDoc._docRangeFilters as ObjectField);
    pivotDoc._prevFilterIndex = ++prevFilterIndex;
    runInAction(() => {
        pivotDoc._docFilters = new List();
        (bounds.payload as string[]).map(filterVal =>
            Doc.setDocFilter(pivotDoc, StrCast(pivotDoc._pivotField), filterVal, "check"));
    });
});