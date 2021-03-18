import { toUpper } from "lodash";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocCastAsync, Opt, StrListCast } from "../../../fields/Doc";
import { List } from "../../../fields/List";
import { ObjectField } from "../../../fields/ObjectField";
import { RichTextField } from "../../../fields/RichTextField";
import { listSpec } from "../../../fields/Schema";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { emptyFunction, returnFalse, returnTrue, setupMoveUpEvents, returnEmptyString } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { Scripting } from "../../util/Scripting";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { EditableView } from "../EditableView";
import { ViewSpecPrefix } from "../nodes/DocumentView";
import { ViewDefBounds } from "./collectionFreeForm/CollectionFreeFormLayoutEngines";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionTimeView.scss";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;
import React = require("react");

@observer
export class CollectionTimeView extends CollectionSubView(doc => doc) {
    _changing = false;
    @observable _layoutEngine = "pivot";
    @observable _collapsed: boolean = false;
    @observable _childClickedScript: Opt<ScriptField>;
    @observable _viewDefDivClick: Opt<ScriptField>;
    @observable _focusDocFilters: Opt<string[]>; // fields that get overridden by a focus anchor
    @observable _focusPivotField: Opt<string>;
    @observable _focusRangeFilters: Opt<string[]>;

    getAnchor = () => {
        const anchor = Docs.Create.TextanchorDocument({
            title: ComputedField.MakeFunction(`"${this.pivotField}"])`) as any,
            annotationOn: this.rootDoc
        });

        // save view spec information for anchor
        const proto = Doc.GetProto(anchor);
        proto.pivotField = this.pivotField;
        proto.docFilters = ObjectField.MakeCopy(this.layoutDoc._docFilters as ObjectField) || new List<string>([]);
        proto.docRangeFilters = ObjectField.MakeCopy(this.layoutDoc._docRangeFilters as ObjectField) || new List<string>([]);
        proto[ViewSpecPrefix + "_viewType"] = this.layoutDoc._viewType;

        // store anchor in annotations list of document (not technically needed since these anchors are never drawn)
        if (Cast(this.dataDoc[this.props.fieldKey + "-annotations"], listSpec(Doc), null) !== undefined) {
            Cast(this.dataDoc[this.props.fieldKey + "-annotations"], listSpec(Doc), []).push(anchor);
        } else {
            this.dataDoc[this.props.fieldKey + "-annotations"] = new List<Doc>([anchor]);
        }
        return anchor;
    }

    async componentDidMount() {
        this.props.setContentView?.(this);
        //const detailView = (await DocCastAsync(this.props.Document.childClickedOpenTemplateView)) || DocUtils.findTemplate("detailView", StrCast(this.rootDoc.type), "");
        ///const childText = "const alias = getAlias(self); switchView(alias, detailView); alias.dropAction='alias'; alias.removeDropProperties=new List<string>(['dropAction']); useRightSplit(alias, shiftKey); ";
        runInAction(() => {
            this._childClickedScript = ScriptField.MakeScript("openInLightbox(self, shiftKey)", { this: Doc.name, shiftKey: "boolean" });//, { detailView: detailView! });
            this._viewDefDivClick = ScriptField.MakeScript("pivotColumnClick(this,payload)", { payload: "any" });
        });
    }

    get pivotField() { return this._focusPivotField || StrCast(this.layoutDoc._pivotField); }
    @action
    setViewSpec = (anchor: Doc, preview: boolean) => {
        if (preview) {   // if in preview, then override document's fields with view spec
            this._focusPivotField = StrCast(anchor.pivotField);
            this._focusDocFilters = StrListCast(anchor.docFilters);
            this._focusRangeFilters = StrListCast(anchor.docRangeFilters);
        } else if (anchor.pivotField !== undefined) {  // otherwise set document's fields based on anchor view spec
            this.layoutDoc._prevFilterIndex = 1;
            this.layoutDoc._pivotField = StrCast(anchor.pivotField);
            this.layoutDoc._docFilters = new List<string>(StrListCast(anchor.docFilters));
            this.layoutDoc._docRangeFilters = new List<string>(StrListCast(anchor.docRangeFilters));
        }
        return 0;
    }

    pivotDocFilters = () => this._focusDocFilters || this.props.docFilters();
    pivotDocRangeFilters = () => this._focusRangeFilters || this.props.docRangeFilters();
    layoutEngine = () => this._layoutEngine;
    toggleVisibility = action(() => this._collapsed = !this._collapsed);

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

    goTo = (prevFilterIndex: number) => {
        this.layoutDoc._pivotField = this.layoutDoc["_prevPivotFields" + prevFilterIndex];
        this.layoutDoc._docFilters = ObjectField.MakeCopy(this.layoutDoc["_prevDocFilter" + prevFilterIndex] as ObjectField);
        this.layoutDoc._docRangeFilters = ObjectField.MakeCopy(this.layoutDoc["_prevDocRangeFilters" + prevFilterIndex] as ObjectField);
        this.layoutDoc._prevFilterIndex = prevFilterIndex;
    }

    @action
    contentsDown = (e: React.MouseEvent) => {
        const prevFilterIndex = NumCast(this.layoutDoc._prevFilterIndex);
        if (prevFilterIndex > 0) {
            this.goTo(prevFilterIndex - 1);
        } else {
            this.layoutDoc._docFilters = new List([]);
        }
    }

