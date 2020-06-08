import { computed, observable, Lambda, action } from 'mobx';
import * as React from "react";
import { Doc, Opt } from '../../../../fields/Doc';
import { documentSchema } from '../../../../fields/documentSchemas';
import { makeInterface } from '../../../../fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast } from '../../../../fields/Types';
import { Transform } from '../../../util/Transform';
import { undoBatch } from '../../../util/UndoManager';
import { ContentFittingDocumentView } from '../../nodes/ContentFittingDocumentView';
import { CollectionSubView } from '../CollectionSubView';
import { SubCollectionViewProps } from '../CollectionSubView';
import { List } from '../../../../fields/List';
import { returnZero, returnFalse } from '../../../../Utils';
import Grid, { Layout } from "./Grid";
import { Id } from '../../../../fields/FieldSymbols';
import { observer } from 'mobx-react';
import { SnappingManager } from '../../../util/SnappingManager';
import { Docs } from '../../../documents/Documents';
import { EditableView, EditableProps } from '../../EditableView';
import "./CollectionGridView.scss";
import { ContextMenu } from '../../ContextMenu';
import { ScriptField } from '../../../../fields/ScriptField';


type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

@observer
export class CollectionGridView extends CollectionSubView(GridSchema) {
    private containerRef: React.RefObject<HTMLDivElement>;
    @observable private _scroll: number = 0; // required to make sure the decorations box container updates on scroll
    private changeListenerDisposer: Opt<Lambda>;
    private rowHeight: number = 0;

    constructor(props: Readonly<SubCollectionViewProps>) {
        super(props);

        this.props.Document.numCols = NumCast(this.props.Document.numCols, 10);
        this.props.Document.rowHeight = NumCast(this.props.Document.rowHeight, 100);

        // determines whether the grid is static/flexible i.e. can nodes be moved around and resized or not
        this.props.Document.flexGrid = BoolCast(this.props.Document.flexGrid, true);

        // determines whether nodes should remain in position, be bound to the top, or to the left
        this.props.Document.compactType = StrCast(this.props.Document.compactType, "vertical");

        // determines whether nodes should move out of the way (i.e. collide) when other nodes are dragged over them
        this.props.Document.preventCollision = BoolCast(this.props.Document.preventCollision, false);

        this.setLayout = this.setLayout.bind(this);
        this.onSliderChange = this.onSliderChange.bind(this);
        // this.deletePlaceholder = this.deletePlaceholder.bind(this);
        this.containerRef = React.createRef();
    }

    componentDidMount() {

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
                // for each document that was added, add a corresponding grid layout document

                newValue.forEach(({ layout }, i) => {
                    const targetId = layout[Id];
                    if (!layouts.find((gridLayout: Layout) => gridLayout.i === targetId)) {
                        layouts.push({
                            i: targetId,
                            w: 2,
                            h: 2,
                            x: 2 * (i % Math.floor(NumCast(this.props.Document.numCols) / 2)),
                            y: 2 * Math.floor(i / Math.floor(NumCast(this.props.Document.numCols) / 2)),
                            static: !this.props.Document.flexGrid
                        });
                    }
                });
            } else {
                // for each document that was removed, remove its corresponding grid layout document
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
    }

    componentWillUnmount() {
        this.changeListenerDisposer && this.changeListenerDisposer();
    }

    /**
     * @returns the transform that will correctly place the document decorations box. 
     */
    private lookupIndividualTransform = (layout: Layout) => {

        const index = this.childLayoutPairs.findIndex(({ layout: layoutDoc }) => layoutDoc[Id] === layout.i);

        // translations depend on whether the grid is flexible or static
        const yTranslation = (this.props.Document.flexGrid ? NumCast(layout.y) : 2 * Math.floor(index / Math.floor(NumCast(this.props.Document.numCols) / 2))) * this.rowHeightPlusGap + 10 - this._scroll + 30; // 30 is the height of the add text doc bar
        const xTranslation = (this.props.Document.flexGrid ? NumCast(layout.x) : 2 * (index % Math.floor(NumCast(this.props.Document.numCols) / 2))) * this.colWidthPlusGap + 10;

        return this.props.ScreenToLocalTransform().translate(-xTranslation, -yTranslation);
    }

