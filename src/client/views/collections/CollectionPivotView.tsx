import { CollectionSubView } from "./CollectionSubView";
import React = require("react");
import { computed, action, IReactionDisposer, reaction, runInAction, observable } from "mobx";
import { faEdit, faChevronCircleUp } from "@fortawesome/free-solid-svg-icons";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import "./CollectionPivotView.scss";
import { observer } from "mobx-react";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { CollectionTreeView } from "./CollectionTreeView";
import { Cast, StrCast, NumCast } from "../../../new_fields/Types";
import { Docs } from "../../documents/Documents";
import { ScriptField } from "../../../new_fields/ScriptField";
import { CompileScript } from "../../util/Scripting";
import { anchorPoints, Flyout } from "../TemplateMenu";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { List } from "../../../new_fields/List";
import { Set } from "typescript-collections";

@observer
export class CollectionPivotView extends CollectionSubView(doc => doc) {
    componentDidMount = () => {
        this.props.Document.freeformLayoutEngine = "pivot";
        if (!this.props.Document.facetCollection) {
            const facetCollection = Docs.Create.FreeformDocument([], { title: "facetFilters", yMargin: 0, treeViewHideTitle: true });
            facetCollection.target = this.props.Document;

            const scriptText = "setDocFilter(context.target, heading, this.title, checked)";
            const script = CompileScript(scriptText, {
                params: { this: Doc.name, heading: "boolean", checked: "boolean", context: Doc.name },
                typecheck: false,
                editable: true,
            });
            if (script.compiled) {
                facetCollection.onCheckedClick = new ScriptField(script);
            }

            const openDocText = "const alias = getAlias(this); alias.layoutKey = 'detailedDeviceView'; useRightSplit(alias); ";
            const openDocScript = CompileScript(openDocText, {
                params: { this: Doc.name, heading: "boolean", checked: "boolean", context: Doc.name },
                typecheck: false,
                editable: true,
            });
            if (openDocScript.compiled) {
                this.props.Document.onChildClick = new ScriptField(openDocScript);
            }

            this.props.Document.facetCollection = facetCollection;
            this.props.Document.fitToBox = true;
        }
    }

    @computed get fieldExtensionDoc() {
        return Doc.fieldExtensionDoc(this.props.DataDoc || this.props.Document, this.props.fieldKey);
    }

    bodyPanelWidth = () => this.props.PanelWidth() - 200;
    getTransform = () => this.props.ScreenToLocalTransform().translate(-200, 0);

    @computed get _allFacets() {
        const facets = new Set<string>();
        this.childDocs.forEach(child => Object.keys(Doc.GetProto(child)).forEach(key => facets.add(key)));
        return facets.toArray();
    }

    facetClick = (facet: string) => {
        const facetCollection = this.props.Document.facetCollection;
        if (facetCollection instanceof Doc) {
            const found = DocListCast(facetCollection.data).findIndex(doc => doc.title === facet);
            if (found !== -1) {
                //Doc.RemoveDocFromList(facetCollection, "data", DocListCast(facetCollection.data)[found]);
                (facetCollection.data as List<Doc>).splice(found, 1);
            } else {
                const facetValues = new Set<string>();
                this.childDocs.forEach(child => {
                    Object.keys(Doc.GetProto(child)).forEach(key => child[key] instanceof Doc && facetValues.add((child[key] as Doc)[facet]?.toString() || "(null)"));
                    facetValues.add(child[facet]?.toString() || "(null)");
                });

                const newFacetVals = facetValues.toArray().map(val => Docs.Create.TextDocument({ title: val.toString() }));
                const newFacet = Docs.Create.FreeformDocument(newFacetVals, { title: facet, treeViewOpen: true, isFacetFilter: true });
                Doc.AddDocToList(facetCollection, "data", newFacet);
            }
        }
    }

    render() {
        const facetCollection = Cast(this.props.Document?.facetCollection, Doc, null);
        const flyout = (
            <div className="collectionPivotView-flyout" title=" ">
                {this._allFacets.map(facet => <label className="collectionPivotView-flyout-item" onClick={e => this.facetClick(facet)}>
                    <input type="checkbox" checked={this.props.Document.facetCollection instanceof Doc && DocListCast(this.props.Document.facetCollection.data).some(d => {
                        return d.title === facet;
                    })} />
                    <span className="checkmark" />
                    {facet}
                </label>)}
            </div>
        );
        return !facetCollection ? (null) : <div className="collectionPivotView">
            <div className="collectionPivotView-treeView">
                <div className="collectionPivotView-addFacet" onPointerDown={e => e.stopPropagation()}>
                    <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout}>
                        <div className="collectionPivotView-button">
                            <span className="collectionPivotView-span">Facet Filters</span>
                            <FontAwesomeIcon icon={faEdit} size={"lg"} />
                        </div>
                    </Flyout>
                </div>
                <div className="collectionPivotView-tree">
                    <CollectionTreeView {...this.props} Document={facetCollection} />
                </div>
            </div>
            <div className="collectionPivotView-pivot">
                <CollectionFreeFormView  {...this.props} ScreenToLocalTransform={this.getTransform} PanelWidth={this.bodyPanelWidth} />
            </div>
        </div>;
    }
}