    @computed get contents() {
        return <div className="collectionTimeView-innards" key="timeline" style={{ pointerEvents: this.props.active() ? undefined : "none" }}
            onClick={this.contentsDown}>
            <CollectionFreeFormView {...this.props}
                engineProps={{ pivotField: this.pivotField, docFilters: this.docFilters, docRangeFilters: this.docRangeFilters }}
                fitContentsToDoc={returnTrue}
                docFilters={this.pivotDocFilters}
                docRangeFilters={this.pivotDocRangeFilters}
                childClickScript={this._childClickedScript}
                viewDefDivClick={this._viewDefDivClick}
                childFreezeDimensions={true}
                layoutEngine={this.layoutEngine} />
        </div>;
    }

    public static SyncTimelineToPresentation(doc: Doc) {
        const fieldKey = Doc.LayoutFieldKey(doc);
        doc[fieldKey + "-timelineCur"] = ComputedField.MakeFunction("(activePresentationItem()[this._pivotField || 'year'] || 0)");
    }
    specificMenu = (e: React.MouseEvent) => {
        const layoutItems: ContextMenuProps[] = [];
        const doc = this.layoutDoc;

        layoutItems.push({ description: "Force Timeline", event: () => { doc._forceRenderEngine = "timeline"; }, icon: "compress-arrows-alt" });
        layoutItems.push({ description: "Force Pivot", event: () => { doc._forceRenderEngine = "pivot"; }, icon: "compress-arrows-alt" });
        layoutItems.push({ description: "Auto Time/Pivot layout", event: () => { doc._forceRenderEngine = undefined; }, icon: "compress-arrows-alt" });
        layoutItems.push({ description: "Sync with presentation", event: () => CollectionTimeView.SyncTimelineToPresentation(doc), icon: "compress-arrows-alt" });

        ContextMenu.Instance.addItem({ description: "Options...", subitems: layoutItems, icon: "eye" });
    }
    @computed get _allFacets() {
        const facets = new Set<string>();
        this.childDocs.forEach(child => Object.keys(Doc.GetProto(child)).forEach(key => facets.add(key)));
        Doc.AreProtosEqual(this.dataDoc, this.props.Document) && this.childDocs.forEach(child => Object.keys(child).forEach(key => facets.add(key)));
        return Array.from(facets);
    }
    menuCallback = (x: number, y: number) => {
        ContextMenu.Instance.clearItems();
        const docItems: ContextMenuProps[] = [];
        const keySet: Set<string> = new Set();

        this.childLayoutPairs.map(pair => this._allFacets.filter(fieldKey =>
            pair.layout[fieldKey] instanceof RichTextField ||
            typeof (pair.layout[fieldKey]) === "number" ||
            typeof (pair.layout[fieldKey]) === "boolean" ||
            typeof (pair.layout[fieldKey]) === "string").filter(fieldKey => fieldKey[0] !== "_" && (fieldKey[0] !== "#" || fieldKey === "#") && (fieldKey === "tags" || fieldKey[0] === toUpper(fieldKey)[0])).map(fieldKey => keySet.add(fieldKey)));
        Array.from(keySet).map(fieldKey =>
            docItems.push({ description: ":" + fieldKey, event: () => this.layoutDoc._pivotField = fieldKey, icon: "compress-arrows-alt" }));
        docItems.push({ description: ":(null)", event: () => this.layoutDoc._pivotField = undefined, icon: "compress-arrows-alt" });
        ContextMenu.Instance.addItem({ description: "Pivot Fields ...", subitems: docItems, icon: "eye" });
        const pt = this.props.ScreenToLocalTransform().inverse().transformPoint(x, y);
        ContextMenu.Instance.displayMenu(x, y, ":");
    }

    @computed get pivotKeyUI() {
        return <div className={"pivotKeyEntry"}>
            <EditableView
                GetValue={returnEmptyString}
                SetValue={(value: any) => {
                    if (value?.length) {
                        this.layoutDoc._pivotField = value;
                        return true;
                    }
                    return false;
                }}
                toggle={this.toggleVisibility}
                background={"#f1efeb"} // this.props.headingObject ? this.props.headingObject.color : "#f1efeb";
                contents={":" + StrCast(this.layoutDoc._pivotField)}
                showMenuOnLoad={true}
                display={"inline"}
                menuCallback={this.menuCallback} />
        </div>;
    }

    render() {
        let nonNumbers = 0;
        this.childDocs.map(doc => {
            const num = NumCast(doc[this.pivotField], Number(StrCast(doc[this.pivotField])));
            if (Number.isNaN(num)) {
                nonNumbers++;
            }
        });
        const forceLayout = StrCast(this.layoutDoc._forceRenderEngine);
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

        return <div className={"collectionTimeView" + (doTimeline ? "" : "-pivot")} onContextMenu={this.specificMenu}
            style={{ width: this.props.PanelWidth(), height: `calc(100%  - ${this.layoutDoc._chromeStatus === "enabled" ? 51 : 0}px)` }}>
            {this.pivotKeyUI}
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
    pivotDoc["_prevPivotFields" + prevFilterIndex] = pivotDoc._pivotField;
    pivotDoc._prevFilterIndex = ++prevFilterIndex;
    runInAction(() => {
        pivotDoc._docFilters = new List();
        const filterVals = (bounds.payload as string[]);
        filterVals.map(filterVal => Doc.setDocFilter(pivotDoc, StrCast(pivotDoc._pivotField), filterVal, "check"));
        const pivotView = DocumentManager.Instance.getDocumentView(pivotDoc);
        if (pivotDoc && pivotView?.ComponentView instanceof CollectionTimeView && filterVals.length === 1) {
            if (pivotView?.ComponentView.childDocs.length && pivotView.ComponentView.childDocs[0][filterVals[0]]) {
                pivotDoc._pivotField = filterVals[0];
            }
        }
    });
});