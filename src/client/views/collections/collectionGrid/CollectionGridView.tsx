import { computed, observable, Lambda, action, reaction } from 'mobx';
import * as React from "react";
import { Doc, Opt } from '../../../../fields/Doc';
import { documentSchema } from '../../../../fields/documentSchemas';
import { makeInterface } from '../../../../fields/Schema';
import { BoolCast, NumCast, StrCast, ScriptCast } from '../../../../fields/Types';
import { Transform } from '../../../util/Transform';
import { undoBatch } from '../../../util/UndoManager';
import { ContentFittingDocumentView } from '../../nodes/ContentFittingDocumentView';
import { CollectionSubView } from '../CollectionSubView';
import { SubCollectionViewProps } from '../CollectionSubView';
import { returnZero } from '../../../../Utils';
import Grid, { Layout } from "./Grid";
import { Id } from '../../../../fields/FieldSymbols';
import { observer } from 'mobx-react';
import { SnappingManager } from '../../../util/SnappingManager';
import { Docs } from '../../../documents/Documents';
import { EditableView, EditableProps } from '../../EditableView';
import "./CollectionGridView.scss";
import { ContextMenu } from '../../ContextMenu';
import { List } from '../../../../fields/List';
import { ContextMenuProps } from '../../ContextMenuItem';


type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

@observer
export class CollectionGridView extends CollectionSubView(GridSchema) {
    private containerRef: React.RefObject<HTMLDivElement>;
    @observable private _scroll: number = 0; // required to make sure the decorations box container updates on scroll
    private changeListenerDisposer: Opt<Lambda>; // listens for changes in this.childLayoutPairs
    private rowHeight: number = 0; // temporary store of row height to make change undoable
    private mounted: boolean = false; // hack to fix the issue of not rerendering when mounting
    private resetListenerDisposer: Opt<Lambda>; // listens for when the reset button is clicked

    constructor(props: Readonly<SubCollectionViewProps>) {
        super(props);

        this.props.Document.numCols = NumCast(this.props.Document.numCols, 10);
        this.props.Document.rowHeight = NumCast(this.props.Document.rowHeight, 100);

        // determines whether the grid is static/flexible i.e. whether can nodes be moved around and resized or not
        this.props.Document.flexGrid = BoolCast(this.props.Document.flexGrid, true);

        // determines whether nodes should remain in position, be bound to the top, or to the left
        this.props.Document.compactType = StrCast(this.props.Document.compactType, "vertical");

        // determines whether nodes should move out of the way (i.e. collide) when other nodes are dragged over them
        this.props.Document.preventCollision = BoolCast(this.props.Document.preventCollision, false);

        this.props.Document.defaultW = NumCast(this.props.Document.defaultW, 2);
        this.props.Document.defaultH = NumCast(this.props.Document.defaultH, 2);

        this.props.Document.margin = NumCast(this.props.Document.margin, 10);

        this.props.Document.display = StrCast(this.props.Document.display, "contents");

        this.setLayout = this.setLayout.bind(this);
        this.onSliderChange = this.onSliderChange.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);

