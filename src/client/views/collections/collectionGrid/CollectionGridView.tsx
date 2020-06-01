import { computed, observable, Lambda, action } from 'mobx';
import * as React from "react";
import { Doc, DocListCast, Opt } from '../../../../fields/Doc';
import { documentSchema } from '../../../../fields/documentSchemas';
import { makeInterface } from '../../../../fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast } from '../../../../fields/Types';
import { Transform } from '../../../util/Transform';
import { undoBatch } from '../../../util/UndoManager';
import { ContentFittingDocumentView } from '../../nodes/ContentFittingDocumentView';
import { CollectionSubView } from '../CollectionSubView';
import { SubCollectionViewProps } from '../CollectionSubView';
import { List } from '../../../../fields/List';
import { returnZero } from '../../../../Utils';
import Grid, { Layout } from "./Grid";
import { Id } from '../../../../fields/FieldSymbols';
import { observer } from 'mobx-react';
import "./CollectionGridView.scss";
import { SnappingManager } from '../../../util/SnappingManager';


type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

@observer
export class CollectionGridView extends CollectionSubView(GridSchema) {
    private containerRef: React.RefObject<HTMLDivElement>;
    @observable private _scroll: number = 0;
    private changeListenerDisposer: Opt<Lambda>;

    // private undoChangeListenerDisposer: Opt<Lambda>;

    // @observable private _layouts: Layout[] = [];

    constructor(props: Readonly<SubCollectionViewProps>) {
        super(props);

        this.props.Document.numCols = NumCast(this.props.Document.numCols, 10);
        this.props.Document.rowHeight = NumCast(this.props.Document.rowHeight, 100);
        this.props.Document.flexGrid = BoolCast(this.props.Document.flexGrid, true);

        this.setLayout = this.setLayout.bind(this);

        this.containerRef = React.createRef();
    }

    componentDidMount() {

        // this.undoChangeListenerDisposer = computed(() => this.props.Document.gridLayoutString).observe(({ newValue }) => {
        //     action(() => this._layouts = JSON.parse(newValue as string))();
        // });

        this.changeListenerDisposer = computed(() => this.childLayoutPairs).observe(({ oldValue, newValue }) => {

            if (!oldValue || newValue.length > oldValue.length) {
                const layouts: Layout[] = this.parsedLayoutList;
                // for each document that was added, add a corresponding grid layout document
                newValue.forEach(({ layout }, i) => {
                    const targetId = layout[Id];
                    if (!layouts.find((gridLayout: Layout) => gridLayout.i === targetId)) {
                        layouts.push({
                            i: targetId,
                            w: 2,
                            h: 2,
                            x: 2 * (i % Math.floor(this.props.Document.numCols as number / 2)),
                            y: 2 * Math.floor(i / Math.floor(this.props.Document.numCols as number / 2))
                        });
                    }
                });
                this.props.Document.gridLayoutString = JSON.stringify(layouts);
            } else {
                const layouts: Layout[] = this.parsedLayoutList;
                // for each document that was removed, remove its corresponding grid layout document
                oldValue.forEach(({ layout }) => {
                    const targetId = layout[Id];
                    if (!newValue.find(({ layout: preserved }) => preserved[Id] === targetId)) {
                        const index = layouts.findIndex((gridLayout: Layout) => gridLayout.i === targetId);
                        index !== -1 && action(() => layouts.splice(index, 1))();
                    }
                });
                this.props.Document.gridLayoutString = JSON.stringify(layouts);
            }

        }, true);
    }

    componentWillUnmount() {
        this.changeListenerDisposer && this.changeListenerDisposer();
        this.undoChangeListenerDisposer && this.undoChangeListenerDisposer();
    }

