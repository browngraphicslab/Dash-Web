import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { HeightSym, Opt, WidthSym, Doc } from "../../../fields/Doc";
import { ScriptField } from "../../../fields/ScriptField";
import { NumCast, StrCast } from "../../../fields/Types";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionPileView.scss";
import React = require("react");
import { setupMoveUpEvents, emptyFunction } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { UndoManager, undoBatch } from "../../util/UndoManager";
import { SnappingManager } from "../../util/SnappingManager";
import { DocUtils } from "../../documents/Documents";

@observer
export class CollectionPileView extends CollectionSubView(doc => doc) {
    _originalChrome: string = "";

    componentDidMount() {
        if (this.layoutEngine() !== "pass" && this.layoutEngine() !== "starburst") {
            this.Document._pileLayoutEngine = "pass";
        }
        this._originalChrome = StrCast(this.layoutDoc._chromeStatus);
        this.layoutDoc._chromeStatus = "disabled";
    }
    componentWillUnmount() {
        this.layoutDoc._chromeStatus = this._originalChrome;
    }

    layoutEngine = () => StrCast(this.Document._pileLayoutEngine);

    // returns the contents of the pileup in a CollectionFreeFormView
    @computed get contents() {
        const draggingSelf = this.props.isSelected();
        return <div className="collectionPileView-innards" style={{ pointerEvents: this.layoutEngine() === "starburst" || (SnappingManager.GetIsDragging() && !draggingSelf) ? undefined : "none", zIndex: this.layoutEngine() === "starburst" && !SnappingManager.GetIsDragging() ? -10 : "auto" }} >
            <CollectionFreeFormView {...this.props} layoutEngine={this.layoutEngine}
                addDocument={(doc: Doc | Doc[]) => {
                    (doc instanceof Doc ? [doc] : doc).map((d) => DocUtils.iconify(d));
                    return this.props.addDocument(doc);
                }}
                moveDocument={(doc: Doc | Doc[], targetCollection: Doc | undefined, addDoc: (doc: Doc | Doc[]) => boolean) => {
                    (doc instanceof Doc ? [doc] : doc).map((d) => Doc.deiconifyView(d));
                    return this.props.moveDocument(doc, targetCollection, addDoc);
                }} />
        </div>;
    }

    // toggles the pileup between starburst to compact
    toggleStarburst = action(() => {
        if (this.layoutEngine() === 'starburst') {
            const defaultSize = 110;
            this.layoutDoc._overflow = undefined;
            this.childDocs.forEach(d => DocUtils.iconify(d));
            this.rootDoc.x = NumCast(this.rootDoc.x) + this.layoutDoc[WidthSym]() / 2 - NumCast(this.layoutDoc._starburstPileWidth, defaultSize) / 2;
            this.rootDoc.y = NumCast(this.rootDoc.y) + this.layoutDoc[HeightSym]() / 2 - NumCast(this.layoutDoc._starburstPileHeight, defaultSize) / 2;
            this.layoutDoc._width = NumCast(this.layoutDoc._starburstPileWidth, defaultSize);
            this.layoutDoc._height = NumCast(this.layoutDoc._starburstPileHeight, defaultSize);
            DocUtils.pileup(this.childDocs);
            this.layoutDoc._panX = 0;
            this.layoutDoc._panY = -10;
            this.props.Document._pileLayoutEngine = 'pass';
        } else {
            const defaultSize = 25;
            this.layoutDoc._overflow = 'visible';
            !this.layoutDoc._starburstRadius && (this.layoutDoc._starburstRadius = 500);
            !this.layoutDoc._starburstDocScale && (this.layoutDoc._starburstDocScale = 2.5);
            if (this.layoutEngine() === 'pass') {
                this.rootDoc.x = NumCast(this.rootDoc.x) + this.layoutDoc[WidthSym]() / 2 - defaultSize / 2;
                this.rootDoc.y = NumCast(this.rootDoc.y) + this.layoutDoc[HeightSym]() / 2 - defaultSize / 2;
                this.layoutDoc._starburstPileWidth = this.layoutDoc[WidthSym]();
                this.layoutDoc._starburstPileHeight = this.layoutDoc[HeightSym]();
            }
            this.layoutDoc._panX = this.layoutDoc._panY = 0;
            this.layoutDoc._width = this.layoutDoc._height = defaultSize;
            this.props.Document._pileLayoutEngine = 'starburst';
        }
    });

    // for dragging documents out of the pileup view
    _undoBatch: UndoManager.Batch | undefined;
    pointerDown = (e: React.PointerEvent) => {
        let dist = 0;
        SnappingManager.SetIsDragging(true);
        setupMoveUpEvents(this, e, (e: PointerEvent, down: number[], delta: number[]) => {
            if (this.layoutEngine() === "pass" && this.childDocs.length && e.shiftKey) {
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
            SnappingManager.SetIsDragging(false);
            if (!this.childDocs.length) {
                this.props.ContainingCollectionView?.removeDocument(this.props.Document);
            }
        }, emptyFunction, e.shiftKey && this.layoutEngine() === "pass", this.layoutEngine() === "pass" && e.shiftKey); // this sets _doubleTap
    }

    // onClick for toggling the pileup view
    onClick = (e: React.MouseEvent) => {
        if (e.button === 0) {
            SelectionManager.DeselectAll();
            this.toggleStarburst();
            e.stopPropagation();
        }
    }

    render() {
        return <div className={`collectionPileView`} onClick={this.onClick} onPointerDown={this.pointerDown}
            style={{ width: this.props.PanelWidth(), height: `calc(100%  - ${this.props.Document._chromeStatus === "enabled" ? 51 : 0}px)` }}>
            {this.contents}
        </div>;
    }
}
