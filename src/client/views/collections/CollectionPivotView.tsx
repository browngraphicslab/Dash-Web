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
            const facetCollection = Docs.Create.TreeDocument([], { title: "facetFilters", yMargin: 0, treeViewHideTitle: true });
            facetCollection.target = this.props.Document;
            facetCollection.dontCopyOnAlias = true;

            const scriptText = "setDocFilter(containingTreeView.target, heading, this.title, checked)";
            const script = CompileScript(scriptText, {
                params: { this: Doc.name, heading: "boolean", checked: "boolean", containingTreeView: Doc.name },
                typecheck: false,
                editable: true,
            });
            if (script.compiled) {
                facetCollection.onCheckedClick = new ScriptField(script);
            }
            const openDocText = "const alias = getAlias(this); Doc.ApplyTemplateTo(childDetailed, alias, 'layout_detailed'); useRightSplit(alias); ";
            this._narrativeDisposer = reaction(() => DocCastAsync(this.props.Document.childDetailed),
                (childDetailedPromise) => childDetailedPromise.then(childDetailed => {
                    if (childDetailed) {
                        const openDocScript = CompileScript(openDocText, {
                            params: { this: Doc.name, heading: "boolean", containingTreeView: Doc.name },
                            capturedVariables: { childDetailed: new PrefetchProxy(childDetailed) },
                            typecheck: false,
                            editable: true,
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
        const facetCollection = this.props.Document.facetCollection;
        if (facetCollection instanceof Doc) {
            const found = DocListCast(facetCollection.data).findIndex(doc => doc.title === facetHeader);
            if (found !== -1) {
                (facetCollection.data as List<Doc>).splice(found, 1);
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
        const facetCollection = Cast(this.props.Document?.facetCollection, Doc, null);
        const flyout = (
            <div className="collectionPivotView-flyout" style={{ width: `${this._facetWidth}` }}>
                {this._allFacets.map(facet => <label className="collectionPivotView-flyout-item" key={`${facet}`} onClick={e => this.facetClick(facet)}>
                    <input type="checkbox" onChange={e => { }} checked={this.props.Document.facetCollection instanceof Doc && DocListCast(this.props.Document.facetCollection.data).some(d => {
                        return d.title === facet;
                    })} />
                    <span className="checkmark" />
                    {facet}
                </label>)}
            </div>
        );
        return !facetCollection ? (null) :
            <div className="collectionPivotView">
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