import { CollectionSubView } from "./CollectionSubView";
import React = require("react");
import { computed, action, IReactionDisposer, reaction, runInAction, observable } from "mobx";
import { faEdit, faChevronCircleUp } from "@fortawesome/free-solid-svg-icons";
import { Doc, DocListCast, Field, DocCastAsync } from "../../../new_fields/Doc";
import "./CollectionPivotView.scss";
import { observer } from "mobx-react";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { CollectionTreeView } from "./CollectionTreeView";
import { Cast, StrCast, NumCast } from "../../../new_fields/Types";
import { Docs } from "../../documents/Documents";
import { ScriptField, ComputedField } from "../../../new_fields/ScriptField";
import { CompileScript, Scripting } from "../../util/Scripting";
import { anchorPoints, Flyout } from "../TemplateMenu";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { List } from "../../../new_fields/List";
import { Set } from "typescript-collections";
import { PrefetchProxy } from "../../../new_fields/Proxy";

@observer
export class CollectionPivotView extends CollectionSubView(doc => doc) {
    private _narrativeDisposer: IReactionDisposer | undefined;
    componentWillUnmount() {
        this._narrativeDisposer?.();
    }
    componentDidMount() {
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
            this._narrativeDisposer = reaction(() => this.props.Document.childDetailed,
                (childDetailed) =>
                    DocCastAsync(childDetailed).then(childDetailed => {
                        if (childDetailed instanceof Doc) {
                            const captured: { [name: string]: Field } = {};
                            captured.childDetailed = new PrefetchProxy(childDetailed);
                            const openDocText = "const alias = getAlias(this); Doc.ApplyTemplateTo(childDetailed, alias, 'layout_detailed'); useRightSplit(alias); ";
                            const openDocScript = CompileScript(openDocText, {
                                params: { this: Doc.name, heading: "boolean", context: Doc.name },
                                typecheck: false,
                                editable: true,
                                capturedVariables: captured
                            });
                            if (openDocScript.compiled) {
                                this.props.Document.onChildClick = new ScriptField(openDocScript);
                            }
                        }
                    }), { fireImmediately: true });
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

    /**
     * Responds to clicking the check box in the flyout menu
     */
    facetClick = (facetHeader: string) => {
        const { Document, fieldKey } = this.props;
        const facetCollection = Document.facetCollection;
        if (facetCollection instanceof Doc) {
            const found = DocListCast(facetCollection.data).findIndex(doc => doc.title === facetHeader);
            if (found !== -1) {
                //Doc.RemoveDocFromList(facetCollection, "data", DocListCast(facetCollection.data)[found]);
                (facetCollection.data as List<Doc>).splice(found, 1);
            } else {
                const newFacet = Docs.Create.FreeformDocument([], { title: facetHeader, treeViewOpen: true, isFacetFilter: true });
                Doc.AddDocToList(facetCollection, "data", newFacet);
                const { dataDoc } = this;
                const capturedVariables = {
                    layoutDoc: Document,
                    dataDoc,
                    dataKey: fieldKey,
                    facetHeader
                };
                const params = {
                    layoutDoc: Doc.name,
                    dataDoc: Doc.name,
                    dataKey: "string",
                    facetHeader: "string"
                };
                newFacet.container = dataDoc;
                newFacet.data = ComputedField.MakeFunction("readFacetData(layoutDoc, dataDoc, dataKey, facetHeader)", params, capturedVariables);
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