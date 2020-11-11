import { action, computed, Lambda, observable, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from "react";
import { Doc, Opt } from '../../../../fields/Doc';
import { documentSchema } from '../../../../fields/documentSchemas';
import { Id } from '../../../../fields/FieldSymbols';
import { makeInterface } from '../../../../fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast } from '../../../../fields/Types';
import { emptyFunction, OmitKeys, returnFalse, returnOne, setupMoveUpEvents } from '../../../../Utils';
import { Docs } from '../../../documents/Documents';
import { DragManager } from '../../../util/DragManager';
import { SnappingManager } from '../../../util/SnappingManager';
import { Transform } from '../../../util/Transform';
import { undoBatch } from '../../../util/UndoManager';
import { ContextMenu } from '../../ContextMenu';
import { ContextMenuProps } from '../../ContextMenuItem';
import { ContentFittingDocumentView } from '../../nodes/ContentFittingDocumentView';
import { FormattedTextBox } from '../../nodes/formattedText/FormattedTextBox';
import { CollectionSubView } from '../CollectionSubView';
import "./CollectionGridView.scss";
import Grid, { Layout } from "./Grid";

type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

@observer
export class CollectionGridView extends CollectionSubView(GridSchema) {
    private _containerRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _changeListenerDisposer: Opt<Lambda>; // listens for changes in this.childLayoutPairs
    private _resetListenerDisposer: Opt<Lambda>; // listens for when the reset button is clicked
    @observable private _rowHeight: Opt<number>; // temporary store of row height to make change undoable
    @observable private _scroll: number = 0; // required to make sure the decorations box container updates on scroll
    private dropLocation: object = {}; // sets the drop location for external drops

    onChildClickHandler = () => ScriptCast(this.Document.onChildClick);

    @computed get numCols() { return NumCast(this.props.Document.gridNumCols, 10); }
    @computed get rowHeight() { return this._rowHeight === undefined ? NumCast(this.props.Document.gridRowHeight, 100) : this._rowHeight; }
    // sets the default width and height of the grid nodes 
    @computed get defaultW() { return NumCast(this.props.Document.gridDefaultW, 2); }
    @computed get defaultH() { return NumCast(this.props.Document.gridDefaultH, 2); }

    @computed get colWidthPlusGap() { return (this.props.PanelWidth() - this.margin) / this.numCols; }
    @computed get rowHeightPlusGap() { return this.rowHeight + this.margin; }

    @computed get margin() { return NumCast(this.props.Document.margin, 10); }  // sets the margin between grid nodes

    @computed get flexGrid() { return BoolCast(this.props.Document.gridFlex, true); } // is grid static/flexible i.e. whether nodes be moved around and resized
    @computed get compaction() { return StrCast(this.props.Document.gridStartCompaction, StrCast(this.props.Document.gridCompaction, "vertical")); } // is grid static/flexible i.e. whether nodes be moved around and resized

    /**
     * Sets up the listeners for the list of documents and the reset button.
     */
    componentDidMount() {
        this._changeListenerDisposer = reaction(() => this.childLayoutPairs, (pairs) => {
            const newLayouts: Layout[] = [];
            const oldLayouts = this.savedLayoutList;
            pairs.forEach((pair, i) => {
                const existing = oldLayouts.find(l => l.i === pair.layout[Id]);
                if (existing) newLayouts.push(existing);
                else {
                    if (Object.keys(this.dropLocation).length) { // external drop
                        this.addLayoutItem(newLayouts, this.makeLayoutItem(pair.layout, this.dropLocation as { x: number, y: number }, !this.flexGrid));
                        this.dropLocation = {};
                    }
                    else { // internal drop
                        this.addLayoutItem(newLayouts, this.makeLayoutItem(pair.layout, this.unflexedPosition(i), !this.flexGrid));
                    }
                }
            });
            pairs?.length && this.setLayoutList(newLayouts);
        }, { fireImmediately: true });

        // updates the layouts if the reset button has been clicked
        this._resetListenerDisposer = reaction(() => this.props.Document.gridResetLayout, (reset) => {
            if (reset && this.flexGrid) {
                this.setLayout(this.childLayoutPairs.map((pair, index) => this.makeLayoutItem(pair.layout, this.unflexedPosition(index))));
            }
            this.props.Document.gridResetLayout = false;
        });
    }

    /**
     * Disposes the listeners.
     */
    componentWillUnmount() {
        this._changeListenerDisposer?.();
        this._resetListenerDisposer?.();
    }

    /**
     * @returns the default location of the grid node (i.e. when the grid is static)
     * @param index 
     */
    unflexedPosition(index: number): Omit<Layout, "i"> {
        return {
            x: (index % (Math.floor(this.numCols / this.defaultW) || 1)) * this.defaultW,
            y: Math.floor(index / (Math.floor(this.numCols / this.defaultH) || 1)) * this.defaultH,
            w: this.defaultW,
            h: this.defaultH,
            static: true
        };
    }

    /**
     * Maps the x- and y- coordinates of the event to a grid cell.
     */
    screenToCell(sx: number, sy: number) {
        const pt = this.props.ScreenToLocalTransform().transformPoint(sx, sy);
        const x = Math.floor(pt[0] / this.colWidthPlusGap);
        const y = Math.floor((pt[1] + this._scroll) / this.rowHeight);
        return { x, y };
    }

    /**
     * Creates a layout object for a grid item
     */
    makeLayoutItem = (doc: Doc, pos: { x: number, y: number }, Static: boolean = false, w: number = this.defaultW, h: number = this.defaultH) => {
        return ({ i: doc[Id], w, h, x: pos.x, y: pos.y, static: Static });
    }

    /**
     * Adds a layout to the list of layouts.
     */
    addLayoutItem = (layouts: Layout[], layout: Layout) => {
        const f = layouts.findIndex(l => l.i === layout.i);
        f !== -1 && layouts.splice(f, 1);
        layouts.push(layout);
        return layouts;
    }
    /**
     * @returns the transform that will correctly place the document decorations box. 
     */
    private lookupIndividualTransform = (layout: Layout) => {
        const xypos = this.flexGrid ? layout : this.unflexedPosition(this.renderedLayoutList.findIndex(l => l.i === layout.i));
        const pos = { x: xypos.x * this.colWidthPlusGap + this.margin, y: xypos.y * this.rowHeightPlusGap + this.margin - this._scroll };

        return this.props.ScreenToLocalTransform().translate(-pos.x, -pos.y);
    }

    /**
     * @returns the layout list converted from JSON
     */
    get savedLayoutList() {
        return (this.props.Document.gridLayoutString ? JSON.parse(StrCast(this.props.Document.gridLayoutString)) : []) as Layout[];
    }

    /**
     * Stores the layout list on the Document as JSON
     */
    setLayoutList(layouts: Layout[]) {
        this.props.Document.gridLayoutString = JSON.stringify(layouts);
    }

    /**
     * 
     * @param layout 
     * @param dxf the x- and y-translations of the decorations box as a transform i.e. this.lookupIndividualTransform
     * @param width 
     * @param height 
     * @returns the `ContentFittingDocumentView` of the node
     */
    getDisplayDoc(layout: Doc, dxf: () => Transform, width: () => number, height: () => number) {
        return <ContentFittingDocumentView
            {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
            Document={layout}
            DataDoc={layout.resolvedDataDoc as Doc}
            backgroundColor={this.props.backgroundColor}
            ContainingCollectionDoc={this.props.Document}
            PanelWidth={width}
            PanelHeight={height}
            ContentScaling={returnOne}
            FreezeDimensions={true}
            ScreenToLocalTransform={dxf}
            onClick={this.onChildClickHandler}
            renderDepth={this.props.renderDepth + 1}
            parentActive={this.props.active}
            dontCenter={"y"}
        />;
    }

    /**
     * Saves the layouts received from the Grid to the Document.
     * @param layouts `Layout[]`
     */
    @action
    setLayout = (layoutArray: Layout[]) => {
        // for every child in the collection, check to see if there's a corresponding grid layout object and
        // updated layout object. If both exist, which they should, update the grid layout object from the updated object 
        if (this.flexGrid) {
            const savedLayouts = this.savedLayoutList;
            this.childLayoutPairs.forEach(({ layout: doc }) => {
                const gridLayout = savedLayouts.find(gridLayout => gridLayout.i === doc[Id]);
                if (gridLayout) Object.assign(gridLayout, layoutArray.find(layout => layout.i === doc[Id]) || gridLayout);
            });

            if (this.props.Document.gridStartCompaction) {
                undoBatch(() => {
                    this.props.Document.gridCompaction = this.props.Document.gridStartCompaction;
                    this.setLayoutList(savedLayouts);
                })();
                this.props.Document.gridStartCompaction = undefined;
            } else {
                undoBatch(() => this.setLayoutList(savedLayouts))();
            }
        }
    }

    /**
     * @returns a list of `ContentFittingDocumentView`s inside wrapper divs.
     * The key of the wrapper div must be the same as the `i` value of the corresponding layout.
     */
    @computed
    private get contents(): JSX.Element[] {
        const collector: JSX.Element[] = [];
        if (this.renderedLayoutList.length === this.childLayoutPairs.length) {
            this.renderedLayoutList.forEach(l => {
                const child = this.childLayoutPairs.find(c => c.layout[Id] === l.i);
                const dxf = () => this.lookupIndividualTransform(l);
                const width = () => (this.flexGrid ? l.w : this.defaultW) * this.colWidthPlusGap - this.margin;
                const height = () => (this.flexGrid ? l.h : this.defaultH) * this.rowHeightPlusGap - this.margin;
                child && collector.push(
                    <div key={child.layout[Id]} className={"document-wrapper" + (this.flexGrid && this.props.isSelected() ? "" : " static")} >
                        {this.getDisplayDoc(child.layout, dxf, width, height)}
                    </div >
                );
            });
        }
        return collector;
    }

    /**
     * @returns a list of `Layout` objects with attributes depending on whether the grid is flexible or static
     */
    @computed get renderedLayoutList(): Layout[] {
        return this.flexGrid ?
            this.savedLayoutList.map(({ i, x, y, w, h }) => ({
                i, y, h,
                x: x + w > this.numCols ? 0 : x, // handles wrapping around of nodes when numCols decreases
                w: Math.min(w, this.numCols), // reduces width if greater than numCols
                static: BoolCast(this.childLayoutPairs.find(({ layout }) => layout[Id] === i)?.layout.lockedPosition, false) // checks if the lock position item has been selected in the context menu
            })) :
            this.savedLayoutList.map((layout, index) => { Object.assign(layout, this.unflexedPosition(index)); return layout; });
    }

    /**
     * Handles internal drop of Dash documents.
     */
    @action
    onInternalDrop = (e: Event, de: DragManager.DropEvent) => {
        const savedLayouts = this.savedLayoutList;
        const dropped = de.complete.docDragData?.droppedDocuments;
        if (dropped && super.onInternalDrop(e, de) && savedLayouts.length !== this.childDocs.length) {
            dropped.forEach(doc => this.addLayoutItem(savedLayouts, this.makeLayoutItem(doc, this.screenToCell(de.x, de.y)))); // shouldn't place all docs in the same cell;
            this.setLayoutList(savedLayouts);
            return true;
        }
        return false;
    }

    /**
     * Handles external drop of images/PDFs etc from outside Dash.
     */
    @action
    onExternalDrop = async (e: React.DragEvent): Promise<void> => {
        this.dropLocation = this.screenToCell(e.clientX, e.clientY);
        super.onExternalDrop(e, {});
    }

    /**
     * Handles the change in the value of the rowHeight slider.
     */
    @action
    onSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        this._rowHeight = event.currentTarget.valueAsNumber;
    }
    /**
     * Handles the user clicking on the slider.
     */
    @action
    onSliderDown = (e: React.PointerEvent) => {
        this._rowHeight = this.rowHeight; // uses _rowHeight during dragging and sets doc's rowHeight when finished so that operation is undoable
        setupMoveUpEvents(this, e, returnFalse, action(() => {
            undoBatch(() => this.props.Document.gridRowHeight = this._rowHeight)();
            this._rowHeight = undefined;
        }), emptyFunction, false, false);
        e.stopPropagation();
    }
    /**
     * Adds the display option to change the css display attribute of the `ContentFittingDocumentView`s
     */
    onContextMenu = () => {
        const displayOptionsMenu: ContextMenuProps[] = [];
        displayOptionsMenu.push({ description: "Toggle Content Display Style", event: () => this.props.Document.display = this.props.Document.display ? undefined : "contents", icon: "copy" });
        ContextMenu.Instance.addItem({ description: "Display", subitems: displayOptionsMenu, icon: "tv" });
    }

    /**
     * Handles text document creation on double click.
     */
    onPointerDown = (e: React.PointerEvent) => {
        if (this.props.active(true)) {
            setupMoveUpEvents(this, e, returnFalse, returnFalse,
                (e: PointerEvent, doubleTap?: boolean) => {
                    if (doubleTap) {
                        undoBatch(action(() => {
                            const text = Docs.Create.TextDocument("", { _width: 150, _height: 50 });
                            FormattedTextBox.SelectOnLoad = text[Id];// track the new text box so we can give it a prop that tells it to focus itself when it's displayed
                            Doc.AddDocToList(this.props.Document, this.props.fieldKey, text);
                            this.setLayoutList(this.addLayoutItem(this.savedLayoutList, this.makeLayoutItem(text, this.screenToCell(e.clientX, e.clientY))));
                        }))();
                    }
                },
                false);
            if (this.props.isSelected(true)) e.stopPropagation();
        }
    }

    render() {
        return (
            <div className="collectionGridView-contents" ref={this.createDashEventsTarget}
                style={{ pointerEvents: !this.props.active() && !SnappingManager.GetIsDragging() ? "none" : undefined }}
                onContextMenu={this.onContextMenu}
                onPointerDown={this.onPointerDown}
                onDrop={this.onExternalDrop}
            >
                <div className="collectionGridView-gridContainer" ref={this._containerRef}
                    style={{ backgroundColor: StrCast(this.layoutDoc._backgroundColor, "white") }}
                    onWheel={e => e.stopPropagation()}
                    onScroll={action(e => {
                        if (!this.props.isSelected()) e.currentTarget.scrollTop = this._scroll;
                        else this._scroll = e.currentTarget.scrollTop;
                    })} >
                    <Grid
                        width={this.props.PanelWidth()}
                        nodeList={this.contents.length ? this.contents : null}
                        layout={this.contents.length ? this.renderedLayoutList : undefined}
                        childrenDraggable={this.props.isSelected() ? true : false}
                        numCols={this.numCols}
                        rowHeight={this.rowHeight}
                        setLayout={this.setLayout}
                        transformScale={this.props.ScreenToLocalTransform().Scale}
                        compactType={this.compaction} // determines whether nodes should remain in position, be bound to the top, or to the left
                        preventCollision={BoolCast(this.props.Document.gridPreventCollision)}// determines whether nodes should move out of the way (i.e. collide) when other nodes are dragged over them
                        margin={this.margin}
                    />
                    <input className="rowHeightSlider" type="range"
                        style={{ width: this.props.PanelHeight() - 30 }}
                        min={1} value={this.rowHeight} max={this.props.PanelHeight() - 30}
                        onPointerDown={this.onSliderDown} onChange={this.onSliderChange} />
                </div>
            </div >
        );
    }
}