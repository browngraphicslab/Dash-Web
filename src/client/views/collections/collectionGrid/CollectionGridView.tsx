import { action, computed, Lambda, observable, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from "react";
import { Doc, Opt } from '../../../../fields/Doc';
import { documentSchema } from '../../../../fields/documentSchemas';
import { Id } from '../../../../fields/FieldSymbols';
import { makeInterface } from '../../../../fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast } from '../../../../fields/Types';
import { emptyFunction, returnFalse, returnZero, setupMoveUpEvents } from '../../../../Utils';
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

    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    @computed get numCols() { return NumCast(this.props.Document.gridNumCols, 10); }
    @computed get rowHeight() { return this._rowHeight === undefined ? NumCast(this.props.Document.gridRowHeight, 100) : this._rowHeight; }
    // sets the default width and height of the grid nodes 
    @computed get defaultW() { return NumCast(this.props.Document.gridDefaultW, 2); }
    @computed get defaultH() { return NumCast(this.props.Document.gridDefaultH, 2); }

    @computed get colWidthPlusGap() { return (this.props.PanelWidth() - this.margin) / this.numCols; }
    @computed get rowHeightPlusGap() { return this.rowHeight + this.margin; }

    @computed get margin() { return NumCast(this.props.Document.margin, 10); }  // sets the margin between grid nodes

    @computed get flexGrid() { return BoolCast(this.props.Document.gridFlex, true); } // is grid static/flexible i.e. whether nodes be moved around and resized

    componentDidMount() {
        this._changeListenerDisposer = computed(() => this.childLayoutPairs).observe(({ oldValue, newValue }) => {
            const layouts = this.parsedLayoutList;

            // if grid view has been opened and then exited and a document has been deleted
            // this deletes the layout of that document from the layouts list

            if (!oldValue && newValue.length) {
                layouts.forEach(({ i }, index) => {
                    if (!newValue.find(({ layout: preserved }) => preserved[Id] === i)) {
                        layouts.splice(index, 1);
                    }
                });
            }

            if (!oldValue || newValue.length > oldValue.length) {
                // for each document that was added, add a corresponding grid layout object
                newValue.forEach(({ layout }, i) => {
                    if (!layouts.find(gridLayout => gridLayout.i === layout[Id])) {
                        this.addLayoutItem(layouts, this.makeLayoutItem(layout, this.unflexedPosition(i), !this.flexGrid));
                    }
                });
            } else {
                // for each document that was removed, remove its corresponding grid layout object
                oldValue.forEach(({ layout }) => {
                    if (!newValue.find(({ layout: preserved }) => preserved[Id] === layout[Id])) {
                        const index = layouts.findIndex((gridLayout: Layout) => gridLayout.i === layout[Id]);
                        index !== -1 && layouts.splice(index, 1);
                    }
                });
            }
            this.setLayoutList(layouts);
        }, true);

        // updates the layouts if the reset button has been clicked
        this._resetListenerDisposer = reaction(() => this.props.Document.gridResetLayout, (reset) => {
            if (reset && this.flexGrid) {
                this.setLayout(this.childLayoutPairs.map((pair, index) => this.makeLayoutItem(pair.layout, this.unflexedPosition(index))));
            }
            this.props.Document.gridResetLayout = false;
        });
    }

    componentWillUnmount() {
        this._changeListenerDisposer?.();
        this._resetListenerDisposer?.();
    }

    unflexedPosition(index: number): Omit<Layout, "i"> {
        return {
            x: (index % Math.floor(this.numCols / this.defaultW)) * this.defaultW,
            y: Math.floor(index / Math.floor(this.numCols / this.defaultH)) * this.defaultH,
            w: this.defaultW,
            h: this.defaultH,
            static: true
        };
    }

    screenToCell(sx: number, sy: number) {
        const pt = this.props.ScreenToLocalTransform().transformPoint(sx, sy);
        const x = Math.floor(pt[0] / this.colWidthPlusGap);
        const y = Math.floor((pt[1] + this._scroll) / this.rowHeight);
        return { x, y };
    }

    makeLayoutItem = (doc: Doc, pos: { x: number, y: number }, Static: boolean = false, w: number = this.defaultW, h: number = this.defaultH) => {
        return ({ i: doc[Id], w, h, x: pos.x, y: pos.y, static: Static });
    }

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
        const xypos = this.flexGrid ? layout : this.unflexedPosition(this.layoutList.findIndex(l => l.i === layout.i));
        const pos = { x: xypos.x * this.colWidthPlusGap + this.margin, y: xypos.y * this.rowHeightPlusGap + this.margin - this._scroll };

        return this.props.ScreenToLocalTransform().translate(-pos.x, -pos.y);
    }

    /**
     * @returns the layout list converted from JSON
     */
    get parsedLayoutList() {
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
            {...this.props}
            Document={layout}
            DataDoc={layout.resolvedDataDoc as Doc}
            NativeHeight={returnZero}
            NativeWidth={returnZero}
            backgroundColor={this.props.backgroundColor}
            ContainingCollectionDoc={this.props.Document}
            PanelWidth={width}
            PanelHeight={height}
            ScreenToLocalTransform={dxf}
            onClick={this.onChildClickHandler}
            renderDepth={this.props.renderDepth + 1}
            parentActive={this.props.active}
            display={StrCast(this.props.Document.display, "contents")} // sets the css display type of the ContentFittingDocumentView component
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
            const layouts = this.parsedLayoutList;
            this.childLayoutPairs.forEach(({ layout: doc }) => {
                let gridLayout = layouts.find(gridLayout => gridLayout.i === doc[Id]);
                gridLayout && Object.assign(gridLayout, layoutArray.find(layout => layout.i === doc[Id]) || gridLayout);
            });

            this.setLayoutList(layouts);
        }
    }

    /**
     * @returns a list of `ContentFittingDocumentView`s inside wrapper divs.
     * The key of the wrapper div must be the same as the `i` value of the corresponding layout.
     */
    @computed
    private get contents(): JSX.Element[] {
        const collector: JSX.Element[] = [];
        const layouts = this.parsedLayoutList;
        if (layouts.length !== this.childLayoutPairs.length) {
            setTimeout(action(() => this.props.Document.gridResetLayout = true), 0);
        } else {
            this.layoutList.forEach((l, i) => {
                const child = this.childLayoutPairs.find(c => c.layout[Id] === l.i);
                const dxf = () => this.lookupIndividualTransform(layouts[i]);
                const width = () => (this.flexGrid ? layouts[i].w : this.defaultW) * this.colWidthPlusGap - this.margin;
                const height = () => (this.flexGrid ? layouts[i].h : this.defaultH) * this.rowHeightPlusGap - this.margin;
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
    get layoutList(): Layout[] {
        return this.flexGrid ?
            this.parsedLayoutList.map(({ i, x, y, w, h }) => ({
                i, y, h,
                x: x + w > this.numCols ? 0 : x, // handles wrapping around of nodes when numCols decreases
                w: Math.min(w, this.numCols), // reduces width if greater than numCols
                static: BoolCast(this.childLayoutPairs.find(({ layout }) => layout[Id] === i)?.layout.lockedPosition, false) // checks if the lock position item has been selected in the context menu
            })) :
            this.parsedLayoutList.map((layout, index) => Object.assign(layout, this.unflexedPosition(index)));
    }

    onInternalDrop = (e: Event, de: DragManager.DropEvent) => {
        const layouts = this.parsedLayoutList;
        const dropped = de.complete.docDragData?.droppedDocuments;
        if (dropped && super.onInternalDrop(e, de) && layouts.length !== this.childDocs.length) {
            dropped.forEach(doc => this.addLayoutItem(layouts, this.makeLayoutItem(doc, this.screenToCell(de.x, de.y)))); // shouldn't place all docs in the same cell;
            this.setLayoutList(layouts);
            return true;
        }
        return false;
    }

    /**
     * Handles the change in the value of the rowHeight slider.
     */
    @action
    onSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        this._rowHeight = event.currentTarget.valueAsNumber;
    }
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
        displayOptionsMenu.push({ description: "Contents", event: () => this.props.Document.display = "contents", icon: "copy" });
        displayOptionsMenu.push({ description: "Undefined", event: () => this.props.Document.display = undefined, icon: "exclamation" });
        ContextMenu.Instance.addItem({ description: "Display", subitems: displayOptionsMenu, icon: "tv" });
    }

    onPointerDown = (e: React.PointerEvent) => {
        if (this.props.isSelected(true)) {
            setupMoveUpEvents(this, e, returnFalse, returnFalse,
                action((e: PointerEvent, doubleTap?: boolean) => {
                    if (doubleTap) {
                        const text = Docs.Create.TextDocument("", { _width: 150, _height: 50 });
                        FormattedTextBox.SelectOnLoad = text[Id];// track the new text box so we can give it a prop that tells it to focus itself when it's displayed
                        Doc.AddDocToList(this.props.Document, this.props.fieldKey, text);
                        this.setLayoutList(this.addLayoutItem(this.parsedLayoutList, this.makeLayoutItem(text, this.screenToCell(e.clientX, e.clientY))));
                    }
                }),
                false);
            e.stopPropagation();
        }
    }

    render() {
        return (
            <div className="collectionGridView-contents" ref={this.createDashEventsTarget}
                style={{ pointerEvents: !this.props.active() && !SnappingManager.GetIsDragging() ? "none" : undefined }}
                onContextMenu={this.onContextMenu}
                onPointerDown={e => this.onPointerDown(e)} >
                <div className="collectionGridView-gridContainer" ref={this._containerRef}
                    onWheel={e => e.stopPropagation()}
                    onScroll={action(e => {
                        if (!this.props.isSelected()) e.currentTarget.scrollTop = this._scroll;
                        else this._scroll = e.currentTarget.scrollTop;
                    })} >
                    <Grid
                        width={this.props.PanelWidth()}
                        nodeList={this.contents.length ? this.contents : null}
                        layout={this.contents.length ? this.layoutList : undefined}
                        childrenDraggable={this.props.isSelected() ? true : false}
                        numCols={this.numCols}
                        rowHeight={this.rowHeight}
                        setLayout={this.setLayout}
                        transformScale={this.props.ScreenToLocalTransform().Scale}
                        compactType={StrCast(this.props.Document.gridCompaction, "vertical")} // determines whether nodes should remain in position, be bound to the top, or to the left
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