    /**
     * Establishes the x and y properties of the @param layoutDoc, currently
     * using the @param previousLength for the computations.
     * 
     * However, this could also be more of a first fit algorithm, iterating through
     * this.toLayoutList(DocListCast(this.props.Document.gridLayouts)) and finding the
     * first gap in the layout structure that suits the width and height. It would be
     * easiest to see that a column is free (for a given row, if two documents' x are separated
     * by a value greater than the ratio width of the document you're trying to insert),
     * but you would then have to ensure that the next row at that column has a y at least
     * as big as the ratio height of the document you're trying to insert.  
     */
    private findNextLayout(layoutDoc: Doc, previousLength: number) {
        layoutDoc.x = 2 * (previousLength % Math.floor(this.props.Document.numCols as number / 2));
        layoutDoc.y = 2 * Math.floor(previousLength / Math.floor(this.props.Document.numCols as number / 2));
    }

    /**
     * @returns the transform that will correctly place
     * the document decorations box, shifted to the right by
     * the sum of all the resolved column widths of the
     * documents before the target. 
     */
    private lookupIndividualTransform = (layout: Layout) => {

        const index = this.childLayoutPairs.findIndex(({ layout: layoutDoc }) => layoutDoc[Id] === layout.i);
        const yTranslation = (this.props.Document.flexGrid ? NumCast(layout.y) : 2 * Math.floor(index / Math.floor(this.props.Document.numCols as number / 2))) * this.rowHeightPlusGap + 10 - this._scroll;
        const xTranslation = (this.props.Document.flexGrid ? NumCast(layout.x) : 2 * (index % Math.floor(this.props.Document.numCols as number / 2))) * this.colWidthPlusGap + 10;

        return this.props.ScreenToLocalTransform().translate(-xTranslation, -yTranslation);
    }

    @computed get colWidthPlusGap() { return (this.props.PanelWidth() - 10) / NumCast(this.props.Document.numCols); }
    @computed get rowHeightPlusGap() { return NumCast(this.props.Document.rowHeight) + 10; }

    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    @computed get parsedLayoutList() { return this.props.Document.gridLayoutString ? JSON.parse(this.props.Document.gridLayoutString as string) : []; }
    @undoBatch @action set unStringifiedLayoutList(layouts: Layout[]) { this.props.Document.gridLayoutString = JSON.stringify(layouts); }

    /**
     * Sets the width of the decorating box.
     * @param Doc doc
     */
    @observable private width = (layout: Layout) => (this.props.Document.flexGrid ? layout.w : 2) * this.colWidthPlusGap - 10;

    /**
     * Sets the height of the decorating box.
     * @param doc `Doc`
     */
    @observable private height = (layout: Layout) => (this.props.Document.flexGrid ? layout.h : 2) * this.rowHeightPlusGap - 10;

    addDocTab = (doc: Doc, where: string) => {
        if (where === "inPlace" && this.layoutDoc.isInPlaceContainer) {
            this.dataDoc[this.props.fieldKey] = new List<Doc>([doc]);
            return true;
        }
        return this.props.addDocTab(doc, where);
    }

    getDisplayDoc(layout: Doc, dxf: () => Transform, width: () => number, height: () => number) {
        console.log(layout[Id]);
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
            display={"contents"} // this causes an issue- this is the reason the decorations box is weird with images and web boxes
        />;
    }

    /**
     * Saves the layouts received from the Grid to the Document.
     * @param layouts `Layout[]`
     */
    @undoBatch
    @action
    setLayout(layoutArray: Layout[]) {
        // for every child in the collection, check to see if there's a corresponding grid layout document and
        // updated layout object. If both exist, which they should, update the grid layout document from the updated object 
        const layouts: Layout[] = this.parsedLayoutList;
        this.childLayoutPairs.forEach(({ layout: doc }) => {
            let update: Opt<Layout>;
            const targetId = doc[Id];
            const gridLayout = layouts.find(gridLayout => gridLayout.i === targetId);
            // const gridLayout = DocListCast(this.props.Document.gridLayouts).find(gridLayout => StrCast(gridLayout.i) === targetId);
            if (this.props.Document.flexGrid && gridLayout && (update = layoutArray.find(layout => layout.i === targetId))) {
                gridLayout.x = update.x;
                gridLayout.y = update.y;
                gridLayout.w = update.w;
                gridLayout.h = update.h;
            }
        });

        this.props.Document.gridLayoutString = JSON.stringify(layouts);
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
        if (!layouts || !layouts.length || layouts.length !== childLayoutPairs.length) {
            return [];
        }

        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            const gridLayout = layouts[i];
            const dxf = () => this.lookupIndividualTransform(gridLayout);
            const width = () => this.width(gridLayout);
            const height = () => this.height(gridLayout);
            collector.push(
                <div className={"document-wrapper"}
                    key={gridLayout.i}
                >
                    {this.getDisplayDoc(layout, dxf, width, height)}
                </div>
            );
        }

