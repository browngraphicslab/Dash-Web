import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { DataSym, Doc, DocListCast, DocListCastAsync, Field, Opt } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { List } from "../../../fields/List";
import { RichTextField } from "../../../fields/RichTextField";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Cast, StrCast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnOne, returnZero, returnTrue } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionTreeView } from "../collections/CollectionTreeView";
import { ViewBoxBaseComponent } from "../DocComponent";
import { SearchBox } from "../search/SearchBox";
import { FieldView, FieldViewProps } from './FieldView';
import './FilterBox.scss';
import { Scripting } from "../../util/Scripting";
import { values } from "lodash";
import { tokenToString } from "typescript";
import { SelectionManager } from "../../util/SelectionManager";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;
import Select from "react-select";
import { UserOptions } from "../../util/GroupManager";
import { DocumentViewProps } from "./DocumentView";
import { DefaultStyleProvider, StyleProp } from "../StyleProvider";
import { CollectionViewType } from "../collections/CollectionView";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";

type FilterBoxDocument = makeInterface<[typeof documentSchema]>;
const FilterBoxDocument = makeInterface(documentSchema);

@observer
export class FilterBox extends ViewBoxBaseComponent<FieldViewProps, FilterBoxDocument>(FilterBoxDocument) {

    static Instance: FilterBox;