    @computed get colWidthPlusGap() { return (this.props.PanelWidth() - 10) / NumCast(this.props.Document.numCols); }
    @computed get rowHeightPlusGap() { return NumCast(this.props.Document.rowHeight) + 10; }

    /**
     * @returns the layout list converted from JSON
     */
    get parsedLayoutList() { return this.props.Document.gridLayoutString ? JSON.parse(StrCast(this.props.Document.gridLayoutString)) : []; }

    /**
     * Stores the layout list on the Document as JSON
     */
    set unStringifiedLayoutList(layouts: Layout[]) { this.props.Document.gridLayoutString = JSON.stringify(layouts); }


    /**
     * Sets the width of the decorating box.
     * @param layout 
     */
    @observable private width = (layout: Layout) => (this.props.Document.flexGrid ? layout.w : 2) * this.colWidthPlusGap - 10;

    /**
     * Sets the height of the decorating box.
     * @param layout
     */
    @observable private height = (layout: Layout) => (this.props.Document.flexGrid ? layout.h : 2) * this.rowHeightPlusGap - 10;

    contextMenuItems = (layoutDoc: Doc) => {
        const layouts: Layout[] = this.parsedLayoutList;
        const freezeScript = ScriptField.MakeFunction(
            // "layouts.find(({ i }) => i === layoutDoc[Id]).static=true;" +
            // "this.unStringifiedLayoutList = layouts;" +
            "console.log(doc)", { doc: Doc.name }
        );

        // const layouts: Layout[] = this.parsedLayoutList;

        // const layoutToChange = layouts.find(({ i }) => i === layoutDoc[Id]);
        // layoutToChange!.static = !layoutToChange!.static;

        // this.unStringifiedLayoutList = layouts;

        return [{ script: freezeScript!, label: "testing" }];
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
            addDocTab={returnFalse}
            backgroundColor={this.props.backgroundColor}
            ContainingCollectionDoc={this.props.Document}
            PanelWidth={width}
            PanelHeight={height}
            ScreenToLocalTransform={dxf}
            renderDepth={this.props.renderDepth + 1}
            parentActive={this.props.active}
            display={"contents"}
            contextMenuItems={() => this.contextMenuItems(layout)}
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
        const layouts: Layout[] = this.parsedLayoutList;
        this.childLayoutPairs.forEach(({ layout: doc }) => {
            let update: Opt<Layout>;
            const targetId = doc[Id];
            const gridLayout = layouts.find(gridLayout => gridLayout.i === targetId);
            if (this.props.Document.flexGrid && gridLayout && (update = layoutArray.find(layout => layout.i === targetId))) {
                gridLayout.x = update.x;
                gridLayout.y = update.y;
                gridLayout.w = update.w;
                gridLayout.h = update.h;
            }
        });

        this.unStringifiedLayoutList = layouts;
    }

    /**
     * @returns a list of `ContentFittingDocumentView`s inside wrapper divs.
     * The key of the wrapper div must be the same as the `i` value of the corresponding layout.
     */
    @computed
    private get contents(): JSX.Element[] {
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
                // onContextMenu={() => ContextMenu.Instance.addItem({ description: "test", event: () => console.log("test"), icon: "rainbow" })}
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
        const layouts: Layout[] = this.parsedLayoutList;
        // this.unStringifiedLayoutList = layouts;

        return this.props.Document.flexGrid ?
            layouts.map(({ i, x, y, w, h, static: stat }) => ({
                i: i,
                x: x + w > NumCast(this.props.Document.numCols) ? 0 : x, // handles wrapping around of nodes when numCols decreases
                y: y,
                w: w,
                h: h,
                static: stat
            }))
            : layouts.map(({ i }, index) => ({
                i: i,
                x: 2 * (index % Math.floor(NumCast(this.props.Document.numCols) / 2)),
                y: 2 * Math.floor(index / Math.floor(NumCast(this.props.Document.numCols) / 2)),
                w: 2,
                h: 2,
                static: true
            }));
    }

    /**
     * Handles the change in the value of the rowHeight slider.
     */
    onSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        NumCast(this.props.Document.rowHeight) !== event.currentTarget.valueAsNumber;
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

    render() {

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
                // onContextMenu={() => ContextMenu.Instance.addItem({ description: "test", event: () => console.log("test"), icon: "rainbow" })}
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
                    />

                </div>
            </div >
        );
    }
}