        return collector;
    }

    /**
     * @returns a list of Layouts from a list of Docs
     * @param docLayoutList `Doc[]`
     */
    get layoutList(): Layout[] {
        const layouts: Layout[] = this.parsedLayoutList;
        if (this.props.Document.flexGrid) {
            return layouts.map(({ i, x, y, w, h }) => ({
                i: i,
                x: x,
                y: y,
                w: w,
                h: h,
                static: false
            }));
        }
        else {
            return layouts.map(({ i }, index) => ({
                i: i,
                x: 2 * (index % Math.floor(this.props.Document.numCols as number / 2)),
                y: 2 * Math.floor(index / Math.floor(this.props.Document.numCols as number / 2)),
                w: 2,
                h: 2,
                static: true
            }));
        }
    }

    /**
     * DocListCast only includes *resolved* documents, i.e. filters out promises. So even if we have a nonzero
     * number of documents in either of these Dash lists on the document, the DocListCast version may evaluate to empty
     * if the corresponding documents are all promises, waiting to be fetched from the server. If we don't return early
     * in the event that promises are encountered, we might feed inaccurate data to the grid since the corresponding gridLayout
     * documents are unresolved (or the grid may misinterpret an empty array) which has the unfortunate byproduct of triggering
     * the setLayout event, which makes these unintended changes permanent by writing them to the likely now resolved documents.
     */
    render() {
        const childDocumentViews: JSX.Element[] = this.contents;
        const layouts: Layout[] = this.parsedLayoutList;
        if (!childDocumentViews.length || !layouts.length) {
            return null;
        }
        return (
            <div className="collectionGridView-contents"
                style={{
                    marginLeft: NumCast(this.props.Document._xMargin), marginRight: NumCast(this.props.Document._xMargin),
                    marginTop: NumCast(this.props.Document._yMargin), marginBottom: NumCast(this.props.Document._yMargin),
                    pointerEvents: !this.props.isSelected() && this.props.renderDepth !== 0 && !this.props.ContainingCollectionView?._isChildActive && !SnappingManager.GetIsDragging() ? "none" : undefined
                }}
                ref={this.createDashEventsTarget}
                onPointerDown={e => {
                    if (this.props.active(true)) {
                        if (this.props.isSelected(true)) {
                            e.stopPropagation();
                        }
                    }
                    if (this.props.isSelected(true)) {
                        !((e.target as any)?.className.includes("react-resizable-handle")) && e.preventDefault();
                    }
                }} // the grid doesn't stopPropagation when its widgets are hit, so we need to otherwise the outer documents will respond
            >
                <div className="collectionGridView-gridContainer"
                    ref={this.containerRef}
                    onScroll={action((e: React.UIEvent<HTMLDivElement>) => this._scroll = e.currentTarget.scrollTop)}
                >
                    {/* {console.log(this.toLayoutList(layoutDocList))} */}
                    <Grid
                        width={this.props.PanelWidth()}
                        nodeList={childDocumentViews}
                        layout={this.layoutList}
                        childrenDraggable={this.props.isSelected() ? true : false}
                        numCols={this.props.Document.numCols as number}
                        rowHeight={this.props.Document.rowHeight as number}
                        setLayout={this.setLayout}
                        //setLayout={(layout: Layout[]) => this.setLayout(layout)}
                        transformScale={this.props.ScreenToLocalTransform().Scale}
                    // flex={this.props.Document.flexGrid as boolean}
                    />
                </div>
            </div>
        );
    }
}