    constructor(props: Readonly<FieldViewProps>) {
        super(props);
        FilterBox.Instance = this;
        const targetDoc = FilterBox._filterScope === "Current Collection" ? SelectionManager.Views()[0].Document || CollectionDockingView.Instance.props.Document : CollectionDockingView.Instance.props.Document;
        if (!targetDoc) CurrentUserUtils.setupFilterDocs(targetDoc);
    }
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(FilterBox, fieldKey); }

    public _filterBoolean = "AND";
    @observable public static _filterScope = "Current Dashboard";
    public _filterSelected = false;
    public _filterMatch = "matched";

    @observable private showFilterDialog = false;

    @computed get targetDoc() {
        return FilterBox._filterScope === "Current Collection" ? SelectionManager.Views()[0].Document || CollectionDockingView.Instance.props.Document : CollectionDockingView.Instance.props.Document;
    }

    @computed get allDocs() {
        const allDocs = new Set<Doc>();
        const targetDoc = FilterBox._filterScope === "Current Collection" ? SelectionManager.Views()[0].Document || CollectionDockingView.Instance.props.Document : CollectionDockingView.Instance.props.Document;
        if (targetDoc) {
            const activeTabs = DocListCast(targetDoc.data);
            SearchBox.foreachRecursiveDoc(activeTabs, (doc: Doc) => allDocs.add(doc));
            setTimeout(() => targetDoc.allDocuments = new List<Doc>(Array.from(allDocs)));
        }
        return allDocs;
    }

    @computed get _allFacets() {
        const noviceReqFields = ["author", "tags", "text", "type"];
        const noviceLayoutFields: string[] = [];//["_curPage"];
        const noviceFields = [...noviceReqFields, ...noviceLayoutFields];

        const keys = new Set<string>(noviceFields);
        this.allDocs.forEach(doc => SearchBox.documentKeys(doc).filter(key => keys.add(key)));
        return Array.from(keys.keys()).filter(key => key[0]).filter(key => key[0] === "#" || key.indexOf("lastModified") !== -1 || (key[0] === key[0].toUpperCase() && !key.startsWith("_")) || noviceFields.includes(key) || !Doc.UserDoc().noviceMode).sort();
    }


    /**
     * The current attributes selected to filter based on
     */
    @computed get activeAttributes() {
        return DocListCast(this.dataDoc[this.props.fieldKey]);
    }

    @computed get currentFacets() {
        return this.activeAttributes.map(attribute => StrCast(attribute.title));
    }

    gatherFieldValues(dashboard: Doc, facetKey: string) {
        const childDocs = DocListCast((dashboard.data as any)[0].data);
        const valueSet = new Set<string>();
        let rtFields = 0;
        childDocs.forEach((d) => {
            const facetVal = d[facetKey];
            if (facetVal instanceof RichTextField) rtFields++;
            valueSet.add(Field.toString(facetVal as Field));
            const fieldKey = Doc.LayoutFieldKey(d);
            const annos = !Field.toString(Doc.LayoutField(d) as Field).includes("CollectionView");
            const data = d[annos ? fieldKey + "-annotations" : fieldKey];
            if (data !== undefined) {
                let subDocs = DocListCast(data);
                if (subDocs.length > 0) {
                    let newarray: Doc[] = [];
                    while (subDocs.length > 0) {
                        newarray = [];
                        subDocs.forEach((t) => {
                            const facetVal = t[facetKey];
                            if (facetVal instanceof RichTextField) rtFields++;
                            facetVal && valueSet.add(Field.toString(facetVal as Field));
                            const fieldKey = Doc.LayoutFieldKey(t);
                            const annos = !Field.toString(Doc.LayoutField(t) as Field).includes("CollectionView");
                            DocListCast(t[annos ? fieldKey + "-annotations" : fieldKey]).forEach((newdoc) => newarray.push(newdoc));
                        });
                        subDocs = newarray;
                    }
                }
            }
        });
        return { strings: Array.from(valueSet.keys()), rtFields };
    }

    public removeFilter = (filterName: string) => {
        console.log("remove filter");
        const targetDoc = FilterBox._filterScope === "Current Collection" ? SelectionManager.Views()[0].Document || CollectionDockingView.Instance.props.Document : CollectionDockingView.Instance.props.Document;
        const filterDoc = targetDoc.currentFilter as Doc;
        const attributes = DocListCast(filterDoc["data"]);
        const found = attributes.findIndex(doc => doc.title === filterName);
        if (found !== -1) {
            (filterDoc["data"] as List<Doc>).splice(found, 1);
            const docFilter = Cast(targetDoc._docFilters, listSpec("string"));
            if (docFilter) {
                let index: number;
                while ((index = docFilter.findIndex(item => item.split(":")[0] === filterName)) !== -1) {
                    docFilter.splice(index, 1);
                }
            }
            const docRangeFilters = Cast(targetDoc._docRangeFilters, listSpec("string"));
            if (docRangeFilters) {
                let index: number;
                while ((index = docRangeFilters.findIndex(item => item.split(":")[0] === filterName)) !== -1) {
                    docRangeFilters.splice(index, 3);
                }
            }
        }
    }

    /**
     * Responds to clicking the check box in the flyout menu
     */
    facetClick = (facetHeader: string) => {

        console.log("facetClick: " + facetHeader);
        console.log(this.props.fieldKey);

        const targetDoc = FilterBox._filterScope === "Current Collection" ? SelectionManager.Views()[0].Document || CollectionDockingView.Instance.props.Document : CollectionDockingView.Instance.props.Document;
        // const targetDoc = SelectionManager.Views()[0].props.Document;
        const found = this.activeAttributes.findIndex(doc => doc.title === facetHeader);
        if (found !== -1) {
            // (this.dataDoc[this.props.fieldKey] as List<Doc>).splice(found, 1);
            // const docFilter = Cast(targetDoc._docFilters, listSpec("string"));
            // if (docFilter) {
            //     let index: number;
            //     while ((index = docFilter.findIndex(item => item.split(":")[0] === facetHeader)) !== -1) {
            //         docFilter.splice(index, 1);
            //     }
            // }
            // const docRangeFilters = Cast(targetDoc._docRangeFilters, listSpec("string"));
            // if (docRangeFilters) {
            //     let index: number;
            //     while ((index = docRangeFilters.findIndex(item => item.split(":")[0] === facetHeader)) !== -1) {
            //         docRangeFilters.splice(index, 3);
            //     }
            // }
        } else {
            const allCollectionDocs = DocListCast((targetDoc.data as any)[0].data);
            const facetValues = this.gatherFieldValues(targetDoc, facetHeader);

            let nonNumbers = 0;
            let minVal = Number.MAX_VALUE, maxVal = -Number.MAX_VALUE;
            facetValues.strings.map(val => {
                const num = Number(val);
                if (Number.isNaN(num)) {
                    nonNumbers++;
                } else {
                    minVal = Math.min(num, minVal);
                    maxVal = Math.max(num, maxVal);
                }
            });
            let newFacet: Opt<Doc>;
            if (facetHeader === "text" || facetValues.rtFields / allCollectionDocs.length > 0.1) {
                newFacet = Docs.Create.TextDocument("", { _width: 100, _height: 25, system: true, _stayInCollection: true, _hideContextMenu: true, treeViewExpandedView: "layout", title: facetHeader, treeViewOpen: true, _forceActive: true, ignoreClick: true });
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                newFacet._textBoxPadding = 4;
                const scriptText = `setDocFilter(this?.target, "${facetHeader}", text, "match")`;
                newFacet.onTextChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, text: "string" });
            } else if (facetHeader !== "tags" && nonNumbers / facetValues.strings.length < .1) {
                newFacet = Docs.Create.SliderDocument({ title: facetHeader, _overflow: "visible", _height: 40, _stayInCollection: true, _hideContextMenu: true, treeViewExpandedView: "layout", treeViewOpen: true });
                const newFacetField = Doc.LayoutFieldKey(newFacet);
                const ranged = Doc.readDocRangeFilter(targetDoc, facetHeader);
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                const extendedMinVal = minVal - Math.min(1, Math.abs(maxVal - minVal) * .05);
                const extendedMaxVal = maxVal + Math.min(1, Math.abs(maxVal - minVal) * .05);
                newFacet[newFacetField + "-min"] = ranged === undefined ? extendedMinVal : ranged[0];
                newFacet[newFacetField + "-max"] = ranged === undefined ? extendedMaxVal : ranged[1];
                Doc.GetProto(newFacet)[newFacetField + "-minThumb"] = extendedMinVal;
                Doc.GetProto(newFacet)[newFacetField + "-maxThumb"] = extendedMaxVal;
                const scriptText = `setDocFilterRange(this?.target, "${facetHeader}", range)`;
                newFacet.onThumbChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, range: "number" });
            } else {
                newFacet = new Doc();
                newFacet.sytem = true;
                newFacet.title = facetHeader;
                newFacet.treeViewOpen = true;
                newFacet.type = DocumentType.COL;
                const capturedVariables = { layoutDoc: targetDoc, system: true, _stayInCollection: true, _hideContextMenu: true, dataDoc: (targetDoc.data as any)[0][DataSym] };
                newFacet.data = ComputedField.MakeFunction(`readFacetData(layoutDoc, "${facetHeader}")`, {}, capturedVariables);
            }
            newFacet && Doc.AddDocToList(this.dataDoc, this.props.fieldKey, newFacet);
        }
    }

    @computed get scriptField() {
        const scriptText = "setDocFilter(this?.target, heading, this.title, checked)";
        const script = ScriptField.MakeScript(scriptText, { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name });
        return script ? () => script : undefined;
    }

    @action
    changeBool = (e: any) => {
        this._filterBoolean = e.currentTarget.value;
        console.log(this._filterBoolean);
    }

    @action
    changeScope = (e: any) => {
        FilterBox._filterScope = e.currentTarget.value;
        console.log(FilterBox._filterScope);
    }

    @action
    changeMatch = (e: any) => {
        this._filterMatch = e.currentTarget.value;
        console.log(this._filterMatch);
    }
    @action
    changeSelected = () => {
        if (this._filterSelected) {
            this._filterSelected = false;
            SelectionManager.DeselectAll();
        } else {
            this._filterSelected = true;
            // helper method to select specified docs
        }
        console.log(this._filterSelected);
    }

    FilteringStyleProvider(doc: Opt<Doc>, props: Opt<FieldViewProps | DocumentViewProps>, property: string) {
        switch (property.split(":")[0]) {
            case StyleProp.Decorations:
                if (doc) {
                    return doc._viewType === CollectionViewType.Docking || (Doc.IsSystem(doc)) ? (null) :
                        <>
                            <div style={{ marginRight: "5px", fontSize: "10px" }}>
                                <select className="filterBox-selection">
                                    <option value="Is" key="Is">Is</option>
                                    <option value="Is Not" key="Is Not">Is Not</option>
                                </select>
                            </div>
                            <div className="filterBox-treeView-close" onClick={e => this.removeFilter(StrCast(doc.title))}>
                                <FontAwesomeIcon icon={"times"} size="sm" />
                            </div>
                        </>;
                }
            default: return DefaultStyleProvider(doc, props, property);

        }
    }

    suppressChildClick = () => ScriptField.MakeScript("")!;

    saveFilter = () => {
        // const doc: Doc = new Doc;
        // for (const key of Object.keys(this.props.Document)) {
        //     doc[key] = SerializationHelper.Serialize(this.props.Document[key] as Field);
        // }
        // console.log(doc);
        runInAction(() => this.showFilterDialog = true);
        console.log("saved filter");
    }

    onTitleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.props.Document.title = e.currentTarget.value || `FilterDoc for ${SelectionManager.Views()[0].Document.title}`;
    }

    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            runInAction(() => this.showFilterDialog = false);
            Doc.AddDocToList(Doc.UserDoc(), "savedFilters", this.props.Document);
        }
    }

    render() {
        const facetCollection = this.props.Document;

        const flyout = DocListCast(Doc.UserDoc().savedFilters).map(doc => {
            // console.log("mapping");
            return <>
                <div className="???" onWheel={e => e.stopPropagation()} style={{ height: 50, border: "2px" }} onPointerDown={() => this.props.updateFilterDoc?.(doc)}>
                    {StrCast(doc.title)}
                </div>
            </>;
        }
        );

        const options = this._allFacets.filter(facet => this.currentFacets.indexOf(facet) === -1).map(facet => ({ value: facet, label: facet }));

        return this.props.dontRegisterView ? (null) : <div className="filterBox-treeView" style={{ width: "100%" }}>

            <div className="filterBox-title">Current FilterDoc: {this.props.Document.title}</div>
            <div className="filterBox-select-bool">
                <select className="filterBox-selection" onChange={e => this.changeBool(e)}>
                    <option value="AND" key="AND">AND</option>
                    <option value="OR" key="OR">OR</option>
                </select>
                <div className="filterBox-select-text">filters in </div>
                <select className="filterBox-selection" onChange={e => this.changeScope(e)}>
                    <option value="Current Dashboard" key="Current Dashboard" selected={"Current Dashboard" === FilterBox._filterScope}>Current Dashboard</option>
                    {/* <option value="Current Tab" key="Current Tab">Current Tab</option> */}
                    <option value="Current Collection" key="Current Collection" selected={"Current Collection" === FilterBox._filterScope}>Current Collection</option>
                </select>
            </div>

            <div className="filterBox-select">
                <Select
                    placeholder="Add a filter..."
                    options={options}
                    isMulti={false}
                    onChange={val => this.facetClick((val as UserOptions).value)}
                    value={null}
                    closeMenuOnSelect={false}
                />
            </div>

            <div className="filterBox-tree" key="tree">
                <CollectionTreeView
                    Document={facetCollection}
                    DataDoc={Doc.GetProto(facetCollection)}
                    fieldKey={this.props.fieldKey}
                    CollectionView={undefined}
                    cantBrush={true}
                    setHeight={returnFalse} // if the tree view can trigger the height of the filter box to change, then this needs to be filled in.
                    onChildClick={this.suppressChildClick}
                    docFilters={returnEmptyFilter}
                    docRangeFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                    ContainingCollectionView={this.props.ContainingCollectionView}
                    PanelWidth={this.props.PanelWidth}
                    PanelHeight={this.props.PanelHeight}
                    rootSelected={this.props.rootSelected}
                    renderDepth={1}
                    dropAction={this.props.dropAction}
                    ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    isSelected={returnFalse}
                    select={returnFalse}
                    bringToFront={emptyFunction}
                    active={returnTrue}
                    parentActive={returnFalse}
                    whenActiveChanged={returnFalse}
                    treeViewHideTitle={true}
                    focus={returnFalse}
                    treeViewHideHeaderFields={true}
                    onCheckedClick={this.scriptField}
                    dontRegisterView={true}
                    styleProvider={this.props.styleProvider}
                    layerProvider={this.props.layerProvider}
                    docViewPath={this.props.docViewPath}
                    scriptContext={this.props.scriptContext}
                    moveDocument={returnFalse}
                    removeDocument={returnFalse}
                    addDocument={returnFalse} />
            </div>
            {/* <Flyout className="filterBox-flyout" anchorPoint={anchorPoints.RIGHT_TOP} content={flyout}>
                <div className="filterBox-addWrapper">
                    <div className="filterBox-addFilter"> + add a filter</div>
                </div>
            </Flyout> */}
            <div className="filterBox-bottom">
                <div className="filterBox-select-matched">
                    <input className="filterBox-select-box" type="checkbox"
                        onChange={this.changeSelected} />
                    <div className="filterBox-select-text">select</div>
                    <select className="filterBox-selection" onChange={e => this.changeMatch(e)}>
                        <option value="matched" key="matched">matched</option>
                        <option value="unmatched" key="unmatched">unmatched</option>
                    </select>
                    <div className="filterBox-select-text">documents</div>
                </div>

                <div style={{ display: "flex" }}>
                    <div className="filterBox-saveWrapper">
                        <div className="filterBox-saveBookmark"
                            onPointerDown={this.saveFilter}
                        >
                            <div>SAVE</div>
                        </div>
                    </div>
                    <div className="filterBox-saveWrapper">
                        <div className="filterBox-saveBookmark">
                            <Flyout className="myFilters-flyout" anchorPoint={anchorPoints.TOP} content={flyout}>
                                <div>FILTERS</div>
                            </Flyout>
                        </div>
                    </div>
                    <div className="filterBox-saveWrapper">
                        <div className="filterBox-saveBookmark"
                            onPointerDown={this.props.createNewFilterDoc}
                        >
                            <div>NEW</div>
                        </div>
                    </div>
                </div>
                {!this.showFilterDialog ? (null) :
                    <input
                        className="filterBox-dialog-input"
                        placeholder="Enter name of filterDoc"
                        onChange={this.onTitleValueChange}
                        onKeyDown={this.onKeyDown}
                    />
                }
            </div>
        </div>;
    }
}

