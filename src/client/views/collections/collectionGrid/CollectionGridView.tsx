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
import { returnZero } from '../../../../Utils';
import Grid, { Layout } from "./Grid";
import { Id } from '../../../../fields/FieldSymbols';
import { observer } from 'mobx-react';
import { SnappingManager } from '../../../util/SnappingManager';
import { Docs } from '../../../documents/Documents';
import { EditableView, EditableProps } from '../../EditableView';
import "./CollectionGridView.scss";


type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

@observer
export class CollectionGridView extends CollectionSubView(GridSchema) {
    private containerRef: React.RefObject<HTMLDivElement>;
    @observable private _scroll: number = 0;
    private changeListenerDisposer: Opt<Lambda>;
    private rowHeight: number = 0;

    constructor(props: Readonly<SubCollectionViewProps>) {
        super(props);

        this.props.Document.numCols = NumCast(this.props.Document.numCols, 10);
        this.props.Document.rowHeight = NumCast(this.props.Document.rowHeight, 100);
        this.props.Document.flexGrid = BoolCast(this.props.Document.flexGrid, true);

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
                            y: 2 * Math.floor(i / Math.floor(NumCast(this.props.Document.numCols) / 2))
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
        console.log("unmounted")
    }

    // deletePlaceholder(placeholder: Layout, e: MouseEvent) {

    //     const { left, right, top, bottom } = this.containerRef.current!.getBoundingClientRect();
    //     if (e.clientX > right || e.clientX < left || e.clientY < top || e.clientY > bottom) {
    //         const layouts: Layout[] = this.parsedLayoutList;
    //         const index = layouts.findIndex((gridLayout: Layout) => gridLayout.i === placeholder.i);
    //         index !== -1 && layouts.splice(index, 1);

    //         const i = this.childLayoutPairs.findIndex(({ layout }) => placeholder.i === layout.i);
    //         i !== -1 && this.childLayoutPairs.splice(i, 1);

    //         console.log("deleting");

    //         this.unStringifiedLayoutList = layouts;
    //     }

    // }


    /**
     * @returns the transform that will correctly place
     * the document decorations box, shifted to the right by
     * the sum of all the resolved column widths of the
     * documents before the target. 
     */
    private lookupIndividualTransform = (layout: Layout) => {

        const index = this.childLayoutPairs.findIndex(({ layout: layoutDoc }) => layoutDoc[Id] === layout.i);
        const yTranslation = (this.props.Document.flexGrid ? NumCast(layout.y) : 2 * Math.floor(index / Math.floor(NumCast(this.props.Document.numCols) / 2))) * this.rowHeightPlusGap + 10 - this._scroll + 30; // 30 is the height of the add text doc bar
        const xTranslation = (this.props.Document.flexGrid ? NumCast(layout.x) : 2 * (index % Math.floor(NumCast(this.props.Document.numCols) / 2))) * this.colWidthPlusGap + 10;

        return this.props.ScreenToLocalTransform().translate(-xTranslation, -yTranslation);
    }

    @computed get colWidthPlusGap() { return (this.props.PanelWidth() - 10) / NumCast(this.props.Document.numCols); }
    @computed get rowHeightPlusGap() { return NumCast(this.props.Document.rowHeight) + 10; }

    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    get parsedLayoutList() { return this.props.Document.gridLayoutString ? JSON.parse(StrCast(this.props.Document.gridLayoutString)) : []; }
    set unStringifiedLayoutList(layouts: Layout[]) { this.props.Document.gridLayoutString = JSON.stringify(layouts); }


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

        return this.props.Document.flexGrid ?
            layouts : layouts.map(({ i }, index) => ({
                i: i,
                x: 2 * (index % Math.floor(NumCast(this.props.Document.numCols) / 2)),
                y: 2 * Math.floor(index / Math.floor(NumCast(this.props.Document.numCols) / 2)),
                w: 2,
                h: 2,
                static: true
            }));
    }

    onSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.Document.rowHeight = event.currentTarget.valueAsNumber;
    }

    onSliderDown = () => {
        this.rowHeight = NumCast(this.props.Document.rowHeight);
    }

    onSliderUp = () => {
        const tempVal = this.props.Document.rowHeight;
        this.props.Document.rowHeight = this.rowHeight;
        undoBatch(() => this.props.Document.rowHeight = tempVal)();
    }

    @undoBatch @action addTextDocument = (value: string) => this.props.addDocument(Docs.Create.TextDocument(value, { title: value }));

    /**
     * DocListCast only includes *resolved* documents, i.e. filters out promises. So even if we have a nonzero
     * number of documents in either of these Dash lists on the document, the DocListCast version may evaluate to empty
     * if the corresponding documents are all promises, waiting to be fetched from the server. If we don't return early
     * in the event that promises are encountered, we might feed inaccurate data to the grid since the corresponding gridLayout
     * documents are unresolved (or the grid may misinterpret an empty array) which has the unfortunate byproduct of triggering
     * the setLayout event, which makes these unintended changes permanent by writing them to the likely now resolved documents.
     */
    render() {
        const newEditableViewProps: EditableProps = {
            GetValue: () => "",
            SetValue: this.addTextDocument,
            contents: "+ ADD TEXT DOCUMENT AT END",
        };

        const childDocumentViews: JSX.Element[] = this.contents;
        const chromeStatus = this.props.Document._chromeStatus;
        const showChrome = (chromeStatus !== 'view-mode' && chromeStatus !== 'disabled');

        return (
            <div className="collectionGridView-contents"
                style={{
                    // marginLeft: NumCast(this.props.Document._xMargin), marginRight: NumCast(this.props.Document._xMargin),
                    // marginTop: NumCast(this.props.Document._yMargin), marginBottom: NumCast(this.props.Document._yMargin),
                    pointerEvents: !this.props.active() && !SnappingManager.GetIsDragging() ? "none" : undefined
                }}
                ref={this.createDashEventsTarget}
                onPointerDown={e => {
                    if (this.props.active(true)) {
                        if (this.props.isSelected(true)) {
                            e.stopPropagation();
                        }
                    }
                    // is the following section needed? it prevents the slider from being easily used and I'm not sure what it's preventing

                    // if (this.props.isSelected(true)) {
                    // !((e.target as any)?.className.includes("react-resizable-handle")) && e.preventDefault();
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
                    <input className="rowHeightSlider" type="range" value={NumCast(this.props.Document.rowHeight)} onPointerDown={this.onSliderDown} onPointerUp={this.onSliderUp} onChange={this.onSliderChange} style={{ width: this.props.PanelHeight() - 40 }} min={1} max={this.props.PanelHeight() - 40} onPointerEnter={e => e.currentTarget.focus()} />
                    <Grid
                        width={this.props.PanelWidth()}
                        nodeList={childDocumentViews.length ? childDocumentViews : null}
                        layout={childDocumentViews.length ? this.layoutList : undefined}
                        childrenDraggable={this.props.isSelected() ? true : false}
                        numCols={NumCast(this.props.Document.numCols)}
                        rowHeight={NumCast(this.props.Document.rowHeight)}
                        setLayout={this.setLayout}
                        transformScale={this.props.ScreenToLocalTransform().Scale}
                    // deletePlaceholder={this.deletePlaceholder}
                    />

                </div>
            </div >
        );
    }
}
