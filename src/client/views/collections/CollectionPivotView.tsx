import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable } from "mobx";
import { observer } from "mobx-react";
import { Set } from "typescript-collections";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { ComputedField, ScriptField } from "../../../new_fields/ScriptField";
import { Cast, StrCast } from "../../../new_fields/Types";
import { Docs } from "../../documents/Documents";
import { EditableView } from "../EditableView";
import { anchorPoints, Flyout } from "../TemplateMenu";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import "./CollectionPivotView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { CollectionTreeView } from "./CollectionTreeView";
import React = require("react");

@observer
export class CollectionPivotView extends CollectionSubView(doc => doc) {
    componentDidMount() {
        this.props.Document._freeformLayoutEngine = "pivot";
        const childDetailed = this.props.Document.childDetailed; // bcz: needs to be here to make sure the childDetailed layout template has been loaded when the first item is clicked;
        if (!this.props.Document._facetCollection) {
            const facetCollection = Docs.Create.TreeDocument([], { title: "facetFilters", _yMargin: 0, treeViewHideTitle: true });
            facetCollection.target = this.props.Document;
            this.props.Document.excludeFields = new List<string>(["_facetCollection", "_docFilter"]);

            const scriptText = "setDocFilter(containingTreeView.target, heading, this.title, checked)";
            const childText = "const alias = getAlias(this); Doc.ApplyTemplateTo(containingCollection.childDetailed, alias, 'layout_detailed'); useRightSplit(alias); ";
            facetCollection.onCheckedClick = ScriptField.MakeScript(scriptText, { this: Doc.name, heading: "boolean", checked: "boolean", containingTreeView: Doc.name });
            this.props.Document.onChildClick = ScriptField.MakeScript(childText, { this: Doc.name, heading: "boolean", containingCollection: Doc.name });
            this.props.Document._facetCollection = facetCollection;
            this.props.Document._fitToBox = true;
        }
    }
    bodyPanelWidth = () => this.props.PanelWidth() - this._facetWidth;
    getTransform = () => this.props.ScreenToLocalTransform().translate(-200, 0);

    @computed get _allFacets() {
        const facets = new Set<string>();
        this.childDocs.forEach(child => Object.keys(Doc.GetProto(child)).forEach(key => facets.add(key)));
        return facets.toArray();
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
                const docFilter = Cast(this.props.Document._docFilter, listSpec("string"));
                if (docFilter) {
                    let index: number;
                    while ((index = docFilter.findIndex(item => item === facetHeader)) !== -1) {
                        docFilter.splice(index, 3);
                    }
                }
            } else {
                const newFacet = Docs.Create.TreeDocument([], { title: facetHeader, treeViewOpen: true, isFacetFilter: true });
                const capturedVariables = { layoutDoc: this.props.Document, dataDoc: this.dataDoc };
                const params = { layoutDoc: Doc.name, dataDoc: Doc.name, };
                newFacet.data = ComputedField.MakeFunction(`readFacetData(layoutDoc, dataDoc, "${this.props.fieldKey}", "${facetHeader}")`, params, capturedVariables);
                Doc.AddDocToList(facetCollection, "data", newFacet);
            }
        }
    }
    _canClick = false;
    _facetWidthOnDown = 0;
    @observable _facetWidth = 200;
    onPointerDown = (e: React.PointerEvent) => {
        this._canClick = true;
        this._facetWidthOnDown = e.screenX;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
        e.stopPropagation();
        e.preventDefault();
    }


    @action
    onPointerMove = (e: PointerEvent) => {
        this._facetWidth = Math.max(this.props.ScreenToLocalTransform().transformPoint(e.clientX, 0)[0], 0);
        Math.abs(e.movementX) > 6 && (this._canClick = false);
    }
    @action
    onPointerUp = (e: PointerEvent) => {
        if (Math.abs(e.screenX - this._facetWidthOnDown) < 6 && this._canClick) {
            this._facetWidth = this._facetWidth < 15 ? 200 : 0;
        }
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        const facetCollection = Cast(this.props.Document?._facetCollection, Doc, null);
        const flyout = (
            <div className="collectionPivotView-flyout" style={{ width: `${this._facetWidth}` }}>
                {this._allFacets.map(facet => <label className="collectionPivotView-flyout-item" key={`${facet}`} onClick={e => this.facetClick(facet)}>
                    <input type="checkbox" onChange={e => { }} checked={DocListCast((this.props.Document._facetCollection as Doc)?.data).some(d => d.title === facet)} />
                    <span className="checkmark" />
                    {facet}
                </label>)}
            </div>
        );
        return !facetCollection ? (null) :
            <div className="collectionPivotView">
                <div className={"pivotKeyEntry"}>
                    <EditableView
                        contents={this.props.Document.pivotField}
                        GetValue={() => StrCast(this.props.Document.pivotField)}
                        SetValue={value => {
                            if (value && value.length) {
                                this.props.Document.pivotField = value;
                                return true;
                            }
                            return false;
                        }}
                    />
                </div>
                <div className="collectionPivotView-dragger" key="dragger" onPointerDown={this.onPointerDown} style={{ transform: `translate(${this._facetWidth}px, 0px)` }} >
                    <span title="library View Dragger" style={{ width: "5px", position: "absolute", top: "0" }} />
                </div>
                <div className="collectionPivotView-treeView" style={{ width: `${this._facetWidth}px`, overflow: this._facetWidth < 15 ? "hidden" : undefined }}>
                    <div className="collectionPivotView-addFacet" style={{ width: `${this._facetWidth}px` }} onPointerDown={e => e.stopPropagation()}>
                        <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout}>
                            <div className="collectionPivotView-button">
                                <span className="collectionPivotView-span">Facet Filters</span>
                                <FontAwesomeIcon icon={faEdit} size={"lg"} />
                            </div>
                        </Flyout>
                    </div>
                    <div className="collectionPivotView-tree" key="tree">
                        <CollectionTreeView {...this.props} Document={facetCollection} />
                    </div>
                </div>
                <div className="collectionPivotView-pivot" key="pivot" style={{ width: this.bodyPanelWidth() }}>
                    <CollectionFreeFormView  {...this.props} ScreenToLocalTransform={this.getTransform} PanelWidth={this.bodyPanelWidth} />
                </div>
            </div>;
    }
}