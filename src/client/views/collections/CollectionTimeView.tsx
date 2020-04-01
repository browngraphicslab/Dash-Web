import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { ObjectField } from "../../../new_fields/ObjectField";
import { RichTextField } from "../../../new_fields/RichTextField";
import { ComputedField, ScriptField } from "../../../new_fields/ScriptField";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnFalse, setupMoveUpEvents } from "../../../Utils";
import { Scripting } from "../../util/Scripting";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { EditableView } from "../EditableView";
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
    componentWillUnmount() {
        this.props.Document.onChildClick = undefined;
    }
    componentDidMount() {
        this.props.Document._freezeOnDrop = true;
        const childDetailed = this.props.Document.childDetailed; // bcz: needs to be here to make sure the childDetailed layout template has been loaded when the first item is clicked;
        const childText = "const alias = getAlias(this); Doc.ApplyTemplateTo(containingCollection.childDetailed, alias, 'layout_detailView'); alias.dropAction='alias'; alias.removeDropProperties=new List<string>(['dropAction']);  useRightSplit(alias, shiftKey); ";
        this.props.Document.onChildClick = ScriptField.MakeScript(childText, { this: Doc.name, heading: "string", containingCollection: Doc.name, shiftKey: "boolean" });
        this.props.Document._fitToBox = true;
        if (!this.props.Document.onViewDefClick) {
            this.props.Document.onViewDefDivClick = ScriptField.MakeScript("pivotColumnClick(this,payload)", { payload: "any" });
        }
    }

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

    @computed get contents() {
        return <div className="collectionTimeView-innards" key="timeline" style={{ width: "100%" }}>
            <CollectionFreeFormView  {...this.props} layoutEngine={this.layoutEngine} />
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
            typeof (pair.layout[fieldKey]) === "string").map(fieldKey => keySet.add(fieldKey)));
        Array.from(keySet).map(fieldKey =>
            docItems.push({ description: ":" + fieldKey, event: () => this.props.Document._pivotField = fieldKey, icon: "compress-arrows-alt" }));
        docItems.push({ description: ":(null)", event: () => this.props.Document._pivotField = undefined, icon: "compress-arrows-alt" });
        ContextMenu.Instance.addItem({ description: "Pivot Fields ...", subitems: docItems, icon: "eye" });
        const pt = this.props.ScreenToLocalTransform().inverse().transformPoint(x, y);
        ContextMenu.Instance.displayMenu(x, y, ":");
    }

    @computed get pivotKeyUI() {
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
        return <div className={"pivotKeyEntry"}>
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
        </div>;
    }

    render() {
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

        return <div className={"collectionTimeView" + (doTimeline ? "" : "-pivot")} onContextMenu={this.specificMenu}
            style={{ width: this.props.PanelWidth(), height: `calc(100%  - ${this.props.Document._chromeStatus === "enabled" ? 51 : 0}px)` }}>
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
    pivotDoc._prevFilterIndex = ++prevFilterIndex;
    runInAction(() => {
        pivotDoc._docFilters = new List();
        (bounds.payload as string[]).map(filterVal =>
            Doc.setDocFilter(pivotDoc, StrCast(pivotDoc._pivotField), filterVal, "check"));
    });
});