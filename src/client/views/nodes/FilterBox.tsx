import React = require("react");
import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { ColorState, SketchPicker } from 'react-color';
import { Doc, Opt, DocListCast, Field, DataSym } from "../../../fields/Doc";
import { Utils, returnEmptyFilter, returnEmptyDoclist, returnZero, emptyPath, returnFalse, emptyFunction, returnOne } from "../../../Utils";
import { documentSchema } from "../../../fields/documentSchemas";
import { InkTool } from "../../../fields/InkField";
import { makeInterface, listSpec } from "../../../fields/Schema";
import { StrCast, Cast } from "../../../fields/Types";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
import { ViewBoxBaseComponent } from "../DocComponent";
import "./ColorBox.scss";
import { FieldView, FieldViewProps } from './FieldView';
import { DocumentType } from "../../documents/DocumentTypes";
import { CollectionTreeView } from "../collections/CollectionTreeView";
import { ScriptField, ComputedField } from "../../../fields/ScriptField";
import { Docs } from "../../documents/Documents";
import { RichTextField } from "../../../fields/RichTextField";
import { List } from "../../../fields/List";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import './FilterBox.scss';
import { CollectionDockingView } from "../collections/CollectionDockingView";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

type FilterBoxDocument = makeInterface<[typeof documentSchema]>;
const FilterBoxDocument = makeInterface(documentSchema);

@observer
export class FilterBox extends ViewBoxBaseComponent<FieldViewProps, FilterBoxDocument>(FilterBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(FilterBox, fieldKey); }

    @computed get _allFacets() {
        return ["author", "creationDate", "type", "text", "context"];
        // const noviceReqFields = ["author", "creationDate", "type", "text", "context"];
        // const noviceLayoutFields: string[] = [];//["_curPage"];
        // const noviceFields = [...noviceReqFields, ...noviceLayoutFields];

        // const facets = new Set<string>([...noviceReqFields, ...noviceLayoutFields]);
        // this.childDocs.filter(child => child).forEach(child => child && Object.keys(Doc.GetProto(child)).forEach(key => facets.add(key)));
        // Doc.AreProtosEqual(this.dataDoc, this.props.Document) && this.childDocs.filter(child => child).forEach(child => Object.keys(child).forEach(key => facets.add(key)));

        // return Array.from(facets).filter(key => key[0] === "#" || key.indexOf("lastModified") !== -1 || (key[0] === key[0].toUpperCase() && !key.startsWith("_") && !key.startsWith("ACL")) || noviceFields.includes(key)).sort();
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
                while ((index = docFilter.findIndex(item => item === facetHeader)) !== -1) {
                    docFilter.splice(index, 3);
                }
            }
            const docRangeFilters = Cast(targetDoc._docRangeFilters, listSpec("string"));
            if (docRangeFilters) {
                let index: number;
                while ((index = docRangeFilters.findIndex(item => item === facetHeader)) !== -1) {
                    docRangeFilters.splice(index, 3);
                }
            }
        } else {
            const allCollectionDocs = DocListCast((targetDoc.data as any)[0].data);
            var rtfields = 0;
            const facetValues = Array.from(allCollectionDocs.reduce((set, child) => {
                const field = child[facetHeader] as Field;
                const fieldStr = Field.toString(field);
                if (field instanceof RichTextField || (typeof (field) === "string" && fieldStr.split(" ").length > 2)) rtfields++;
                return set.add(fieldStr);
            }, new Set<string>()));

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
            let newFacet: Opt<Doc>;
            if (facetHeader === "text" || rtfields / allCollectionDocs.length > 0.1) {
                newFacet = Docs.Create.TextDocument("", { _width: 100, _height: 25, treeViewExpandedView: "layout", title: facetHeader, treeViewOpen: true, forceActive: true, ignoreClick: true });
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                newFacet._textBoxPadding = 4;
                const scriptText = `setDocFilter(this?.target, "${facetHeader}", text, "match")`;
                newFacet.onTextChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, text: "string" });
            } else if (nonNumbers / facetValues.length < .1) {
                newFacet = Docs.Create.SliderDocument({ title: facetHeader, treeViewExpandedView: "layout", treeViewOpen: true });
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
                const capturedVariables = { layoutDoc: targetDoc, dataDoc: (targetDoc.data as any)[0][DataSym] };
                newFacet.data = ComputedField.MakeFunction(`readFacetData(layoutDoc, dataDoc, "${this.props.fieldKey}", "${facetHeader}")`, {}, capturedVariables);
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

    @computed get filterView() {
        const facetCollection = this.props.Document.proto as Doc;
        const flyout = (
            <div className="collectionTimeView-flyout" style={{ width: `100%`, height: this.props.PanelHeight() - 30 }} onWheel={e => e.stopPropagation()}>
                {this._allFacets.map(facet => <label className="collectionTimeView-flyout-item" key={`${facet}`} onClick={e => this.facetClick(facet)}>
                    <input type="checkbox" onChange={e => { }} checked={DocListCast(this.props.Document[this.props.fieldKey]).some(d => d.title === facet)} />
                    <span className="checkmark" />
                    {facet}
                </label>)}
            </div>
        );

        return this.props.dontRegisterView ? (null) : <div className="collectionTimeView-treeView" style={{ width: "100%" }}>
            <div className="collectionTimeView-addFacet" style={{ width: "100%" }} onPointerDown={e => e.stopPropagation()}>
                <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout}>
                    <div className="collectionTimeView-button">
                        <FontAwesomeIcon icon={"edit"} size={"lg"} />
                        <span className="collectionTimeView-span">Facet Filters</span>
                    </div>
                </Flyout>
            </div>
            <div className="collectionTimeView-tree" key="tree">
                <CollectionTreeView
                    PanelPosition={""}
                    Document={facetCollection}
                    DataDoc={Doc.GetProto(facetCollection)}
                    fieldKey={`${this.props.fieldKey}`}
                    CollectionView={undefined}
                    docFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                    ContainingCollectionView={this.props.ContainingCollectionView}
                    PanelWidth={this.props.PanelWidth}
                    PanelHeight={this.props.PanelHeight}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
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
    render() {
        return this.filterView;
    }
}