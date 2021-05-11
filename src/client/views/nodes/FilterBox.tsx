import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import Select from "react-select";
import { Doc, DocListCast, DocListCastAsync, Field, HeightSym, Opt } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { List } from "../../../fields/List";
import { RichTextField } from "../../../fields/RichTextField";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Cast, StrCast } from "../../../fields/Types";
import { emptyFunction, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnTrue } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { UserOptions } from "../../util/GroupManager";
import { Scripting } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { CollectionTreeView } from "../collections/CollectionTreeView";
import { CollectionView } from "../collections/CollectionView";
import { ViewBoxBaseComponent } from "../DocComponent";
import { EditableView } from "../EditableView";
import { SearchBox } from "../search/SearchBox";
import { DashboardToggleButton, DefaultStyleProvider, StyleProp } from "../StyleProvider";
import { DocumentViewProps } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import './FilterBox.scss';
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

type FilterBoxDocument = makeInterface<[typeof documentSchema]>;
const FilterBoxDocument = makeInterface(documentSchema);

@observer
export class FilterBox extends ViewBoxBaseComponent<FieldViewProps, FilterBoxDocument>(FilterBoxDocument) {

    constructor(props: Readonly<FieldViewProps>) {
        super(props);
        const targetDoc = FilterBox.targetDoc;
        if (targetDoc && !targetDoc.currentFilter) CurrentUserUtils.setupFilterDocs(targetDoc);
    }
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(FilterBox, fieldKey); }

    public _filterSelected = false;
    public _filterMatch = "matched";

    @computed static get currentContainingCollectionDoc() {
        let docView: any = SelectionManager.Views()[0];
        let doc = docView.Document;

        while (docView && doc && doc.type !== "collection") {
            doc = docView.props.ContainingCollectionDoc;
            docView = docView.props.ContainingCollectionView;
        }

        return doc;
    }

    // /**
    //  * @returns the relevant doc according to the value of FilterBox._filterScope i.e. either the Current Dashboard or the Current Collection
    //  */


    // trying to get this to work rather than the version below this

    // @computed static get targetDoc() {
    //     console.log(FilterBox.currentContainingCollectionDoc.type);
    //     if (FilterBox._filterScope === "Current Collection") {
    //         return FilterBox.currentContainingCollectionDoc;
    //     }
    //     else return CollectionDockingView.Instance.props.Document;
    //     // return FilterBox._filterScope === "Current Collection" ? SelectionManager.Views()[0].Document || CollectionDockingView.Instance.props.Document : CollectionDockingView.Instance.props.Document;
    // }


    /**
    * @returns the relevant doc according to the value of FilterBox._filterScope i.e. either the Current Dashboard or the Current Collection
    */
    @computed static get targetDoc() {
        if (SelectionManager.Views().length) {
            return SelectionManager.Views()[0]?.Document.type === DocumentType.COL ? SelectionManager.Views()[0].Document : SelectionManager.Views()[0]?.props.ContainingCollectionDoc!;
        }
        return CurrentUserUtils.ActiveDashboard;
    }

    @observable _loaded = false;
    componentDidMount() {
        reaction(() => DocListCastAsync(this.layoutDoc.data),
            async (activeTabsAsync) => {
                const activeTabs = await activeTabsAsync;
                activeTabs && (await SearchBox.foreachRecursiveDocAsync(activeTabs, emptyFunction));
                runInAction(() => this._loaded = true);
            }, { fireImmediately: true });
    }
    @observable _allDocs = [] as Doc[];
    @computed get allDocs() {
        // trace();
        const targetDoc = FilterBox.targetDoc;
        if (this._loaded && targetDoc) {
            const allDocs = new Set<Doc>();
            const activeTabs = DocListCast(targetDoc.data);
            SearchBox.foreachRecursiveDoc(activeTabs, (doc: Doc) => allDocs.add(doc));
            setTimeout(action(() => this._allDocs = Array.from(allDocs)));
        }
        return this._allDocs;
    }

    @computed get _allFacets() {
        // trace();
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

    /**
     * @returns a string array of the current attributes
     */
    @computed get currentFacets() {
        return this.activeAttributes.map(attribute => StrCast(attribute.title));
    }

    gatherFieldValues(dashboard: Doc, facetKey: string) {
        const childDocs = DocListCast(dashboard.data);
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
                            facetVal !== undefined && valueSet.add(Field.toString(facetVal as Field));
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
    removeFilterDoc = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).map(doc => this.removeFilter(StrCast(doc.title))).length ? true : false;
    public removeFilter = (filterName: string) => {
        const targetDoc = FilterBox.targetDoc;
        const filterDoc = targetDoc.currentFilter as Doc;
        const attributes = DocListCast(filterDoc.data);
        const found = attributes.findIndex(doc => doc.title === filterName);
        if (found !== -1) {
            (filterDoc.data as List<Doc>).splice(found, 1);
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
        return true;
    }
    /**
     * Responds to clicking the check box in the flyout menu
     */
    facetClick = (facetHeader: string) => {
        const targetDoc = FilterBox.targetDoc;
        const found = this.activeAttributes.findIndex(doc => doc.title === facetHeader);
        if (found !== -1) {
            this.removeFilter(facetHeader);
        } else {
            const allCollectionDocs = DocListCast((targetDoc.data as any)[0].data);
            const facetValues = this.gatherFieldValues(targetDoc, facetHeader);

            let nonNumbers = 0;
            let minVal = Number.MAX_VALUE, maxVal = -Number.MAX_VALUE;
            facetValues.strings.map(val => {
                const num = val ? Number(val) : Number.NaN;
                if (Number.isNaN(num)) {
                    nonNumbers++;
                } else {
                    minVal = Math.min(num, minVal);
                    maxVal = Math.max(num, maxVal);
                }
            });
            let newFacet: Opt<Doc>;
            if (facetHeader === "text" || facetValues.rtFields / allCollectionDocs.length > 0.1) {
                newFacet = Docs.Create.TextDocument("", {
                    title: facetHeader, system: true, target: targetDoc, _width: 100, _height: 25, _stayInCollection: true,
                    treeViewExpandedView: "layout", _treeViewOpen: true, _forceActive: true, ignoreClick: true
                });
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                newFacet._textBoxPadding = 4;
                const scriptText = `setDocFilter(this?.target, "${facetHeader}", text, "match")`;
                newFacet.onTextChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, text: "string" });
            } else if (facetHeader !== "tags" && nonNumbers / facetValues.strings.length < .1) {
                newFacet = Docs.Create.SliderDocument({
                    title: facetHeader, system: true, target: targetDoc, _fitWidth: true, _height: 40, _stayInCollection: true,
                    treeViewExpandedView: "layout", _treeViewOpen: true, _forceActive: true, _overflow: "visible",
                });
                const newFacetField = Doc.LayoutFieldKey(newFacet);
                const ranged = Doc.readDocRangeFilter(targetDoc, facetHeader);
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                const extendedMinVal = minVal - Math.min(1, Math.floor(Math.abs(maxVal - minVal) * .1));
                const extendedMaxVal = Math.max(minVal + 1, maxVal + Math.min(1, Math.ceil(Math.abs(maxVal - minVal) * .05)));
                newFacet[newFacetField + "-min"] = ranged === undefined ? extendedMinVal : ranged[0];
                newFacet[newFacetField + "-max"] = ranged === undefined ? extendedMaxVal : ranged[1];
                Doc.GetProto(newFacet)[newFacetField + "-minThumb"] = extendedMinVal;
                Doc.GetProto(newFacet)[newFacetField + "-maxThumb"] = extendedMaxVal;
                const scriptText = `setDocRangeFilter(this?.target, "${facetHeader}", range)`;
                newFacet.onThumbChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, range: "number" });
            } else {
                newFacet = new Doc();
                newFacet.system = true;
                newFacet.title = facetHeader;
                newFacet.treeViewOpen = true;
                newFacet.layout = CollectionView.LayoutString("data");
                newFacet.layoutKey = "layout";
                newFacet.type = DocumentType.COL;
                newFacet.target = targetDoc;
                newFacet.data = ComputedField.MakeFunction(`readFacetData(self.target, "${facetHeader}")`);
            }
            newFacet.hideContextMenu = true;
            Doc.AddDocToList(this.dataDoc, this.props.fieldKey, newFacet);
        }
    }

    @computed get scriptField() {
        const scriptText = "setDocFilter(this?.target, heading, this.title, checked)";
        const script = ScriptField.MakeScript(scriptText, { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name });
        return script ? () => script : undefined;
    }

    /**
     * Sets whether filters are ANDed or ORed together
     */
    @action
    changeBool = (e: any) => {
        (FilterBox.targetDoc.currentFilter as Doc).filterBoolean = e.currentTarget.value;
    }

    /**
     * Changes whether to select matched or unmatched documents
     */
    @action
    changeMatch = (e: any) => {
        this._filterMatch = e.currentTarget.value;
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
    }

    FilteringStyleProvider(doc: Opt<Doc>, props: Opt<FieldViewProps | DocumentViewProps>, property: string) {
        switch (property.split(":")[0]) {
            case StyleProp.Decorations:
                if (doc && !doc.treeViewHideHeaderFields) {
                    return <>
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
        }
        return DefaultStyleProvider(doc, props, property);
    }

    suppressChildClick = () => ScriptField.MakeScript("")!;

    /**
     * Adds a filterDoc to the list of saved filters
     */
    saveFilter = () => {
        Doc.AddDocToList(Doc.UserDoc(), "savedFilters", this.props.Document);
    }

    /**
     * Changes the title of the filterDoc
     */
    onTitleValueChange = (val: string) => {
        this.props.Document.title = val || `FilterDoc for ${FilterBox.targetDoc.title}`;
        return true;
    }

    /**
     * The flyout from which you can select a saved filter to apply
     */
    @computed get flyoutPanel() {
        return DocListCast(Doc.UserDoc().savedFilters).map(doc => {
            return <>
                <div className="filterBox-tempFlyout" onWheel={e => e.stopPropagation()} style={{ height: 50, border: "2px" }} onPointerDown={() => this.props.updateFilterDoc?.(doc)}>
                    {StrCast(doc.title)}
                </div>
            </>;
        }
        );
    }
    setTreeHeight = (hgt: number) => {
        this.layoutDoc._height = hgt + 140; // 50?  need to add all the border sizes together.
    }

    /**
     * add lock and hide button decorations for the "Dashboards" flyout TreeView
     */
    FilterStyleProvider = (doc: Opt<Doc>, props: Opt<FieldViewProps | DocumentViewProps>, property: string) => {
        if (property.split(":")[0] === StyleProp.Decorations) {
            return !doc || doc.treeViewHideHeaderFields ? (null) :
                DashboardToggleButton(doc, "hidden", "trash", "trash", () => this.removeFilter(StrCast(doc.title)));
        }
        return this.props.styleProvider?.(doc, props, property);
    }

    layoutHeight = () => this.layoutDoc[HeightSym]();
    render() {
        const facetCollection = this.props.Document;

        const options = this._allFacets.filter(facet => this.currentFacets.indexOf(facet) === -1).map(facet => ({ value: facet, label: facet }));
        return this.props.dontRegisterView ? (null) : <div className="filterBox-treeView" style={{ width: "100%" }}>

            <div className="filterBox-title">
                <EditableView
                    key="editableView"
                    contents={this.props.Document.title}
                    height={24}
                    fontSize={15}
                    GetValue={() => StrCast(this.props.Document.title)}
                    SetValue={this.onTitleValueChange}
                />
            </div>

            <div className="filterBox-select-bool">
                <select className="filterBox-selection" onChange={this.changeBool}>
                    <option value="AND" key="AND" selected={(FilterBox.targetDoc.currentFilter as Doc)?.filterBoolean === "AND"}>AND</option>
                    <option value="OR" key="OR" selected={(FilterBox.targetDoc.currentFilter as Doc)?.filterBoolean === "OR"}>OR</option>
                </select>
                <div className="filterBox-select-text">filters together</div>
            </div>

            <div className="filterBox-select">
                <Select
                    placeholder="Add a filter..."
                    options={options}
                    isMulti={false}
                    onChange={val => this.facetClick((val as UserOptions).value)}
                    value={null}
                    closeMenuOnSelect={true}
                />
            </div>

            <div className="filterBox-tree" key="tree">
                <CollectionTreeView
                    Document={facetCollection}
                    DataDoc={Doc.GetProto(facetCollection)}
                    fieldKey={this.props.fieldKey}
                    CollectionView={undefined}
                    disableDocBrushing={true}
                    setHeight={this.setTreeHeight} // if the tree view can trigger the height of the filter box to change, then this needs to be filled in.
                    docFilters={returnEmptyFilter}
                    docRangeFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                    ContainingCollectionView={this.props.ContainingCollectionView}
                    PanelWidth={this.props.PanelWidth}
                    PanelHeight={this.layoutHeight}
                    rootSelected={this.props.rootSelected}
                    renderDepth={1}
                    dropAction={this.props.dropAction}
                    ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    isSelected={returnFalse}
                    select={returnFalse}
                    bringToFront={emptyFunction}
                    isContentActive={returnTrue}
                    whenChildContentsActiveChanged={returnFalse}
                    treeViewHideTitle={true}
                    focus={returnFalse}
                    treeViewHideHeaderFields={false}
                    onCheckedClick={this.scriptField}
                    dontRegisterView={true}
                    styleProvider={this.FilterStyleProvider}
                    layerProvider={this.props.layerProvider}
                    docViewPath={this.props.docViewPath}
                    scriptContext={this.props.scriptContext}
                    moveDocument={returnFalse}
                    removeDocument={this.removeFilterDoc}
                    addDocument={returnFalse} />
            </div>
            <div className="filterBox-bottom">
                {/* <div className="filterBox-select-matched">
                    <input className="filterBox-select-box" type="checkbox"
                        onChange={this.changeSelected} />
                    <div className="filterBox-select-text">select</div>
                    <select className="filterBox-selection" onChange={e => this.changeMatch(e)}>
                        <option value="matched" key="matched">matched</option>
                        <option value="unmatched" key="unmatched">unmatched</option>
                    </select>
                    <div className="filterBox-select-text">documents</div>
                </div> */}

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
                            <Flyout className="myFilters-flyout" anchorPoint={anchorPoints.TOP} content={this.flyoutPanel}>
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
    const allCollectionDocs = new Set<Doc>();
    const activeTabs = DocListCast(layoutDoc.data);
    SearchBox.foreachRecursiveDoc(activeTabs, (doc: Doc) => allCollectionDocs.add(doc));
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
        doc.target = layoutDoc;
        doc.facetHeader = facetHeader;
        doc.facetValue = facetValue;
        doc.treeViewHideHeaderFields = true;
        doc.treeViewChecked = ComputedField.MakeFunction("determineCheckedState(self.target, self.facetHeader, self.facetValue)");
        return doc;
    });
    return new List<Doc>(facetValueDocSet);
});