        this.containerRef = React.createRef();
    }

    componentDidMount() {

        console.log("mounting");
        this.mounted = true;

        this.changeListenerDisposer = computed(() => this.childLayoutPairs).observe(({ oldValue, newValue }) => {

            const layouts: Layout[] = this.parsedLayoutList;

            // if grid view has been opened and then exited and a document has been deleted
            // this deletes the layout of that document from the layouts list

            if (!oldValue && newValue.length) {
                layouts.forEach(({ i }, index) => {
                    const targetId = i;
                    if (!newValue.find(({ layout: preserved }) => preserved[Id] === targetId)) {
                        layouts.splice(index, 1);
                    }
                });
            }

            if (!oldValue || newValue.length > oldValue.length) {
                // for each document that was added, add a corresponding grid layout object
                newValue.forEach(({ layout }, i) => {
                    const targetId = layout[Id];
                    if (!layouts.find((gridLayout: Layout) => gridLayout.i === targetId)) {
                        layouts.push({
                            i: targetId,
                            w: this.defaultW,
                            h: this.defaultH,
                            x: this.defaultW * (i % Math.floor(NumCast(this.props.Document.numCols) / this.defaultW)),
                            y: this.defaultH * Math.floor(i / Math.floor(NumCast(this.props.Document.numCols) / this.defaultH)),
                            static: !this.props.Document.flexGrid
                        });
                    }
                });
            } else {
                // for each document that was removed, remove its corresponding grid layout object
                oldValue.forEach(({ layout }) => {
                    const targetId = layout[Id];
                    if (!newValue.find(({ layout: preserved }) => preserved[Id] === targetId)) {
                        const index = layouts.findIndex((gridLayout: Layout) => gridLayout.i === targetId);
                        index !== -1 && layouts.splice(index, 1);
                    }
                });
            }
            this.unStringifiedLayoutList = layouts;
        }, true);

        // updates the layouts if the reset button has been clicked
        this.resetListenerDisposer = reaction(() => this.props.Document.resetLayout, () => {
            if (this.props.Document.flexGrid) {
                const layouts: Layout[] = this.parsedLayoutList;
                this.setLayout(
                    layouts.map(({ i }, index) => ({
                        i: i,
                        x: this.defaultW * (index % Math.floor(NumCast(this.props.Document.numCols) / this.defaultW)),
                        y: this.defaultH * Math.floor(index / Math.floor(NumCast(this.props.Document.numCols) / this.defaultH)),
                        w: this.defaultW,
                        h: this.defaultH,
                    })));
            }
            this.props.Document.resetLayout = false;
        });
    }

    componentWillUnmount() {
        console.clear();
        this.mounted = false;
        this.changeListenerDisposer && this.changeListenerDisposer();
        this.resetListenerDisposer?.();
    }

    /**
     * @returns the transform that will correctly place the document decorations box. 
     */
    private lookupIndividualTransform = (layout: Layout) => {

        console.log("lookup");

        const index = this.childLayoutPairs.findIndex(({ layout: layoutDoc }) => layoutDoc[Id] === layout.i);

        // translations depend on whether the grid is flexible or static
        const xTranslation = (this.props.Document.flexGrid ? NumCast(layout.x) : this.defaultW * (index % Math.floor(NumCast(this.props.Document.numCols) / this.defaultW))) * this.colWidthPlusGap + this.margin;
        const yTranslation = (this.props.Document.flexGrid ? NumCast(layout.y) : this.defaultH * Math.floor(index / Math.floor(NumCast(this.props.Document.numCols) / this.defaultH))) * this.rowHeightPlusGap + this.margin - this._scroll + 30; // 30 is the height of the add text doc bar

        return this.props.ScreenToLocalTransform().translate(-xTranslation, -yTranslation);
    }

    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    addDocTab = (doc: Doc, where: string) => {
        if (where === "inPlace" && this.layoutDoc.isInPlaceContainer) {
            this.dataDoc[this.props.fieldKey] = new List<Doc>([doc]);
            return true;
        }
        return this.props.addDocTab(doc, where);
    }

    @computed get colWidthPlusGap() { return (this.props.PanelWidth() - this.margin) / NumCast(this.props.Document.numCols); }
    @computed get rowHeightPlusGap() { return NumCast(this.props.Document.rowHeight) + this.margin; }

    @computed get margin() { return NumCast(this.props.Document.margin); }
    @computed get defaultW() { return NumCast(this.props.Document.defaultW); }
    @computed get defaultH() { return NumCast(this.props.Document.defaultH); }

    /**
     * @returns the layout list converted from JSON
     */
    get parsedLayoutList() {
        console.log("parsedlayoutlist");
        return this.props.Document.gridLayoutString ? JSON.parse(StrCast(this.props.Document.gridLayoutString)) : [];
    }

    /**
     * Stores the layout list on the Document as JSON
     */
    set unStringifiedLayoutList(layouts: Layout[]) {

        // sometimes there are issues with rendering when you switch from a different view
        // where the nodes are all squeezed together on the left hand side of the screen
        // until you click on the screen or close the chrome or interact with it in some way
        // the component doesn't rerender when the component mounts
        // this seems to fix that though it isn't very elegant

        console.log("setting unstringified");
        this.mounted && (this.props.Document.gridLayoutString = "");
        this.props.Document.gridLayoutString = JSON.stringify(layouts);
        this.mounted = false;
    }


    /**
     * Sets the width of the decorating box.
     * @param layout 
     */
    @observable private width = (layout: Layout) => (this.props.Document.flexGrid ? layout.w : this.defaultW) * this.colWidthPlusGap - this.margin;

    /**
     * Sets the height of the decorating box.
     * @param layout
     */
    @observable private height = (layout: Layout) => (this.props.Document.flexGrid ? layout.h : this.defaultH) * this.rowHeightPlusGap - this.margin;

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
            addDocTab={this.addDocTab}
            backgroundColor={this.props.backgroundColor}
            ContainingCollectionDoc={this.props.Document}
            PanelWidth={width}
            PanelHeight={height}
            ScreenToLocalTransform={dxf}
            onClick={this.onChildClickHandler}
            renderDepth={this.props.renderDepth + 1}
            parentActive={this.props.active}
            display={StrCast(this.props.Document.display)}
        />;
    }

    /**
     * Saves the layouts received from the Grid to the Document.
     * @param layouts `Layout[]`
     */
    @undoBatch
    @action
    setLayout(layoutArray: Layout[]) {
        // for every child in the collection, check to see if there's a corresponding grid layout object and
        // updated layout object. If both exist, which they should, update the grid layout object from the updated object 

        console.log("settinglayout");

        if (this.props.Document.flexGrid) {
            const layouts: Layout[] = this.parsedLayoutList;
            this.childLayoutPairs.forEach(({ layout: doc }) => {
                let update: Opt<Layout>;
                const targetId = doc[Id];
                const gridLayout = layouts.find(gridLayout => gridLayout.i === targetId);
                if (gridLayout && (update = layoutArray.find(layout => layout.i === targetId))) {
                    gridLayout.x = update.x;
                    gridLayout.y = update.y;
                    gridLayout.w = update.w;
                    gridLayout.h = update.h;
                }
            });

            this.unStringifiedLayoutList = layouts;
        }
    }

    /**
     * @returns a list of `ContentFittingDocumentView`s inside wrapper divs.
     * The key of the wrapper div must be the same as the `i` value of the corresponding layout.
     */
    @computed
    private get contents(): JSX.Element[] {

        console.log("getting contents");

        const { childLayoutPairs } = this;
        const collector: JSX.Element[] = [];
        const layouts: Layout[] = this.parsedLayoutList;
        if (!layouts.length || layouts.length !== childLayoutPairs.length) {
            return [];
        }

        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            const gridLayout = layouts[i];
            const dxf = () => this.lookupIndividualTransform(gridLayout);
            const width = () => this.width(gridLayout);
            const height = () => this.height(gridLayout);
            collector.push(
                <div className={this.props.Document.flexGrid && (this.props.isSelected() ? true : false) ? "document-wrapper" : "document-wrapper static"}
                    key={gridLayout.i}
                >
                    {this.getDisplayDoc(layout, dxf, width, height)}
                </div >
            );
        }

        return collector;
    }

    /**
     * @returns a list of `Layout` objects with attributes depending on whether the grid is flexible or static
     */
    get layoutList(): Layout[] {

        console.log("getting layoutlist");
        const layouts: Layout[] = this.parsedLayoutList;


        return this.props.Document.flexGrid ?
            layouts.map(({ i, x, y, w, h }) => ({
                i: i,
                x: x + w > NumCast(this.props.Document.numCols) ? 0 : x, // handles wrapping around of nodes when numCols decreases
                y: y,
                w: w > NumCast(this.props.Document.numCols) ? NumCast(this.props.Document.numCols) : w, // reduces width if greater than numCols
                h: h,
                static: BoolCast(this.childLayoutPairs.find(({ layout }) => layout[Id] === i)?.layout.lockedPosition, false) // checks if the lock position item has been selected in the context menu
            }))
            : layouts.map(({ i }, index) => ({
                i: i,
                x: this.defaultW * (index % Math.floor(NumCast(this.props.Document.numCols) / this.defaultW)),
                y: this.defaultH * Math.floor(index / Math.floor(NumCast(this.props.Document.numCols) / this.defaultH)),
                w: this.defaultW,
                h: this.defaultH,
                static: true
            }));
    }

    /**
     * Handles the change in the value of the rowHeight slider.
     */
    onSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.Document.rowHeight = event.currentTarget.valueAsNumber;
    }

    /**
     * Saves the rowHeight in a temporary variable to make it undoable later.
     */
    onSliderDown = () => {
        this.rowHeight = NumCast(this.props.Document.rowHeight);
    }

    /**
     * Uses the stored rowHeight to make the rowHeight change undoable.
     */
    onSliderUp = () => {
        const tempVal = this.props.Document.rowHeight;
        this.props.Document.rowHeight = this.rowHeight;
        undoBatch(() => this.props.Document.rowHeight = tempVal)();
    }

    /**
     * Creates a text document and adds it to the grid.
     */
    @undoBatch @action addTextDocument = (value: string) => this.props.addDocument(Docs.Create.TextDocument(value, { title: value }));

    onContextMenu = () => {
        const displayOptionsMenu: ContextMenuProps[] = [];
        displayOptionsMenu.push({ description: "Contents", event: () => this.props.Document.display = "contents", icon: "copy" });
        displayOptionsMenu.push({ description: "Undefined", event: () => this.props.Document.display = undefined, icon: "exclamation" });

        ContextMenu.Instance.addItem({ description: "Display", subitems: displayOptionsMenu, icon: "tv" });
    }

    render() {

        console.log("and render");
        // for the add text document EditableView
        const newEditableViewProps: EditableProps = {
            GetValue: () => "",
            SetValue: this.addTextDocument,
            contents: "+ ADD TEXT DOCUMENT",
        };

        const childDocumentViews: JSX.Element[] = this.contents;
        const chromeStatus = this.props.Document._chromeStatus;
        const showChrome = (chromeStatus !== 'view-mode' && chromeStatus !== 'disabled');

        return (
            <div className="collectionGridView-contents"
                style={{
                    pointerEvents: !this.props.active() && !SnappingManager.GetIsDragging() ? "none" : undefined
                }}
                onContextMenu={this.onContextMenu}
                ref={this.createDashEventsTarget}
                onPointerDown={e => {
                    if (this.props.active(true)) {
                        if (this.props.isSelected(true)) {
                            e.stopPropagation();
                        }
                    }
                    // is the following section needed? it prevents the slider from being easily used and I'm not sure what it's preventing

                    // if (this.props.isSelected(true)) {
                    //     !((e.target as any)?.className.includes("react-resizable-handle")) && e.preventDefault();
                    // }

                }} // the grid doesn't stopPropagation when its widgets are hit, so we need to otherwise the outer documents will respond
            >
                {showChrome ?
                    <div className="collectionGridView-addDocumentButton">
                        <EditableView {...newEditableViewProps} />
                    </div> : null
                }
                <div className="collectionGridView-gridContainer"
                    ref={this.containerRef}
                    onScroll={action(e => {
                        if (!this.props.isSelected()) e.currentTarget.scrollTop = this._scroll;
                        else this._scroll = e.currentTarget.scrollTop;
                    })}
                    onWheel={e => e.stopPropagation()}
                >
                    <input className="rowHeightSlider" type="range" value={NumCast(this.props.Document.rowHeight)} onPointerDown={this.onSliderDown} onPointerUp={this.onSliderUp} onChange={this.onSliderChange} style={{ width: this.props.PanelHeight() - 40 }} min={1} max={this.props.PanelHeight() - 40} />
                    <Grid
                        width={this.props.PanelWidth()}
                        nodeList={childDocumentViews.length ? childDocumentViews : null}
                        layout={childDocumentViews.length ? this.layoutList : undefined}
                        childrenDraggable={this.props.isSelected() ? true : false}
                        numCols={NumCast(this.props.Document.numCols)}
                        rowHeight={NumCast(this.props.Document.rowHeight)}
                        setLayout={this.setLayout}
                        transformScale={this.props.ScreenToLocalTransform().Scale}
                        compactType={StrCast(this.props.Document.compactType)}
                        preventCollision={BoolCast(this.props.Document.preventCollision)}
                        margin={this.margin}
                    />

                </div>
            </div >
        );
    }
}