Scripting.addGlobal(function determineCheckedState(layoutDoc: Doc, facetHeader: string, facetValue: string) {
    const docFilters = Cast(layoutDoc._docFilters, listSpec("string"), []);
    for (const filter of docFilters) {
        const fields = filter.split(":"); // split into key:value:modifiers
        if (fields[0] === facetHeader && fields[1] === facetValue) {
            return fields[2];
        }
    }
    return undefined;
});
Scripting.addGlobal(function readFacetData(layoutDoc: Doc, facetHeader: string) {
    const allCollectionDocs = DocListCast(CollectionDockingView.Instance?.props.Document.allDocuments);
    const set = new Set<string>();
    if (facetHeader === "tags") allCollectionDocs.forEach(child => Field.toString(child[facetHeader] as Field).split(":").forEach(key => set.add(key)));
    else allCollectionDocs.forEach(child => set.add(Field.toString(child[facetHeader] as Field)));
    const facetValues = Array.from(set).filter(v => v);

    let nonNumbers = 0;
    facetValues.map(val => Number.isNaN(Number(val)) && nonNumbers++);
    const facetValueDocSet = (nonNumbers / facetValues.length > .1 ? facetValues.sort() : facetValues.sort((n1: string, n2: string) => Number(n1) - Number(n2))).map(facetValue => {
        const doc = new Doc();
        doc.system = true;
        doc.title = facetValue.toString();
        doc.treeViewChecked = ComputedField.MakeFunction("determineCheckedState(layoutDoc, facetHeader, facetValue)", {}, { layoutDoc, facetHeader, facetValue });
        return doc;
    });
    return new List<Doc>(facetValueDocSet);
});