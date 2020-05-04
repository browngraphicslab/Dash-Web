import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { HeightSym, Opt, WidthSym } from "../../../new_fields/Doc";
import { ScriptField } from "../../../new_fields/ScriptField";
import { BoolCast, NumCast, StrCast } from "../../../new_fields/Types";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionPileView.scss";
import React = require("react");
import { setupMoveUpEvents, emptyFunction, returnFalse } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { UndoManager } from "../../util/UndoManager";
import { DragManager } from "../../util/DragManager";

@observer
export class CollectionPileView extends CollectionSubView(doc => doc) {
    _lastTap = 0;
    _doubleTap: boolean | undefined = false;
    _originalChrome: string = "";
    @observable _contentsActive = true;
    @observable _layoutEngine = "pass";
    @observable _collapsed: boolean = false;
    @observable _childClickedScript: Opt<ScriptField>;
    componentDidMount() {
        this._originalChrome = StrCast(this.layoutDoc._chromeStatus);
        this.layoutDoc._chromeStatus = "disabled";
        this.layoutDoc.hideFilterView = true;
    }
    componentWillUnmount() {
        this.layoutDoc.hideFilterView = false;
        this.layoutDoc._chromeStatus = this._originalChrome;
    }

    layoutEngine = () => this._layoutEngine;

    @computed get contents() {
        return <div className="collectionPileView-innards" style={{
            width: "100%",
            pointerEvents: this.layoutEngine() !== "pass" && (this.props.active() || this.layoutEngine() === "starburst") ? undefined : "none"
        }} >
            <CollectionFreeFormView {...this.props} layoutEngine={this.layoutEngine} />
        </div>;
    }

    specificMenu = (e: React.MouseEvent) => {
        const layoutItems: ContextMenuProps[] = [];
        const doc = this.props.Document;

        ContextMenu.Instance.addItem({ description: "Options...", subitems: layoutItems, icon: "eye" });
    }

    toggleStarburst = action(() => {
        if (this._layoutEngine === 'starburst') {
            const defaultSize = 110;
            this.layoutDoc._overflow = undefined;
            this.rootDoc.x = NumCast(this.rootDoc.x) + this.layoutDoc[WidthSym]() / 2 - NumCast(this.layoutDoc._starburstPileWidth, defaultSize) / 2;
            this.rootDoc.y = NumCast(this.rootDoc.y) + this.layoutDoc[HeightSym]() / 2 - NumCast(this.layoutDoc._starburstPileHeight, defaultSize) / 2;
            this.layoutDoc._width = NumCast(this.layoutDoc._starburstPileWidth, defaultSize);
            this.layoutDoc._height = NumCast(this.layoutDoc._starburstPileHeight, defaultSize);
            this._layoutEngine = 'pass';
        } else {
            const defaultSize = 25;
            this.layoutDoc._overflow = 'visible';
            !this.layoutDoc._starburstRadius && (this.layoutDoc._starburstRadius = 500);
            !this.layoutDoc._starburstDocScale && (this.layoutDoc._starburstDocScale = 2.5);
            if (this._layoutEngine === 'pass') {
                this.rootDoc.x = NumCast(this.rootDoc.x) + this.layoutDoc[WidthSym]() / 2 - defaultSize / 2;
                this.rootDoc.y = NumCast(this.rootDoc.y) + this.layoutDoc[HeightSym]() / 2 - defaultSize / 2;
                this.layoutDoc._starburstPileWidth = this.layoutDoc[WidthSym]();
                this.layoutDoc._starburstPileHeight = this.layoutDoc[HeightSym]();
            }
            this.layoutDoc._width = this.layoutDoc._height = defaultSize;
            this._layoutEngine = 'starburst';
        }
    });

    _undoBatch: UndoManager.Batch | undefined;
    pointerDown = (e: React.PointerEvent) => {
        let dist = 0;
        DragManager.Vals.Instance.SetIsDragging(true);
        // this._lastTap should be set to 0, and this._doubleTap should be set to false in the class header
        setupMoveUpEvents(this, e, (e: PointerEvent, down: number[], delta: number[]) => {
            if (this.layoutEngine() === "pass" && this.childDocs.length && this.props.isSelected(true)) {
                dist += Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);
                if (dist > 100) {
                    if (!this._undoBatch) {
                        this._undoBatch = UndoManager.StartBatch("layout pile");
                    }
                    const doc = this.childDocs[0];
                    doc.x = e.clientX;
                    doc.y = e.clientY;
                    this.props.addDocTab(doc, "inParent") && this.props.removeDocument(doc);
                    dist = 0;
                }
            }
            return false;
        }, () => {
            this._undoBatch?.end();
            this._undoBatch = undefined;
            DragManager.Vals.Instance.SetIsDragging(false);
            if (!this.childDocs.length) {
                this.props.ContainingCollectionView?.removeDocument(this.props.Document);
            }
        }, emptyFunction, false, this.layoutEngine() === "pass" && this.props.isSelected(true)); // this sets _doubleTap
    }

    onClick = (e: React.MouseEvent) => {
        if (e.button === 0 && (this._doubleTap || this.layoutEngine() === "starburst")) {
            SelectionManager.DeselectAll();
            this.toggleStarburst();
            e.stopPropagation();
        }
        // else if (this.layoutEngine() === "pass") {
        //     runInAction(() => this._contentsActive = false);
        //     setTimeout(action(() => this._contentsActive = true), 300);
        // }
    }

    render() {

        return <div className={"collectionPileView"} onContextMenu={this.specificMenu} onClick={this.onClick} onPointerDown={this.pointerDown}
            style={{ width: this.props.PanelWidth(), height: `calc(100%  - ${this.props.Document._chromeStatus === "enabled" ? 51 : 0}px)` }}>
            {this.contents}
        </div>;
    }
}
