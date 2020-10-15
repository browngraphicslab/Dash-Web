import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { computed } from "mobx";
import { observer } from "mobx-react";
import { DataSym, Doc, DocListCast, Field, Opt } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { List } from "../../../fields/List";
import { RichTextField } from "../../../fields/RichTextField";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Cast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnOne, returnZero } from "../../../Utils";
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
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

type FilterBoxDocument = makeInterface<[typeof documentSchema]>;
const FilterBoxDocument = makeInterface(documentSchema);

@observer
export class FilterBox extends ViewBoxBaseComponent<FieldViewProps, FilterBoxDocument>(FilterBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(FilterBox, fieldKey); }

    @computed get allDocs() {
        const allDocs = new Set<Doc>();
        if (CollectionDockingView.Instance) {
            const activeTabs = DocListCast(CollectionDockingView.Instance.props.Document.data);
            SearchBox.foreachRecursiveDoc(activeTabs, (doc: Doc) => allDocs.add(doc));
            setTimeout(() => CollectionDockingView.Instance.props.Document.allDocuments = new List<Doc>(Array.from(allDocs)));
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
                            valueSet.add(Field.toString(facetVal as Field));
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
    /**
     * Responds to clicking the check box in the flyout menu
     */
    facetClick = (facetHeader: string) => {
        const targetDoc = CollectionDockingView.Instance.props.Document;
        const found = DocListCast(this.dataDoc[this.props.fieldKey]).findIndex(doc => doc.title === facetHeader);
        if (found !== -1) {
            (this.dataDoc[this.props.fieldKey] as List<Doc>).splice(found, 1);
            const docFilter = Cast(targetDoc._docFilters, listSpec("string"));
            if (docFilter) {
                let index: number;
                while ((index = docFilter.findIndex(item => item.split(":")[0] === facetHeader)) !== -1) {
                    docFilter.splice(index, 1);
                }
            }
            const docRangeFilters = Cast(targetDoc._docRangeFilters, listSpec("string"));
            if (docRangeFilters) {
                let index: number;
                while ((index = docRangeFilters.findIndex(item => item.split(":")[0] === facetHeader)) !== -1) {
                    docRangeFilters.splice(index, 1);
                }
            }
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
                newFacet = Docs.Create.TextDocument("", { _width: 100, _height: 25, _stayInCollection: true, _hideContextMenu: true, treeViewExpandedView: "layout", title: facetHeader, treeViewOpen: true, forceActive: true, ignoreClick: true });
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                newFacet._textBoxPadding = 4;
                const scriptText = `setDocFilter(this?.target, "${facetHeader}", text, "match")`;
                newFacet.onTextChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, text: "string" });
            } else if (facetHeader !== "tags" && nonNumbers / facetValues.strings.length < .1) {
                newFacet = Docs.Create.SliderDocument({ title: facetHeader, _stayInCollection: true, _hideContextMenu: true, treeViewExpandedView: "layout", treeViewOpen: true });
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
                const capturedVariables = { layoutDoc: targetDoc, _stayInCollection: true, _hideContextMenu: true, dataDoc: (targetDoc.data as any)[0][DataSym] };
                newFacet.data = ComputedField.MakeFunction(`readFacetData(layoutDoc, "${facetHeader}")`, {}, capturedVariables);
            }
            newFacet && Doc.AddDocToList(this.dataDoc, this.props.fieldKey, newFacet);
        }
    }
    filterBackground = () => "rgba(105, 105, 105, 0.432)";
    get ignoreFields() { return ["_docFilters", "_docRangeFilters"]; } // this makes the tree view collection ignore these filters (otherwise, the filters would filter themselves)
    @computed get scriptField() {
        const scriptText = "setDocFilter(this?.target, heading, this.title, checked)";
        const script = ScriptField.MakeScript(scriptText, { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name });
        return script ? () => script : undefined;
    }

    render() {
        const facetCollection = this.props.Document.proto as Doc;
        const flyout = <div className="filterBox-flyout" style={{ width: `100%`, height: this.props.PanelHeight() - 30 }} onWheel={e => e.stopPropagation()}>
            {this._allFacets.map(facet => <label className="filterBox-flyout-facet" key={`${facet}`} onClick={e => this.facetClick(facet)}>
                <input type="checkbox" onChange={e => { }} checked={DocListCast(this.props.Document[this.props.fieldKey]).some(d => d.title === facet)} />
                <span className="checkmark" />
                {facet}
            </label>)}
        </div>;

        return this.props.dontRegisterView ? (null) : <div className="filterBox-treeView" style={{ width: "100%" }}>
            <div className="filterBox-addFacet" style={{ width: "100%" }} onPointerDown={e => e.stopPropagation()}>
                <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout}>
                    <div className="filterBox-addFacetButton">
                        <FontAwesomeIcon icon={"edit"} size={"lg"} />
                        <span className="filterBox-span">Choose Facets</span>
                    </div>
                </Flyout>
            </div>
            <div className="filterBox-tree" key="tree">
                <CollectionTreeView
                    PanelPosition={""}
                    Document={facetCollection}
                    DataDoc={Doc.GetProto(facetCollection)}
                    fieldKey={`${this.props.fieldKey}`}
                    CollectionView={undefined}
                    docFilters={returnEmptyFilter}
                    docRangeFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                    ContainingCollectionView={this.props.ContainingCollectionView}
                    PanelWidth={this.props.PanelWidth}
                    PanelHeight={this.props.PanelHeight}
                    LibraryPath={emptyPath}
                    rootSelected={this.props.rootSelected}
                    renderDepth={1}
                    dropAction={this.props.dropAction}
                    ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    isSelected={returnFalse}
                    select={returnFalse}
                    bringToFront={emptyFunction}
                    active={this.props.active}
                    whenActiveChanged={returnFalse}
                    treeViewHideTitle={true}
                    ContentScaling={returnOne}
                    focus={returnFalse}
                    treeViewHideHeaderFields={true}
                    onCheckedClick={this.scriptField}
                    ignoreFields={this.ignoreFields}
                    annotationsKey={""}
                    dontRegisterView={true}
                    backgroundColor={this.filterBackground}
                    moveDocument={returnFalse}
                    removeDocument={returnFalse}
                    addDocument={returnFalse} />
            </div>
        </div>;
    }
}

Scripting.addGlobal(function determineCheckedState(layoutDoc: Doc, facetHeader: string, facetValue: string) {
    const docFilters = Cast(layoutDoc._docFilters, listSpec("string"), []);
    for (let i = 0; i < docFilters.length; i++) {
        const fields = docFilters[i].split(":"); // split into key:value:modifiers
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